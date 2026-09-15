import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import { streamCloudinaryPrivateImage } from '../../../lib/cloudinaryImageProxy';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

/**
 * Authenticated same-origin proxy for private Cloudinary images.
 * GET /api/media/cloudinary-image?public_id=...
 *
 * Streams image bytes — Cloudinary signed URLs stay on the server.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);
    if (!['student', 'admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const publicId = String(req.query.public_id || '').trim();
    if (!publicId) {
      return res.status(400).json({ error: 'public_id is required' });
    }

    // Basic path safety — reject absolute URLs / traversal
    if (publicId.includes('://') || publicId.includes('..')) {
      return res.status(400).json({ error: 'Invalid public_id' });
    }

    if (req.method === 'HEAD') {
      const { getSignedImageUrlServer } = await import('../../../lib/cloudinary');
      const signedUrl = await getSignedImageUrlServer(publicId);
      if (!signedUrl) return res.status(500).json({ error: 'Failed to resolve image' });
      const upstream = await fetch(signedUrl, { method: 'HEAD' });
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      res.setHeader('Cache-Control', 'private, max-age=600');
      return res.end();
    }

    const handled = await streamCloudinaryPrivateImage(res, publicId);
    if (!handled && !res.headersSent) {
      return res.status(500).json({ error: 'Failed to generate image' });
    }
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('cloudinary-image proxy error:', error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}
