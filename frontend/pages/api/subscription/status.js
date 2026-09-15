import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import {isForbiddenError, forbiddenJson} from '../../../lib/requireStaff';
import { getSubscriptionStatus } from '../../../lib/subscriptionGuard';

/**
 * Minimal subscription status for admin/assistant/developer.
 * Returns ONLY { active, date_of_expiration } — no cost/note/full record.
 * Used by UserMenu timer + _app 3-day warning.
 * Full CRUD remains on GET/POST/PUT/PATCH /api/subscription (developer only).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);

    if (!['admin', 'assistant', 'developer'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const status = await getSubscriptionStatus({ bypassCache: false });
    return res.status(200).json({
      active: Boolean(status.active),
      date_of_expiration: status.date_of_expiration || null,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (isForbiddenError(error)) {
      return res.status(403).json(forbiddenJson(error));
    }
    console.error('subscription/status error:', error?.message || error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
