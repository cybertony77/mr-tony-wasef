import path from 'path';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import { assertR2Config, getR2Config } from '../../../lib/r2Server';

/**
 * Prepare an R2 object key for same-origin proxy upload.
 * Does NOT return a presigned URL — client must POST the file to
 * /api/upload/r2-proxy-upload with the returned key.
 */
const ALLOWED_PREFIXES = new Set([
  'videos',
  'pdfs/material',
  'pdfs/HW-PDFs',
  'pdfs/Quizs-PDFs',
  'pdfs/MockExams-PDFs',
]);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const cfg = getR2Config();
    assertR2Config(cfg);

    const { fileName, contentType, prefix: prefixRaw } = req.body || {};

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const prefix =
      typeof prefixRaw === 'string' && ALLOWED_PREFIXES.has(prefixRaw.trim())
        ? prefixRaw.trim()
        : 'videos';

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const baseName = path.basename(String(fileName).replace(/\\/g, '/'));
    const sanitizedName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload.bin';
    const key = `${prefix}/${timestamp}_${randomStr}_${sanitizedName}`;

    const contentTypeHeader =
      typeof contentType === 'string' && contentType.trim() !== ''
        ? contentType.trim()
        : 'application/octet-stream';

    // Intentionally no signedUrl / presigned URL — upload via same-origin proxy only
    res.json({
      key,
      contentType: contentTypeHeader,
      uploadPath: '/api/upload/r2-proxy-upload',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('R2 upload prepare error:', error);
    const status = error.statusCode || 500;
    res.status(status).json({
      error: status === 400 ? error.message : 'Failed to prepare upload',
      details: error.message,
    });
  }
}
