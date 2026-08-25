import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

/**
 * Process-wide Mongo client for video-path hot code (Google assign checks, marketing allowlist).
 * Avoids connect/close storms under concurrent video requests.
 * Do not close after each request — reuse until process exit.
 */

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index === -1) return;
      const key = trimmed.substring(0, index).trim();
      let value = trimmed.substring(index + 1).trim();
      value = value.replace(/^"|"$/g, '');
      envVars[key] = value;
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

const globalKey = '__demoSharedMongoClientV1';

export function getSharedMongoUri() {
  return { MONGO_URI, DB_NAME };
}

export async function getSharedMongoClient() {
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = { client: null, connecting: null };
  }
  const slot = globalThis[globalKey];

  if (slot.client) {
    // Recover if a prior close/topology destroy left a dead client in the slot.
    try {
      const topology = slot.client.topology;
      if (topology?.isDestroyed?.()) {
        slot.client = null;
      } else {
        return slot.client;
      }
    } catch {
      slot.client = null;
    }
  }

  if (slot.connecting) {
    return slot.connecting;
  }

  slot.connecting = MongoClient.connect(MONGO_URI, {
    maxPoolSize: 20,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
  })
    .then((client) => {
      slot.client = client;
      slot.connecting = null;
      return client;
    })
    .catch((err) => {
      slot.connecting = null;
      throw err;
    });

  return slot.connecting;
}

export async function getSharedDb() {
  const client = await getSharedMongoClient();
  return client.db(DB_NAME);
}

export async function withSharedDb(fn) {
  const db = await getSharedDb();
  return fn(db);
}

/** Optional clean shutdown for process exit hooks — never call from video handlers. */
export async function closeSharedMongoClient() {
  if (!globalThis[globalKey]) return;
  const slot = globalThis[globalKey];
  const client = slot.client;
  slot.client = null;
  slot.connecting = null;
  if (client) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
}
