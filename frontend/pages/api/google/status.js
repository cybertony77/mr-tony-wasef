import { authMiddleware } from '../../../lib/authMiddleware';
import { getGoogleMeetIntegration, isGoogleMeetConfigured } from '../../../lib/googleServer';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    if (!isGoogleMeetConfigured()) {
      return res.json({ configured: false, connected: false, email: '' });
    }

    const integration = await getGoogleMeetIntegration();

    return res.json({
      configured: true,
      connected: Boolean(integration?.refreshTokenEnc),
      email: integration?.email || '',
      connectedAt: integration?.connectedAt || null,
      shared: true,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Failed to load Google status' });
  }
}
