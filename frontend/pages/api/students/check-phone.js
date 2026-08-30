import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';

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
        value = value.replace(/^["']|["']$/g, '');
        envVars[key] = value;
      });
    return envVars;
  } catch {
    return {};
  }
}

function normalizePhone(phoneValue) {
  if (!phoneValue) return '';
  let phone = String(phoneValue).replace(/[^0-9]/g, '');
  if (phone.match(/^(012|011|010|015)/)) {
    phone = '20' + phone.substring(1);
  }
  // Strip accidental 0 after country code: 20012... -> 2012...
  if (phone.startsWith('20') && phone.length > 2 && phone[2] === '0') {
    phone = '20' + phone.substring(3);
  }
  return phone;
}

function phoneVariants(normalized) {
  const variants = new Set();
  if (!normalized) return [];
  variants.add(normalized);
  if (normalized.startsWith('20') && normalized.length > 2) {
    const local = normalized.substring(2);
    variants.add(local);
    variants.add('0' + local);
    variants.add('+20' + local);
  }
  return Array.from(variants).filter(Boolean);
}

const envConfig = loadEnvConfig();
const MONGO_URI =
  envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/demo-attendance-system';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'demo-attendance-system';
const NATIONAL_SYSTEM = envConfig.NATIONAL_SYSTEM === 'true' || process.env.NATIONAL_SYSTEM === 'true';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await authMiddleware(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!NATIONAL_SYSTEM) {
    return res.status(200).json({ exists: false, phone: null, studentId: null });
  }

  const rawPhone =
    req.method === 'GET' ? req.query.phone : req.body?.phone;
  const excludeIdRaw =
    req.method === 'GET' ? req.query.excludeId : req.body?.excludeId;

  const phone = normalizePhone(rawPhone);
  if (!phone || phone.length < 8) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  let excludeId = null;
  if (excludeIdRaw !== undefined && excludeIdRaw !== null && String(excludeIdRaw).trim() !== '') {
    const asString = String(excludeIdRaw).replace(/[$]/g, '').trim();
    excludeId = /^\d+$/.test(asString) ? Number(asString) : asString;
  }

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const variants = phoneVariants(phone);
    const query = {
      phone: { $in: variants },
    };
    if (excludeId !== null && excludeId !== undefined) {
      query.id = { $ne: excludeId };
    }

    const existing = await db.collection('students').findOne(query, {
      projection: { id: 1, phone: 1, name: 1 },
    });

    return res.status(200).json({
      exists: Boolean(existing),
      phone,
      studentId: existing?.id ?? null,
    });
  } catch (error) {
    console.error('Error checking student phone:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
