import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';
import { streamCloudinaryPrivateImage } from '../../../lib/cloudinaryImageProxy';

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

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

/**
 * Streams the current user's profile picture (auth cookie required).
 * Cloudinary signed URL never reaches the browser.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);
    const userId = user.assistant_id || user.id;

    let client;
    try {
      client = await MongoClient.connect(MONGO_URI);
      const db = client.db(DB_NAME);
      const userDoc = await db.collection('users').findOne(
        { id: userId },
        { projection: { profile_picture: 1 } }
      );

      if (!userDoc?.profile_picture) {
        return res.status(404).json({ error: 'No profile picture' });
      }

      if (req.method === 'HEAD') {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.status(200).end();
      }

      const handled = await streamCloudinaryPrivateImage(res, userDoc.profile_picture);
      if (!handled && !res.headersSent) {
        return res.status(500).json({ error: 'Failed to load image' });
      }
    } finally {
      if (client) await client.close();
    }
  } catch (error) {
    if (
      error.message === 'Unauthorized' ||
      error.message === 'No token provided' ||
      error.message === 'Token expired' ||
      error.message === 'Invalid token'
    ) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('profile-picture/image error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}
