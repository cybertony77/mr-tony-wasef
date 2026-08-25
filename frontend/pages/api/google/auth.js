import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';
import { getGoogleAuthUrl, isGoogleMeetConfigured } from '../../../lib/googleServer';

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index === -1) return;
      const key = trimmed.substring(0, index).trim();
      let value = trimmed.substring(index + 1).trim();
      value = value.replace(/^"|"$/g, '');
      envVars[key] = value;
    });
    return envVars;
  } catch {
    return {};
  }
}

const envConfig = loadEnvConfig();
const JWT_SECRET = envConfig.JWT_SECRET || process.env.JWT_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    if (!isGoogleMeetConfigured()) {
      return res.status(500).json({ error: 'Google Meet OAuth is not configured' });
    }

    const ownerUserId = user.assistant_id ?? user.id;
    const state = jwt.sign(
      {
        purpose: 'google_meet_oauth',
        assistant_id: ownerUserId,
        role: user.role,
        connected_by: user.email || user.username || String(ownerUserId),
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const url = getGoogleAuthUrl(state);
    return res.json({ url });
  } catch (error) {
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Failed to start Google OAuth' });
  }
}
