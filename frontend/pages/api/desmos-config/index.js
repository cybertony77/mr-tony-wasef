import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';
import {
  buildDefaultDesmosConfig,
  mergeDesmosConfig,
  normalizeDesmosConfigItem,
} from '../../../lib/desmosConfigUtils';

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

function parseList(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
    }
  } catch {
    // CSV fallback
  }
  return String(raw)
    .split(',')
    .map((item) => item.replace(/^\[|\]$/g, '').replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

async function loadUserRole(db, decoded) {
  if (!decoded?.assistant_id) return null;
  const user = await db.collection('users').findOne(
    { id: decoded.assistant_id },
    { projection: { role: 1 } }
  );
  return user?.role || null;
}

function isStaffRole(role) {
  return role === 'admin' || role === 'developer' || role === 'assistant';
}

export default async function handler(req, res) {
  const envConfig = loadEnvConfig();
  const desmosIntegrations =
    envConfig.SYSTEM_DESMOS_INTEGRATIONS === 'true' ||
    process.env.SYSTEM_DESMOS_INTEGRATIONS === 'true';

  if (!desmosIntegrations) {
    return res.status(404).json({ error: 'Not found' });
  }

  const MONGO_URI =
    envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/demo-attendance-system';
  const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'demo-attendance-system';

  const nationalSystem =
    envConfig.NATIONAL_SYSTEM === 'true' || process.env.NATIONAL_SYSTEM === 'true';
  const courses = parseList(envConfig.GRADES_OR_COURSES || process.env.GRADES_OR_COURSES || '[]');
  const courseTypes = parseList(envConfig.COURSE_TYPE || process.env.COURSE_TYPE || '[]');
  const defaults = buildDefaultDesmosConfig(courses, courseTypes, nationalSystem);

  let client;
  try {
    let decoded;
    try {
      decoded = await authMiddleware(req);
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    const role = await loadUserRole(db, decoded);

    if (req.method === 'GET') {
      const stored = await db.collection('desmos_config').find({}).toArray();
      const normalizedStored = stored
        .map((doc) =>
          normalizeDesmosConfigItem(
            {
              course: doc.course,
              courseType: doc.courseType,
              enabled: doc.enabled,
            },
            nationalSystem
          )
        )
        .filter(Boolean);

      const items = mergeDesmosConfig(defaults, normalizedStored);

      return res.status(200).json({
        items,
        national_system: nationalSystem,
        courses,
        course_types: courseTypes,
        canEdit: isStaffRole(role),
      });
    }

    if (req.method === 'PUT') {
      if (!isStaffRole(role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const incoming = Array.isArray(body.items) ? body.items : [];

      const allowedKeys = new Set(
        defaults.map((item) => `${item.course}::${item.courseType ?? ''}`)
      );

      const toSave = [];
      for (const raw of incoming) {
        const normalized = normalizeDesmosConfigItem(raw, nationalSystem);
        if (!normalized) continue;
        const key = `${normalized.course}::${normalized.courseType ?? ''}`;
        if (!allowedKeys.has(key)) continue;
        toSave.push({
          ...normalized,
          updatedAt: new Date(),
        });
      }

      const merged = mergeDesmosConfig(defaults, toSave);

      await db.collection('desmos_config').deleteMany({});
      if (merged.length > 0) {
        await db.collection('desmos_config').insertMany(
          merged.map((item) => ({
            course: item.course,
            courseType: item.courseType,
            enabled: item.enabled !== false,
            updatedAt: new Date(),
          }))
        );
      }

      return res.status(200).json({ success: true, items: merged });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('desmos-config API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
