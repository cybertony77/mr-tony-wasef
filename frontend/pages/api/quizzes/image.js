import { authMiddleware } from '../../../lib/authMiddleware';
import { buildCloudinaryImageProxyPath } from '../../../lib/cloudinaryImageProxy';

/**
 * Returns a same-origin proxy URL for a quiz question image.
 * Cloudinary signed URLs stay on the server.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);

    if (!['student', 'admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { public_id } = req.query;

    if (!public_id) {
      return res.status(400).json({ error: 'public_id is required' });
    }

    res.status(200).json({ url: buildCloudinaryImageProxyPath(String(public_id)) });
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'No token provided') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.error('Error getting quiz image URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
