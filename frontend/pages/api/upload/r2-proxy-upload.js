import path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import formidable from 'formidable';
import { createReadStream, unlinkSync } from 'fs';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import { assertR2Config, assertSafeObjectKey, getR2Config } from '../../../lib/r2Server';

export const config = {
  api: { bodyParser: false },
};

const ALLOWED_PREFIXES = new Set([
  'videos',
  'pdfs/material',
  'pdfs/HW-PDFs',
  'pdfs/Quizs-PDFs',
  'pdfs/MockExams-PDFs',
]);

function fieldValue(fields, name) {
  const raw = fields?.[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

function buildObjectKey(prefix, fileName) {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  const baseName = path.basename(String(fileName || 'upload.bin').replace(/\\/g, '/'));
  const sanitizedName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload.bin';
  return `${prefix}/${timestamp}_${randomStr}_${sanitizedName}`;
}

/**
 * Same-origin upload → server → R2.
 * Never returns an R2 presigned URL to the browser.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    throw error;
  }

  let cfg;
  try {
    cfg = getR2Config();
    assertR2Config(cfg);
  } catch {
    return res.status(500).json({ error: 'R2 configuration is missing' });
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true,
  });

  let tempPath = null;

  try {
    if (typeof req.setTimeout === 'function') req.setTimeout(0);
    if (typeof res.setTimeout === 'function') res.setTimeout(0);

    const { fields, files } = await new Promise((resolve, reject) => {
      const form = formidable({
        maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
      });
      form.parse(req, (err, f, filez) => {
        if (err) return reject(err);
        resolve({ fields: f, files: filez });
      });
    });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    tempPath = file.filepath;

    let key = fieldValue(fields, 'key');
    const prefixRaw = String(fieldValue(fields, 'prefix') || 'videos').trim();
    const fileName =
      fieldValue(fields, 'fileName') || file.originalFilename || file.newFilename || 'upload.bin';

    if (!key) {
      if (!ALLOWED_PREFIXES.has(prefixRaw)) {
        try {
          unlinkSync(tempPath);
        } catch {
          /* ignore */
        }
        tempPath = null;
        return res.status(400).json({ error: 'Invalid upload prefix' });
      }
      key = buildObjectKey(prefixRaw, fileName);
    }

    try {
      assertSafeObjectKey(key);
    } catch (e) {
      try {
        unlinkSync(tempPath);
      } catch {
        /* ignore */
      }
      tempPath = null;
      return res.status(e.statusCode || 400).json({ error: e.message });
    }

    const allowedByPrefix = [...ALLOWED_PREFIXES].some(
      (p) => key === p || key.startsWith(`${p}/`)
    );
    if (!allowedByPrefix) {
      try {
        unlinkSync(tempPath);
      } catch {
        /* ignore */
      }
      tempPath = null;
      return res.status(403).json({ error: 'Access denied for this key path' });
    }

    const contentType = file.mimetype || 'application/octet-stream';
    const bodyStream = createReadStream(tempPath);

    const upload = new Upload({
      client,
      params: {
        Bucket: cfg.bucketName,
        Key: key,
        Body: bodyStream,
        ContentType: contentType,
      },
      queueSize: 8,
      partSize: 32 * 1024 * 1024,
      leavePartsOnError: false,
    });

    await upload.done();

    res.json({ success: true, key });
  } catch (error) {
    console.error('R2 proxy upload error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Upload failed', details: error.message });
    }
  } finally {
    if (tempPath) {
      try {
        unlinkSync(tempPath);
      } catch {
        /* ignore */
      }
    }
  }
}
