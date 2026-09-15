import { Readable } from 'stream';
import { authMiddleware } from '../../lib/authMiddleware';
import { isCloudinaryPdfUrl } from '../../lib/pdfViewerUrl';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

function forwardHeader(upstream, res, name) {
  const value = upstream.headers.get(name);
  if (value) res.setHeader(name, value);
}

/**
 * Same-origin proxy for Cloudinary PDFs (and other allowed hosts) so pdf.js
 * can use Range requests + cookies without browser CORS blocking.
 *
 * GET /api/pdf-proxy?url=https://res.cloudinary.com/.../file.pdf
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const urlParam = req.query.url;
  if (typeof urlParam !== 'string' || !urlParam.trim()) {
    return res.status(400).json({ error: 'url query parameter is required' });
  }

  const targetHref = urlParam.trim();
  if (!isCloudinaryPdfUrl(targetHref)) {
    return res.status(403).json({ error: 'Only Cloudinary PDF URLs are allowed' });
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetHref);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  const upstreamHeaders = {};
  if (req.headers.range) {
    upstreamHeaders.Range = String(req.headers.range);
  }

  try {
    const upstream = await fetch(targetUrl.href, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
    });

    res.status(upstream.status);
    forwardHeader(upstream, res, 'content-type');
    forwardHeader(upstream, res, 'accept-ranges');
    forwardHeader(upstream, res, 'content-range');
    forwardHeader(upstream, res, 'content-length');
    res.setHeader('Cache-Control', 'private, max-age=600, stale-while-revalidate=120');
    res.setHeader('Vary', 'Cookie, Authorization, Range');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');

    if (req.method === 'HEAD') {
      return res.end();
    }

    if (!upstream.ok && !upstream.body) {
      return res.end();
    }

    if (!upstream.body) {
      return res.status(502).json({ error: 'Empty upstream response' });
    }

    Readable.fromWeb(upstream.body).on('error', (err) => {
      console.error('pdf-proxy stream error:', err?.message || err);
      if (!res.headersSent) res.status(502);
      res.end();
    }).pipe(res);
  } catch (error) {
    console.error('pdf-proxy error:', error?.message || error);
    if (!res.headersSent) {
      return res.status(502).json({ error: 'Failed to load PDF from storage' });
    }
    res.end();
  }
}
