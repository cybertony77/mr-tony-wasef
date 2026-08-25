import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import { authMiddleware } from '../../../lib/authMiddleware';
import { getMongoFromEnv } from '../../../lib/marketingPageMongo';

const PAGE_SLUG = 'leave-a-review';

function canManage(role) {
  return role === 'admin' || role === 'developer' || role === 'assistant';
}

function isMarketingEnabled() {
  try {
    const candidates = [
      path.join(process.cwd(), '..', 'env.config'),
      path.join(process.cwd(), 'env.config'),
    ];
    const envPath = candidates.find((p) => fs.existsSync(p));
    if (envPath) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        if (key !== 'SYSTEM_MARKETING_PAGE') continue;
        let value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        return value === 'true';
      }
    }
  } catch {
    // fall through
  }
  return process.env.SYSTEM_MARKETING_PAGE === 'true';
}

async function getOrNullPage(db) {
  return (
    (await db.collection('public_testimonials').findOne({ slug: PAGE_SLUG })) ||
    (await db.collection('public_testimonials').findOne({}))
  );
}

export default async function handler(req, res) {
  if (!isMarketingEnabled()) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { MONGO_URI, DB_NAME } = getMongoFromEnv();

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    let user;
    try {
      user = await authMiddleware(req);
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const dbUser = await db.collection('users').findOne({ id: user.assistant_id });
    if (!dbUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method === 'GET') {
      const page = await getOrNullPage(db);
      const pendingCount = await db.collection('testimonials').countDocuments({
        from_public: true,
        state: 'Pending',
      });

      return res.status(200).json({
        page: page || null,
        pendingCount,
        canManage: canManage(dbUser.role),
        publicPath: `/${PAGE_SLUG}`,
      });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      if (!canManage(dbUser.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const text = String(req.body?.text || '').trim();
      const image = String(req.body?.image || '').trim();
      const visibilityState = String(req.body?.visibilityState || '').trim();
      let imagePosX = Number(req.body?.imagePosX);
      let imagePosY = Number(req.body?.imagePosY);
      if (!Number.isFinite(imagePosX)) imagePosX = 50;
      if (!Number.isFinite(imagePosY)) imagePosY = 50;
      imagePosX = Math.min(100, Math.max(0, imagePosX));
      imagePosY = Math.min(100, Math.max(0, imagePosY));

      if (!text) {
        return res.status(400).json({ error: '❌ Text is required' });
      }
      if (!image) {
        return res.status(400).json({ error: '❌ Image is required' });
      }
      if (visibilityState !== 'Activated' && visibilityState !== 'Deactivated') {
        return res.status(400).json({ error: '❌ Visibility state is required' });
      }

      const existing = await getOrNullPage(db);
      const now = new Date();

      if (existing) {
        await db.collection('public_testimonials').updateOne(
          { _id: existing._id },
          {
            $set: {
              slug: PAGE_SLUG,
              text,
              image,
              imagePosX,
              imagePosY,
              visibilityState,
              updatedAt: now,
            },
          }
        );
        return res.status(200).json({
          success: true,
          page: {
            ...existing,
            slug: PAGE_SLUG,
            text,
            image,
            imagePosX,
            imagePosY,
            visibilityState,
            updatedAt: now,
          },
        });
      }

      const last = await db.collection('public_testimonials').findOne({}, { sort: { id: -1 } });
      const nextId = last?.id ? Number(last.id) + 1 : 1;
      const page = {
        id: nextId,
        slug: PAGE_SLUG,
        text,
        image,
        imagePosX,
        imagePosY,
        visibilityState,
        createdAt: now,
      };
      await db.collection('public_testimonials').insertOne(page);
      return res.status(200).json({ success: true, page });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('public_testimonials API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
