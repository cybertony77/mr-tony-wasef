import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

function loadEnvConfig() {
  try {
    const candidates = [
      path.join(process.cwd(), '..', 'env.config'),
      path.join(process.cwd(), 'env.config'),
    ];
    let envContent = null;
    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        break;
      }
    }
    if (!envContent) return {};
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

export function isSubscriptionSystemEnabled() {
  const env = loadEnvConfig();
  const raw = env.SYSTEM_SUBSCRIPTION || process.env.SYSTEM_SUBSCRIPTION;
  const normalized = String(raw || '').toLowerCase().trim();
  return normalized === 'true' || normalized === '1';
}

function getMongoConfig() {
  const env = loadEnvConfig();
  return {
    uri: env.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics',
    dbName: env.DB_NAME || process.env.DB_NAME || 'topphysics',
  };
}

/** In-memory cache so we don't hit Mongo on every staff API call */
let statusCache = {
  checkedAt: 0,
  active: false,
  date_of_expiration: null,
};

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Load subscription, auto-expire if past date, return minimal status.
 */
export async function getSubscriptionStatus({ bypassCache = false } = {}) {
  const now = Date.now();
  if (
    !bypassCache &&
    statusCache.checkedAt &&
    now - statusCache.checkedAt < CACHE_TTL_MS
  ) {
    return {
      active: statusCache.active,
      date_of_expiration: statusCache.date_of_expiration,
    };
  }

  const { uri, dbName } = getMongoConfig();
  let client;
  try {
    client = await MongoClient.connect(uri);
    const db = client.db(dbName);
    let subscription = await db.collection('subscription').findOne({});

    if (!subscription) {
      statusCache = {
        checkedAt: now,
        active: false,
        date_of_expiration: null,
      };
      return { active: false, date_of_expiration: null };
    }

    if (subscription.active && subscription.date_of_expiration) {
      const exp = new Date(subscription.date_of_expiration).getTime();
      if (now >= exp) {
        await db.collection('subscription').updateOne(
          {},
          {
            $set: {
              active: false,
              subscription_duration: null,
              date_of_subscription: null,
              date_of_expiration: null,
              cost: null,
              note: null,
            },
          }
        );
        subscription = {
          ...subscription,
          active: false,
          date_of_expiration: null,
        };
      }
    }

    const active = Boolean(subscription.active);
    const date_of_expiration = subscription.date_of_expiration || null;

    statusCache = {
      checkedAt: Date.now(),
      active,
      date_of_expiration,
    };

    return { active, date_of_expiration };
  } finally {
    if (client) await client.close();
  }
}

export function invalidateSubscriptionStatusCache() {
  statusCache = { checkedAt: 0, active: false, date_of_expiration: null };
}

/**
 * Block admin/assistant when subscription is inactive/expired.
 * Developer and student always pass.
 */
export async function assertStaffSubscriptionAccess(user) {
  if (!isSubscriptionSystemEnabled()) return;
  if (!user) return;
  if (user.role === 'developer' || user.role === 'student') return;
  if (user.role !== 'admin' && user.role !== 'assistant') return;

  const status = await getSubscriptionStatus();
  const now = Date.now();
  let allowed = Boolean(status.active);

  if (allowed && status.date_of_expiration) {
    if (now >= new Date(status.date_of_expiration).getTime()) {
      allowed = false;
    }
  }

  if (!allowed) {
    const err = new ForbiddenError('subscription_inactive');
    err.code = 'subscription_inactive';
    throw err;
  }
}
