// POST /api/upload/sign
//
// Returns a short-lived Cloudinary upload signature so the browser can upload
// the file DIRECTLY to Cloudinary (multipart/form-data) instead of relaying
// the bytes through Next.js as base64 JSON.
//
// Why this matters:
//   - No base64 encoding (eliminates ~33% bandwidth overhead).
//   - No Next.js body parsing of multi-MB JSON payloads.
//   - The file is transferred once over the network instead of twice.
//   - Browser gets accurate XHR upload progress.
//
// Security notes:
//   - The api_secret is NEVER sent to the browser. Only the timestamp + HMAC
//     signature + the allow-listed upload parameters are returned.
//   - We strictly validate folder, resource_type, and access type so callers
//     cannot dump files into arbitrary places.

import crypto from 'crypto';
import { getCloudinaryCredentials } from '../../../lib/cloudinaryConfig';

// Map of folder -> allowed { resource_type, type } combo.
const FOLDER_POLICY = {
  // Images (private delivery, signed URLs to view).
  'profile-pictures': { resource_type: 'image', type: 'private' },
  'certificates': { resource_type: 'image', type: 'private' },
  'homeworks-questions-images': { resource_type: 'image', type: 'private' },
  'quizzes-questions-images': { resource_type: 'image', type: 'private' },
  'mock-exams-questions-images': { resource_type: 'image', type: 'private' },
  // PDFs (publicly accessible raw delivery).
  'HW-PDFs': { resource_type: 'raw', type: 'upload' },
  'Quizs-PDFs': { resource_type: 'raw', type: 'upload' },
  'MockExams-PDFs': { resource_type: 'raw', type: 'upload' },
  material: { resource_type: 'raw', type: 'upload' },
};

function buildSignaturePayload(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}

export default function handler(req, res) {
  // CORS so signed direct uploads work from any deployed origin / local IP.
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
    const { folder } = req.body || {};
    const policy = FOLDER_POLICY[folder];
    if (!policy) {
      return res.status(400).json({ error: 'Invalid upload folder.' });
    }

    const { cloud_name, api_key, api_secret } = getCloudinaryCredentials();
    if (!cloud_name || !api_key || !api_secret) {
      return res.status(500).json({ error: 'Cloudinary is not configured.' });
    }

    const timestamp = Math.round(Date.now() / 1000);

    // Parameters that will be sent in the multipart upload AND included in
    // the signature. Keep this list minimal: any param the browser sends must
    // be signed here or Cloudinary will reject the upload.
    const signedParams = {
      folder,
      timestamp,
      type: policy.type,
    };

    const signature = crypto
      .createHash('sha1')
      .update(buildSignaturePayload(signedParams) + api_secret)
      .digest('hex');

    return res.status(200).json({
      cloud_name,
      api_key,
      timestamp,
      signature,
      folder,
      resource_type: policy.resource_type,
      type: policy.type,
      upload_url: `https://api.cloudinary.com/v1_1/${cloud_name}/${policy.resource_type}/upload`,
      // Client hints for size validation / chunking
      max_bytes:
        folder === 'material'
          ? 200 * 1024 * 1024
          : folder === 'profile-pictures' || folder.includes('questions-images')
            ? 10 * 1024 * 1024
            : 100 * 1024 * 1024,
    });
  } catch (error) {
    console.error('Cloudinary sign error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to generate upload signature.' });
  }
}
