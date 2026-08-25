import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import { studentHasCertificate } from '../../../lib/certificatesUtils';

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
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'mr-george-magdy';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden: Students only' });
    }

    const studentId = user.assistant_id || user.id;
    if (!studentId && studentId !== 0) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const all = await db
      .collection('certificates')
      .find({ state: { $ne: 'Deactivated' } })
      .sort({ create_date: -1 })
      .toArray();

    const certificates = all
      .filter((cert) => studentHasCertificate(cert.students, studentId))
      .map((cert) => ({
        _id: cert._id,
        certificate_name: cert.certificate_name,
        create_date: cert.create_date,
        // Never expose template text settings / student list to the client for forging.
        // Download uses server-side generation only.
      }));

    return res.status(200).json({ success: true, certificates });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Student certificates API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
