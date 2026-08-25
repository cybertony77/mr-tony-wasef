import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  assertR2Config,
  createR2S3ClientForPutPresign,
  ensureR2CorsForBrowserUploads,
  getR2Config,
} from '../../../lib/r2Server';

/** 6h TTL so slow / multi-GB uploads do not expire mid-transfer */
const PRESIGN_PUT_EXPIRES_SEC = 6 * 60 * 60; // 6 hours

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cfg = getR2Config();
    assertR2Config(cfg);

    const corsSetup = await ensureR2CorsForBrowserUploads(cfg, req.headers.origin || '');

    const { fileName, contentType, prefix: prefixRaw } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const ALLOWED_PREFIXES = new Set([
      'videos',
      'pdfs/material',
      'pdfs/HW-PDFs',
      'pdfs/Quizs-PDFs',
      'pdfs/MockExams-PDFs',
    ]);
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

    const s3Client = createR2S3ClientForPutPresign(cfg);

    const command = new PutObjectCommand({
      Bucket: cfg.bucketName,
      Key: key,
      ContentType: contentTypeHeader,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGN_PUT_EXPIRES_SEC,
    });

    res.json({
      signedUrl,
      key,
      contentType: contentTypeHeader,
      expiresIn: PRESIGN_PUT_EXPIRES_SEC,
      corsSetup,
    });
  } catch (error) {
    console.error('R2 signed URL error:', error);
    const status = error.statusCode || 500;
    res.status(status).json({
      error: status === 400 ? error.message : 'Failed to generate signed URL',
      details: error.message,
    });
  }
}
