import { authMiddleware } from '../../../lib/authMiddleware';
import { listGoogleMeetRecordings } from '../../../lib/googleServer';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const nextPageToken = String(req.query.next_page_token || '');
    const payload = await listGoogleMeetRecordings(null, nextPageToken);

    return res.json({
      recordings: payload.recordings,
      next_page_token: payload.next_page_token,
    });
  } catch (error) {
    const status = error?.statusCode || error?.response?.status || 500;
    const code = error?.code || '';
    if (code === 'GOOGLE_NOT_CONNECTED' || status === 403) {
      return res.status(403).json({
        error: 'Google account connection required.',
        code: 'GOOGLE_NOT_CONNECTED',
      });
    }
    console.error('[google-recordings] failed', error?.message || error);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'Failed to fetch Google Meet recordings',
      details: error?.message || 'Unknown error',
    });
  }
}
