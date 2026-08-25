import { MongoClient } from 'mongodb';
import { authMiddleware } from '../../../lib/authMiddleware';
import { getMongoFromEnv } from '../../../lib/marketingPageMongo';
import { formatEgyptDateTime, nowEgyptDate } from '../../../lib/egyptDateTime';

function canManage(role) {
  return role === 'admin' || role === 'developer' || role === 'assistant';
}

function normalizeRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 5) return 5;
  return Math.round(n * 2) / 2;
}

function parseOptionalScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return n;
}

export default async function handler(req, res) {
  const { MONGO_URI, DB_NAME, envConfig } = getMongoFromEnv();
  const isNational =
    envConfig.NATIONAL_SYSTEM === 'true' || process.env.NATIONAL_SYSTEM === 'true';
  const courseLabel = isNational ? 'Grade' : 'Course';
  const scoreLabel = isNational ? 'Degree' : 'Score';

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
      const testimonials = await db
        .collection('testimonials')
        .find({})
        .sort({ id: -1 })
        .toArray();
      return res.status(200).json({
        testimonials: testimonials.map((t) => ({
          ...t,
          from_public: Boolean(t.from_public),
        })),
        canManage: canManage(dbUser.role),
      });
    }

    if (req.method === 'POST') {
      if (!canManage(dbUser.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const name = String(req.body?.name || '').trim();
      const course = String(req.body?.course || '').trim();
      const text = String(req.body?.text || '').trim();
      const score = parseOptionalScore(req.body?.score);
      const rating = normalizeRating(req.body?.rating);
      const stateRaw = String(req.body?.state || '').trim();
      const state =
        stateRaw === 'Activated' || stateRaw === 'Deactivated' ? stateRaw : '';

      if (!name) {
        return res.status(400).json({ error: '❌ Name is required' });
      }
      if (!course) {
        return res.status(400).json({ error: `❌ ${courseLabel} is required` });
      }
      if (Number.isNaN(score)) {
        return res.status(400).json({ error: `❌ ${scoreLabel} must be a valid number` });
      }
      if (!text) {
        return res.status(400).json({ error: '❌ Message is required' });
      }
      if (rating <= 0) {
        return res.status(400).json({ error: '❌ Star rating is required' });
      }
      if (!state) {
        return res.status(400).json({ error: '❌ State is required' });
      }

      const last = await db.collection('testimonials').findOne({}, { sort: { id: -1 } });
      const nextId = last?.id ? Number(last.id) + 1 : 1;

      const createdAt = nowEgyptDate();
      const testimonial = {
        id: nextId,
        name,
        course,
        score,
        text,
        rating,
        state,
        from_public: false,
        createdAt,
        createdAtEgypt: formatEgyptDateTime(createdAt),
      };

      await db.collection('testimonials').insertOne(testimonial);
      return res.status(200).json({ success: true, testimonial });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('testimonials API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
