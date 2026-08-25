import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import { studentHasCertificate } from '../../../lib/certificatesUtils';
import { generateCertificatePng } from '../../../lib/certificateGenerate';

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

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    const { id } = req.query;
    if (!id || !ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: 'Valid certificate id is required' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    const cert = await db.collection('certificates').findOne({ _id: new ObjectId(String(id)) });
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    if (cert.state === 'Deactivated' && user.role === 'student') {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    let studentId;
    if (user.role === 'student') {
      studentId = user.assistant_id || user.id;
      if (!studentHasCertificate(cert.students, studentId)) {
        return res.status(403).json({ error: 'You do not have access to this certificate' });
      }
    } else if (['admin', 'developer', 'assistant'].includes(user.role)) {
      // Staff may preview for a specific student via ?studentId=
      studentId = req.query.studentId;
      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required for staff download' });
      }
      if (!studentHasCertificate(cert.students, studentId)) {
        return res.status(400).json({ error: 'Student is not assigned to this certificate' });
      }
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const numericId = Number(studentId);
    const student = await db.collection('students').findOne({
      $or: [{ id: studentId }, ...(Number.isFinite(numericId) ? [{ id: numericId }] : [])],
    });
    if (!student?.name) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // SECURITY: name is always loaded from DB — never from query/body/client
    const png = await generateCertificatePng({
      certificateImage: cert.certificate_image,
      studentName: student.name,
      student_nameX: cert.student_nameX,
      student_nameY: cert.student_nameY,
      fontFamily: cert.fontFamily,
      fontSize: Number(cert.fontSize),
      textColor: cert.textColor,
    });

    const safeName = String(cert.certificate_name || 'certificate')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80);
    const fileName = `${safeName}_${student.id || studentId}.png`;

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(png);
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Certificate download error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to generate certificate',
    });
  } finally {
    if (client) await client.close();
  }
}
