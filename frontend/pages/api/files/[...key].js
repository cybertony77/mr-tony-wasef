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
    responseLimit: false,
  },
};

const ALLOWED_PREFIXES = ['pdfs/'];

function getContentType(key) {
  const lower = String(key || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

/**
 * Same-origin authenticated proxy for R2 files (PDFs, etc.).
 * GET /api/files/pdfs/material/....pdf
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
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

  try {
    const range = req.headers.range;
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

    const totalSize = Number(head.ContentLength || 0);
    const contentType = head.ContentType || getContentType(objectKey);
    const wantDownload = String(req.query.download || '') === '1';
    const downloadName =
      typeof req.query.filename === 'string' && req.query.filename.trim()
        ? path.basename(req.query.filename.trim())
        : path.basename(objectKey) || 'file.pdf';

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (wantDownload) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${downloadName.replace(/"/g, '')}"`
      );
    } else {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${downloadName.replace(/"/g, '')}"`
      );
    }

    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', String(totalSize));
      return res.status(200).end();
    }

    const getParams = { Bucket: cfg.bucketName, Key: objectKey };
    let status = 200;
    let start = 0;
    let end = totalSize > 0 ? totalSize - 1 : 0;

    if (range && totalSize > 0) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        start = match[1] ? parseInt(match[1], 10) : 0;
        end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
          res.setHeader('Content-Range', `bytes */${totalSize}`);
          return res.status(416).end();
        }
        end = Math.min(end, totalSize - 1);
        getParams.Range = `bytes=${start}-${end}`;
        status = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Content-Length', String(end - start + 1));
      }
    } else {
      res.setHeader('Content-Length', String(totalSize));
    }

    const result = await client.send(new GetObjectCommand(getParams));
    res.status(status);

    const body = result.Body;
    if (!body) {
      return res.status(502).json({ error: 'Empty file stream' });
    }

    const stream =
      typeof body.transformToWebStream === 'function'
        ? Readable.fromWeb(body.transformToWebStream())
        : body;

    const cleanup = () => {
      try {
        if (stream && typeof stream.destroy === 'function') stream.destroy();
      } catch { /* ignore */ }
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    stream.on('error', () => {
      cleanup();
      if (!res.headersSent) res.status(502).end();
      else res.end();
    });
    stream.pipe(res);
  } catch (error) {
    console.error('R2 file proxy error:', error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to load file' });
    }
    res.end();
  }
}
