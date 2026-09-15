import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';

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
const MONGO_URI =
  envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'topphysics';

/**
 * Returns a same-origin image URL (never a Cloudinary signed URL).
 * GET /api/profile-picture/signed-url → { url: '/api/profile-picture/image' }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);

    let client;
    try {
      client = await MongoClient.connect(MONGO_URI);
      const db = client.db(DB_NAME);

      const userDoc = await db.collection('users').findOne(
        { id: user.assistant_id || user.id },
        { projection: { profile_picture: 1 } }
      );

      if (!userDoc || !userDoc.profile_picture) {
        return res.status(200).json({ url: null });
      }

      // Cache-bust when the public_id changes so the avatar refreshes after upload
      const v = encodeURIComponent(String(userDoc.profile_picture).slice(-24));
      return res.status(200).json({ url: `/api/profile-picture/image?v=${v}` });
    } finally {
      if (client) await client.close();
    }
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'No token provided') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error getting profile picture URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
