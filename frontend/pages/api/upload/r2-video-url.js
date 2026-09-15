/**
 * R2 video playback via same-origin authenticated proxy.
 * Presigned R2 URLs never reach the browser.
 *
 * Previously returned { signedUrl }. Now returns a same-origin path only.
 * Kept for backward compatibility — prefer using /api/files/... directly.
 */
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import { assertSafeObjectKey } from '../../../lib/r2Server';

function getKeyFromRequest(req) {
  if (req.method === 'GET') {
    const raw = req.query.key;
    if (Array.isArray(raw)) return raw[0];
    return raw;
  }
  return req.body?.key;
}

function buildFilesProxyPath(key) {
  return `/api/files/${String(key)
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await authMiddleware(req);

    let key;
    try {
      key = getKeyFromRequest(req);
      assertSafeObjectKey(key);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ error: e.message });
    }

    if (!String(key).startsWith('videos/')) {
      return res.status(403).json({ error: 'Only video keys are allowed' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    // Same-origin proxy URL — no R2 presigned URL in the response
    res.json({
      url: buildFilesProxyPath(key),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('R2 video URL error:', error);
    const status = error.statusCode || 500;
    res.status(status).json({
      error: 'Failed to resolve video URL',
      details: error.message,
    });
  }
}
