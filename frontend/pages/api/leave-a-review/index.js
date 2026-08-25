import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import { getMongoFromEnv } from '../../../lib/marketingPageMongo';
import { formatEgyptDateTime, nowEgyptDate } from '../../../lib/egyptDateTime';

const PAGE_SLUG = 'leave-a-review';

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

export default async function handler(req, res) {
  if (!isMarketingEnabled()) {
    return res.status(404).json({ error: 'Review page not found' });
  }

  const { MONGO_URI, DB_NAME, envConfig } = getMongoFromEnv();
  const isNational =
    envConfig.NATIONAL_SYSTEM === 'true' || process.env.NATIONAL_SYSTEM === 'true';
  const courseLabel = isNational ? 'Grade' : 'Course';
  const scoreLabel = isNational ? 'Degree' : 'Score';

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const page =
      (await db.collection('public_testimonials').findOne({ slug: PAGE_SLUG })) ||
      (await db.collection('public_testimonials').findOne({}));

    if (req.method === 'GET') {
      if (!page || page.visibilityState === 'Deactivated') {
        return res.status(404).json({ error: 'Review page not found' });
      }

      return res.status(200).json({
        page: {
          slug: PAGE_SLUG,
          text: page.text,
          image: page.image,
          imagePosX: Number.isFinite(Number(page.imagePosX)) ? Number(page.imagePosX) : 50,
          imagePosY: Number.isFinite(Number(page.imagePosY)) ? Number(page.imagePosY) : 50,
        },
      });
    }

    if (req.method === 'POST') {
      if (!page || page.visibilityState === 'Deactivated') {
        return res.status(404).json({ error: 'Review page not found' });
      }

      const name = String(req.body?.name || '').trim();
      const course = String(req.body?.course || '').trim();
      const score = parseOptionalScore(req.body?.score);
      const text = String(req.body?.text || req.body?.message || '').trim();
      const rating = normalizeRating(req.body?.rating);

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
        state: 'Pending',
        from_public: true,
        public_slug: PAGE_SLUG,
        createdAt,
        createdAtEgypt: formatEgyptDateTime(createdAt),
      };

      await db.collection('testimonials').insertOne(testimonial);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('leave-a-review API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
