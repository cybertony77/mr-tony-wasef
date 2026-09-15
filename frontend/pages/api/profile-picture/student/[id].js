import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../../lib/authMiddleware';
import { verifySignature } from '../../../../lib/hmacServer';
import { streamCloudinaryPrivateImage } from '../../../../lib/cloudinaryImageProxy';

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
  envConfig.MONGO_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/demo-attendance-system';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'demo-attendance-system';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

/**
 * Student profile picture.
 * - Default (JSON): { url: same-origin stream path } — never Cloudinary signed URL
 * - ?binary=1: streams image bytes (for <img src>)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, sig } = req.query;
    const wantBinary =
      String(req.query.binary || '') === '1' ||
      req.method === 'HEAD' ||
      String(req.headers.accept || '').includes('image/');

    let isPublicAccess = false;
    if (sig) {
      const studentIdFromQuery = String(id || '').trim();
      const signature = String(sig).trim();
      if (studentIdFromQuery && signature) {
        isPublicAccess = verifySignature(studentIdFromQuery, signature);
        if (!isPublicAccess) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
    }

    let user = null;
    if (!isPublicAccess) {
      try {
        user = await authMiddleware(req);
        if (user.role !== 'admin' && user.role !== 'assistant' && user.role !== 'developer') {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } catch {
        if (!sig) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    if (!id) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    let client;
    try {
      client = await MongoClient.connect(MONGO_URI);
      const db = client.db(DB_NAME);
      const userId = /^\d+$/.test(id) ? Number(id) : id;

      const userDoc = await db.collection('users').findOne(
        { id: userId, role: 'student' },
        { projection: { profile_picture: 1, id: 1, role: 1 } }
      );

      if (!userDoc || !userDoc.profile_picture) {
        if (wantBinary) {
          return res.status(404).json({ error: 'No profile picture' });
        }
        return res.status(200).json({ url: null });
      }

      const publicId = userDoc.profile_picture;
      const sigQs = sig ? `&sig=${encodeURIComponent(String(sig))}` : '';
      const proxyUrl = `/api/profile-picture/student/${encodeURIComponent(String(id))}?binary=1${sigQs}`;

      if (wantBinary) {
        if (req.method === 'HEAD') {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'private, max-age=300');
          return res.status(200).end();
        }
        const handled = await streamCloudinaryPrivateImage(res, publicId);
        if (!handled && !res.headersSent) {
          return res.status(500).json({ error: 'Failed to load image' });
        }
        return;
      }

      return res.status(200).json({ url: proxyUrl });
    } finally {
      if (client) await client.close();
    }
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'No token provided') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    console.error('Error getting student profile picture:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
