import { getCloudinary } from '../../../lib/cloudinaryConfig';

const cloudinary = getCloudinary();

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_BASE64_SIZE = MAX_FILE_SIZE * 1.4;
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
];
const ALLOWED_FOLDERS = ['quizzes-questions-images', 'mock-exams-questions-images'];
const DEFAULT_FOLDER = 'quizzes-questions-images';

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
    if (!req.body || !req.body.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { file, fileType, folder } = req.body;

    if (!fileType || !ALLOWED_MIME_TYPES.includes(fileType)) {
      return res.status(400).json({
        error: 'Invalid file type. Only image formats (JPEG/JPG, PNG, GIF, SVG, WEBP, ICO) are allowed.',
      });
    }

    const base64Data = file.includes(',') ? file.split(',')[1] : file;
    const base64Size = Buffer.byteLength(base64Data, 'base64');
    if (base64Size > MAX_BASE64_SIZE) {
      return res.status(400).json({
        error: 'Sorry, Max image size is 10 MB, Please try another picture',
      });
    }

    const uploadFolder = folder && ALLOWED_FOLDERS.includes(folder) ? folder : DEFAULT_FOLDER;

    const uploadResult = await cloudinary.uploader.upload(file, {
      folder: uploadFolder,
      resource_type: 'image',
      type: 'private',
      overwrite: false,
      timeout: 300000,
    });

    return res.status(200).json({
      success: true,
      public_id: uploadResult.public_id,
    });
  } catch (error) {
    console.error('Cloudinary upload error (quiz-question-image):', error?.message || error);

    if (error.http_code === 400) {
      if (error.message && /(File size|size|too large)/i.test(error.message)) {
        return res.status(400).json({ error: 'Sorry, Max image size is 10 MB, Please try another picture' });
      }
      if (error.message && /(Invalid|format|unsupported)/i.test(error.message)) {
        return res.status(400).json({ error: 'Invalid file format. Only images are allowed.' });
      }
      return res.status(400).json({ error: error.message || 'Invalid image file. Please try another picture.' });
    }

    if (error.http_code === 401 || error.http_code === 403) {
      return res.status(500).json({ error: 'Cloudinary authentication error. Please contact support.' });
    }

    return res.status(500).json({ error: error.message || 'Failed to upload image. Please try again.' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
    responseLimit: false,
  },
};
