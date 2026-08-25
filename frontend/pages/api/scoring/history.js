import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';

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
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI;
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const {
      student_id,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const filter = {};
    if (student_id) {
      const sid = parseInt(student_id, 10);
      if (!isNaN(sid)) filter.student_id = sid;
    }

    const [entries, total] = await Promise.all([
      db.collection('scoring_system_history')
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection('scoring_system_history').countDocuments(filter),
    ]);

    // Enrich each entry with the student's name
    const studentIds = [...new Set(entries.map((e) => e.student_id).filter(Boolean))];
    const students = studentIds.length
      ? await db.collection('students').find({ id: { $in: studentIds } }, { projection: { id: 1, name: 1 } }).toArray()
      : [];
    const studentMap = {};
    students.forEach((s) => { studentMap[s.id] = s.name || null; });

    const serialized = entries.map((entry) => ({
      ...entry,
      _id: entry._id?.toString(),
      student_name: studentMap[entry.student_id] || null,
    }));

    return res.status(200).json({
      success: true,
      history: serialized,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Error fetching scoring history:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    if (client) await client.close();
  }
}
