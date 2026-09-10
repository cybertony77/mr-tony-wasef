/**
 * Server-only SEO helpers (fs / env.config). Do not import from client components.
 */

import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import { getSiteName, getSiteOrigin, normalizeOrigin, truncateMeta } from './seo';

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

export function getServerSeoConfig() {
  const env = loadEnvConfig();
  const siteName =
    String(env.SYSTEM_NAME || process.env.SYSTEM_NAME || '').trim() ||
    getSiteName();
  const origin =
    normalizeOrigin(env.SYSTEM_DOMAIN || process.env.SYSTEM_DOMAIN || '') ||
    getSiteOrigin();
  return { siteName, origin, env };
}

/**
 * Public welcome-page SEO extras from marketing + activated testimonials.
 * Never includes student IDs, attendance, grades charts, or signed URLs.
 */
export async function fetchWelcomeSeoExtras() {
  const { siteName, origin, env } = getServerSeoConfig();
  const mongoUri = env.MONGO_URI || process.env.MONGO_URI;
  const dbName = env.DB_NAME || process.env.DB_NAME;
  if (!mongoUri || !dbName) {
    return {
      siteName,
      origin,
      description: null,
      ratingValue: null,
      reviewCount: 0,
    };
  }

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const marketing = await db.collection('marketing_page').findOne({});
    const description = truncateMeta(
      String(marketing?.teacher_description || '').trim(),
      160
    );

    const activated = await db
      .collection('testimonials')
      .find({ state: 'Activated' })
      .project({ rating: 1 })
      .toArray();

    const ratings = activated
      .map((t) => Number(t.rating))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);

    const reviewCount = ratings.length;
    const ratingValue =
      reviewCount > 0
        ? ratings.reduce((sum, n) => sum + n, 0) / reviewCount
        : null;

    return {
      siteName,
      origin,
      description: description || null,
      ratingValue,
      reviewCount,
    };
  } catch (err) {
    console.error('[seo] fetchWelcomeSeoExtras failed:', err?.message || err);
    return {
      siteName,
      origin,
      description: null,
      ratingValue: null,
      reviewCount: 0,
    };
  } finally {
    if (client) await client.close();
  }
}
