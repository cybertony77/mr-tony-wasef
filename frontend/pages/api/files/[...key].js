import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { Readable } from 'stream';
import { authMiddleware } from '../../../lib/authMiddleware';
import {
  assertR2Config,
  assertSafeObjectKey,
  createR2S3ClientForGetPresign,
  getR2Config,
} from '../../../lib/r2Server';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

const ALLOWED_PREFIXES = ['pdfs/'];
/** Prefer larger pipe buffers for multi‑MB PDFs. */
const STREAM_HIGH_WATER_MARK = 1024 * 1024; // 1 MiB

function getContentType(key) {
  const lower = String(key || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function parseBytesRange(rangeHeader, totalSize) {
  if (!rangeHeader || totalSize <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
  if (!match) return null;
  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start < 0) start = 0;
  if (end >= totalSize) end = totalSize - 1;
  if (start > end || start >= totalSize) return { unsatisfiable: true };
  return { start, end };
}

function pipeBodyToResponse(body, req, res) {
  if (!body) {
    if (!res.headersSent) res.status(502).json({ error: 'Empty file stream' });
    return;
  }

  let stream;
  if (typeof body.transformToWebStream === 'function') {
    stream = Readable.fromWeb(body.transformToWebStream(), {
      highWaterMark: STREAM_HIGH_WATER_MARK,
    });
  } else if (typeof body.pipe === 'function') {
    stream = body;
    if (typeof stream.setMaxListeners === 'function') stream.setMaxListeners(0);
  } else {
    if (!res.headersSent) res.status(502).json({ error: 'Unsupported file stream' });
    return;
  }

  const cleanup = () => {
    try {
      if (stream && typeof stream.destroy === 'function') stream.destroy();
    } catch {
      /* ignore */
    }
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  stream.on('error', (err) => {
    console.error('R2 file stream error:', err?.message || err);
    cleanup();
    if (!res.headersSent) res.status(502).end();
    else res.end();
  });

  // Disable Nagle for lower latency on first PDF.js range chunks
  if (typeof res.socket?.setNoDelay === 'function') {
    try {
      res.socket.setNoDelay(true);
    } catch {
      /* ignore */
    }
  }

  stream.pipe(res);
}

/**
 * Same-origin authenticated proxy for R2 files (PDFs, etc.).
 * GET /api/files/pdfs/material/....pdf
 *
 * Optimized for large PDFs + pdf.js Range requests:
 * - streaming body (no full buffer)
 * - Accept-Ranges / 206 Partial Content
 * - short private cache so reopen / range chunks are faster
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Avoid Next default socket timeouts killing long PDF transfers
  try {
    if (typeof req.setTimeout === 'function') req.setTimeout(0);
    if (typeof res.setTimeout === 'function') res.setTimeout(0);
  } catch {
    /* ignore */
  }

  try {
    await authMiddleware(req);
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { key: keyParts } = req.query;
  if (!keyParts || (Array.isArray(keyParts) && keyParts.length === 0)) {
    return res.status(400).json({ error: 'File key is required' });
  }

  const objectKey = (Array.isArray(keyParts) ? keyParts : [keyParts])
    .map((p) => decodeURIComponent(String(p)))
    .join('/');

  try {
    assertSafeObjectKey(objectKey);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.message });
  }

  if (!ALLOWED_PREFIXES.some((p) => objectKey.startsWith(p))) {
    return res.status(403).json({ error: 'Access denied for this file path' });
  }

  let cfg;
  try {
    cfg = getR2Config();
    assertR2Config(cfg);
  } catch {
    return res.status(500).json({ error: 'R2 configuration is missing' });
  }

  const client = createR2S3ClientForGetPresign(cfg);
  const rangeHeader = req.headers.range;
  const wantDownload = String(req.query.download || '') === '1';
  const downloadName =
    typeof req.query.filename === 'string' && req.query.filename.trim()
      ? path.basename(req.query.filename.trim())
      : path.basename(objectKey) || 'file.pdf';

  try {
    // Need total size for Content-Range when client sends Range (pdf.js).
    // Skip Head on plain full GET to save one R2 round-trip.
    let totalSize = 0;
    let headContentType = null;

    if (rangeHeader || req.method === 'HEAD') {
      let head;
      try {
        head = await client.send(
          new HeadObjectCommand({ Bucket: cfg.bucketName, Key: objectKey })
        );
      } catch (e) {
        if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') {
          return res.status(404).json({ error: 'File not found' });
        }
        throw e;
      }
      totalSize = Number(head.ContentLength || 0);
      headContentType = head.ContentType || null;
    }

    const contentType = headContentType || getContentType(objectKey);

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    // Private short cache: speeds up pdf.js range re-fetches / reopen in-session
    res.setHeader('Cache-Control', 'private, max-age=600, stale-while-revalidate=120');
    res.setHeader('Vary', 'Cookie, Authorization, Range');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${wantDownload ? 'attachment' : 'inline'}; filename="${downloadName.replace(/"/g, '')}"`
    );

    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', String(totalSize));
      return res.status(200).end();
    }

    const getParams = { Bucket: cfg.bucketName, Key: objectKey };
    let status = 200;

    if (rangeHeader && totalSize > 0) {
      const parsed = parseBytesRange(rangeHeader, totalSize);
      if (!parsed) {
        // Malformed range — fall through to full object
      } else if (parsed.unsatisfiable) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      } else {
        getParams.Range = `bytes=${parsed.start}-${parsed.end}`;
        status = 206;
        res.setHeader(
          'Content-Range',
          `bytes ${parsed.start}-${parsed.end}/${totalSize}`
        );
        res.setHeader('Content-Length', String(parsed.end - parsed.start + 1));
      }
    }

    const result = await client.send(new GetObjectCommand(getParams));

    if (status !== 206) {
      const len = Number(result.ContentLength || totalSize || 0);
      if (len > 0) res.setHeader('Content-Length', String(len));
      // Prefer R2 content-type when Head was skipped
      if (result.ContentType) res.setHeader('Content-Type', result.ContentType);
    } else if (result.ContentRange && !res.getHeader('Content-Range')) {
      res.setHeader('Content-Range', result.ContentRange);
    }

    res.status(status);
    pipeBodyToResponse(result.Body, req, res);
  } catch (error) {
    console.error('R2 file proxy error:', error?.message || error);
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
      if (!res.headersSent) return res.status(404).json({ error: 'File not found' });
    }
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to load file' });
    }
    res.end();
  }
}
