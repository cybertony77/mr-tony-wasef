import { authMiddleware } from '../../../lib/authMiddleware';
import { disconnectGoogleMeetIntegration } from '../../../lib/googleServer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    await disconnectGoogleMeetIntegration();
    return res.json({ success: true, connected: false });
  } catch (error) {
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Failed to disconnect Google' });
  }
}
