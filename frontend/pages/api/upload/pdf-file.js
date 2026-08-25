import { getCloudinary } from '../../../lib/cloudinaryConfig';

const cloudinary = getCloudinary();

// Fallback server-side PDF upload (prefer browser → Cloudinary direct upload
// via `/api/upload/sign` + `uploadToCloudinaryDirect` for large files).
// Material: 200 MB · Homework / Quizzes / Mock exams: 100 MB
const MAX_BY_FOLDER = {
  material: 200 * 1024 * 1024,
  'HW-PDFs': 100 * 1024 * 1024,
  'Quizs-PDFs': 100 * 1024 * 1024,
  'MockExams-PDFs': 100 * 1024 * 1024,
};
const ALLOWED_FOLDERS = Object.keys(MAX_BY_FOLDER);
const CLOUDINARY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_RETRY_COUNT = 2;

async function uploadPdfWithRetry(file, options) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRY_COUNT; attempt += 1) {
    try {
      // upload_large uses chunked upload on the server for big files
      if (typeof cloudinary.uploader.upload_large === 'function') {
        return await cloudinary.uploader.upload_large(file, options);
      }
      return await cloudinary.uploader.upload(file, options);
    } catch (error) {
      lastError = error;
      const status = Number(error?.http_code || 0);
      const transient = !status || status >= 500 || status === 420 || status === 429;
      if (!transient || attempt === MAX_RETRY_COUNT) {
        throw error;
      }
      const waitMs = 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  // Allow browser preflight if this route is ever called cross-origin
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
    if (!req.body || !req.body.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { file, fileType, folder } = req.body;

    if (!fileType || fileType !== 'application/pdf') {
      return res.status(400).json({ error: 'Invalid file type. Only PDF files are allowed.' });
    }

    if (!folder || !ALLOWED_FOLDERS.includes(folder)) {
      return res.status(400).json({ error: 'Invalid upload folder.' });
    }

    const maxBytes = MAX_BY_FOLDER[folder];
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    const maxBase64 = maxBytes * 1.4;

    const base64Data = file.includes(',') ? file.split(',')[1] : file;
    const fileSize = Buffer.byteLength(base64Data, 'base64');

    if (fileSize > maxBase64) {
      return res.status(400).json({ error: `Max PDF file size is ${maxMb} MB.` });
    }

    const uploadResult = await uploadPdfWithRetry(file, {
      folder,
      resource_type: 'raw',
      type: 'upload',
      overwrite: false,
      timeout: CLOUDINARY_TIMEOUT_MS,
      chunk_size: 6 * 1024 * 1024,
    });

    return res.status(200).json({
      success: true,
      url: uploadResult.secure_url,
    });
  } catch (error) {
    console.error('Cloudinary PDF upload error:', error?.message || error);

    if (error.http_code === 400) {
      return res.status(400).json({ error: error.message || 'Invalid PDF file.' });
    }

    if (error.http_code === 401 || error.http_code === 403) {
      return res.status(500).json({ error: 'Cloudinary authentication error. Please contact support.' });
    }

    return res.status(500).json({ error: error.message || 'Failed to upload PDF. Please try again.' });
  }
}

export const config = {
  api: {
    bodyParser: {
      // Material PDFs up to 200MB → ~280MB base64; prefer direct upload for large files.
      sizeLimit: '300mb',
    },
    responseLimit: false,
  },
};
