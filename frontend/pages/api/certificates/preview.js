import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
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

/** Placeholder used on add/edit preview — never a real student name */
const PREVIEW_STUDENT_NAME = 'Student Name';

export const config = {
  api: {
    responseLimit: false,
  },
};

/**
 * Staff-only preview of a certificate with saved text settings.
 * Renders with "Student Name" (same as add page), not a real student.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

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

    const png = await generateCertificatePng({
      certificateImage: cert.certificate_image,
      studentName: PREVIEW_STUDENT_NAME,
      student_nameX: cert.student_nameX,
      student_nameY: cert.student_nameY,
      fontFamily: cert.fontFamily,
      fontSize: Number(cert.fontSize),
      textColor: cert.textColor,
    });

    const safeName = String(cert.certificate_name || 'certificate')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}_preview.png"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(png);
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Certificate preview error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to generate certificate preview',
    });
  } finally {
    if (client) await client.close();
  }
}
