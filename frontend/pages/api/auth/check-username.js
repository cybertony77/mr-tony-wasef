import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, '');
          envVars[key] = value;
        }
      }
    });
    return envVars;
  } catch {
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'topphysics';

/**
 * Lightweight username availability check for edit profile / assistant forms.
 * Any authenticated staff (admin/assistant/developer) may call this.
 * Does NOT return the assistants list.
 *
 * GET /api/auth/check-username?username=foo&exclude=currentId
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (!['admin', 'assistant', 'developer'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const raw = req.query.username ?? req.query.id ?? '';
    const username = String(raw).replace(/[$]/g, '').trim();
    if (!username) {
      return res.status(400).json({ error: 'username is required' });
    }

    const exclude = req.query.exclude != null ? String(req.query.exclude).trim() : '';

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const idCandidates = [username];
    if (/^\d+$/.test(username)) {
      idCandidates.push(Number(username));
    }

    const existing = await db.collection('users').findOne(
      { id: { $in: idCandidates } },
      { projection: { id: 1 } }
    );

    if (!existing) {
      return res.status(200).json({ exists: false });
    }

    // Treat current user's own id as available when editing
    if (exclude && String(existing.id) === exclude) {
      return res.status(200).json({ exists: false });
    }

    return res.status(200).json({ exists: true });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('check-username error:', error?.message || error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
