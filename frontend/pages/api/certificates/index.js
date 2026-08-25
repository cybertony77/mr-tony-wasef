import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import {
  formatCertificateDateTime,
  studentsCsvFromIds,
  parseStudentsCsv,
} from '../../../lib/certificatesUtils';
import { resolveCertificateFontName } from '../../../lib/certificateFonts';

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

function normalizePayload(body = {}) {
  const certificate_name = String(body.certificate_name || '').trim();
  const students = studentsCsvFromIds(parseStudentsCsv(body.students));
  const state = body.state === 'Deactivated' ? 'Deactivated' : 'Activated';
  const certificate_image = String(body.certificate_image || '').trim();
  const student_nameX = Number(body.student_nameX);
  const student_nameY = Number(body.student_nameY);
  const fontFamily = resolveCertificateFontName(body.fontFamily || 'Roboto');
  const fontSize = Number(body.fontSize);
  const textColor = String(body.textColor || '#1a1a1a').trim() || '#1a1a1a';

  return {
    certificate_name,
    students,
    state,
    certificate_image,
    student_nameX: Number.isFinite(student_nameX) ? student_nameX : 0,
    student_nameY: Number.isFinite(student_nameY) ? student_nameY : 0,
    fontFamily,
    fontSize: Number.isFinite(fontSize) ? Math.min(150, Math.max(1, fontSize)) : 75,
    textColor,
  };
}

function validatePayload(data) {
  if (!data.certificate_name) return '❌ Certificate name is required';
  if (!data.students) return '❌ Select at least one student';
  if (!data.certificate_image) return '❌ Certificate design image is required';
  if (!Number.isFinite(data.student_nameX) || !Number.isFinite(data.student_nameY)) {
    return '❌ Student name X and Y positions are required';
  }
  return null;
}

export default async function handler(req, res) {
  let client;
  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    const collection = db.collection('certificates');

    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        if (!ObjectId.isValid(String(id))) {
          return res.status(400).json({ error: 'Invalid certificate id' });
        }
        const cert = await collection.findOne({ _id: new ObjectId(String(id)) });
        if (!cert) return res.status(404).json({ error: 'Certificate not found' });
        return res.status(200).json({ success: true, certificate: cert });
      }

      const certificates = await collection
        .find({})
        .sort({ create_date: -1, certificate_name: 1 })
        .toArray();
      return res.status(200).json({ success: true, certificates });
    }

    if (req.method === 'POST') {
      const data = normalizePayload(req.body);
      const error = validatePayload(data);
      if (error) return res.status(400).json({ error });

      const existing = await collection.findOne({
        certificate_name: data.certificate_name,
      });
      if (existing) {
        return res.status(400).json({
          error: '❌ A certificate with this name already exists.',
        });
      }

      const item = {
        ...data,
        create_date: formatCertificateDateTime(new Date()),
      };
      const result = await collection.insertOne(item);
      return res.status(201).json({
        success: true,
        certificate: { ...item, _id: result.insertedId },
      });
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id || !ObjectId.isValid(String(id))) {
        return res.status(400).json({ error: 'Valid certificate id is required' });
      }
      const data = normalizePayload(req.body);
      const error = validatePayload(data);
      if (error) return res.status(400).json({ error });

      const duplicate = await collection.findOne({
        certificate_name: data.certificate_name,
        _id: { $ne: new ObjectId(String(id)) },
      });
      if (duplicate) {
        return res.status(400).json({
          error: '❌ A certificate with this name already exists.',
        });
      }

      const result = await collection.updateOne(
        { _id: new ObjectId(String(id)) },
        {
          $set: {
            ...data,
            create_date: formatCertificateDateTime(new Date()),
          },
        }
      );
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Certificate not found' });
      }
      const updated = await collection.findOne({ _id: new ObjectId(String(id)) });
      return res.status(200).json({ success: true, certificate: updated });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id || !ObjectId.isValid(String(id))) {
        return res.status(400).json({ error: 'Valid certificate id is required' });
      }
      const result = await collection.deleteOne({ _id: new ObjectId(String(id)) });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Certificate not found' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Certificates API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
