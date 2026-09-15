import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import { buildCloudinaryImageProxyPath } from '../../../lib/cloudinaryImageProxy';

/**
 * GET /api/certificates/image-url?public_id=certificates/...
 * Returns a same-origin proxy URL (never a Cloudinary signed URL).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const publicId = String(req.query.public_id || '').trim();
    if (!publicId) {
      return res.status(400).json({ error: 'public_id is required' });
    }

    if (!publicId.startsWith('certificates/')) {
      return res.status(403).json({ error: 'Invalid certificate image id' });
    }

    return res.status(200).json({ url: buildCloudinaryImageProxyPath(publicId) });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Certificate image-url error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
