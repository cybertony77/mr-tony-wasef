import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import { authMiddleware, isAuthError } from '../../lib/authMiddleware';

const ALLOWED_ROLES = new Set(['admin', 'assistant', 'student']);

function loadEnvConfig() {
  try {
    const candidates = [
      path.join(process.cwd(), '..', 'env.config'),
      path.join(process.cwd(), 'env.config'),
    ];
    const envPath = candidates.find((p) => fs.existsSync(p));
    if (!envPath) return {};

    const envVars = {};
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const index = trimmed.indexOf('=');
        if (index === -1) return;
        const key = trimmed.substring(0, index).trim();
        let value = trimmed.substring(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        envVars[key] = value;
      });
    return envVars;
  } catch {
    return {};
  }
}

function resolveAppVideosJsonPath() {
  const candidates = [
    path.join(process.cwd(), '..', 'app_videos.json'),
    path.join(process.cwd(), 'app_videos.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function normalizeIncomingVideo(video, index) {
  if (!video || typeof video !== 'object') return null;

  const title = String(video.video_title || '').trim();
  const role = String(video.video_role || '').trim().toLowerCase();
  const url = String(video.video_url || '').trim();

  if (!title || !ALLOWED_ROLES.has(role) || !/^https?:\/\//i.test(url)) return null;

  return {
    video_title: title,
    video_role: role,
    video_url: url,
    sort_order: Number.isFinite(Number(video.sort_order))
      ? Number(video.sort_order)
      : index,
  };
}

function toClientVideo(doc, index) {
  return {
    id: String(doc._id || `app-video-${index + 1}`),
    video_title: String(doc.video_title || '').trim(),
    video_role: String(doc.video_role || '').trim().toLowerCase(),
    video_url: String(doc.video_url || '').trim(),
    sort_order: Number.isFinite(Number(doc.sort_order)) ? Number(doc.sort_order) : index,
  };
}

async function loadUserRole(db, decoded) {
  if (!decoded?.assistant_id) return null;
  const user = await db.collection('users').findOne(
    { id: decoded.assistant_id },
    { projection: { role: 1 } }
  );
  return user?.role || null;
}

async function seedFromJsonIfEmpty(collection) {
  const count = await collection.countDocuments();
  if (count > 0) return;

  const jsonPath = resolveAppVideosJsonPath();
  if (!jsonPath) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const now = new Date();
    const docs = parsed
      .map((item, index) => normalizeIncomingVideo(item, index))
      .filter(Boolean)
      .map((item) => ({
        ...item,
        createdAt: now,
        updatedAt: now,
      }));

    if (docs.length) {
      await collection.insertMany(docs);
    }
  } catch (error) {
    console.error('Failed to seed app_videos from JSON:', error);
  }
}

export default async function handler(req, res) {
  const envConfig = loadEnvConfig();
  const MONGO_URI =
    envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/demo-attendance-system';
  const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'demo-attendance-system';

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    const collection = db.collection('app_videos');

    await seedFromJsonIfEmpty(collection);

    if (req.method === 'GET') {
      const docs = await collection.find({}).sort({ sort_order: 1, _id: 1 }).toArray();
      const videos = docs
        .map((doc, index) => toClientVideo(doc, index))
        .filter((v) => v.video_title && v.video_role && /^https?:\/\//i.test(v.video_url));

      let canManage = false;
      try {
        const decoded = await authMiddleware(req);
        const role = await loadUserRole(db, decoded);
        canManage = role === 'developer';
      } catch {
        canManage = false;
      }

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ videos, canManage });
    }

    if (req.method === 'PUT') {
      let decoded;
      try {
        decoded = await authMiddleware(req);
      } catch (error) {
        if (isAuthError(error)) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        throw error;
      }

      const role = await loadUserRole(db, decoded);
      if (role !== 'developer') {
        return res.status(403).json({ error: 'Only developers can manage app videos' });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const incoming = Array.isArray(body.videos) ? body.videos : null;
      if (!incoming) {
        return res.status(400).json({ error: 'videos array is required' });
      }

      const normalized = [];
      for (let i = 0; i < incoming.length; i += 1) {
        const item = normalizeIncomingVideo(incoming[i], i);
        if (!item) {
          return res.status(400).json({
            error: `Invalid video at position ${i + 1}. Title, role (admin/assistant/student), and https URL are required.`,
          });
        }
        normalized.push(item);
      }

      const now = new Date();
      await collection.deleteMany({});
      if (normalized.length) {
        await collection.insertMany(
          normalized.map((item) => ({
            ...item,
            createdAt: now,
            updatedAt: now,
          }))
        );
      }

      const docs = await collection.find({}).sort({ sort_order: 1, _id: 1 }).toArray();
      const videos = docs.map((doc, index) => toClientVideo(doc, index));

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ videos, success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('app-videos API error:', error);
    return res.status(500).json({
      error: 'Could not process app videos',
      videos: [],
    });
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    }
  }
}
