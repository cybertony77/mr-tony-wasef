import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import {requireStaff, isForbiddenError, forbiddenJson} from '../../../lib/requireStaff';
import { createPublicStudentPath } from '../../../lib/hmacServer';

/**
 * GET /api/students/public-link?id=123
 * Staff-only: returns server-signed public student_info URL.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);
    await requireStaff(user);

    const id = String(req.query.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const path = createPublicStudentPath(id);
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const origin = host ? `${proto}://${host}` : '';

    return res.status(200).json({
      path,
      url: origin ? `${origin}${path}` : path,
      sig: path.includes('sig=') ? path.split('sig=')[1] : null,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (isForbiddenError(error)) {
      return res.status(403).json(forbiddenJson(error));
    }
    console.error('public-link error:', error);
    return res.status(500).json({ error: 'Failed to generate link' });
  }
}
