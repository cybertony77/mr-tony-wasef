import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';
import { streamCloudinaryPrivateImage } from '../../../lib/cloudinaryImageProxy';
import { getCookieValue } from '../../../lib/cookies';
import { getMongoFromEnv, MARKETING_DOC_ID } from '../../../lib/marketingPageMongo';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

/**
 * Public marketing teacher picture stream (no Cloudinary URL in JSON).
 * GET /api/marketing_page/teacher-picture
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const { MONGO_URI, DB_NAME, envConfig } = getMongoFromEnv();
    const JWT_SECRET = envConfig.JWT_SECRET || process.env.JWT_SECRET;
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    const doc = await db.collection('marketing_page').findOne(
      { _id: MARKETING_DOC_ID },
      { projection: { teacher_picture: 1, page_state: 1 } }
    );

    if (!doc?.teacher_picture) {
      return res.status(404).json({ error: 'No teacher picture' });
    }

    let canEdit = false;
    const token = getCookieValue(req.headers?.cookie, 'token');
    if (token && JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded?.assistant_id) {
          const u = await db.collection('users').findOne(
            { id: decoded.assistant_id },
            { projection: { role: 1 } }
          );
          canEdit = u?.role === 'admin' || u?.role === 'developer';
        }
      } catch {
        /* ignore */
      }
    }

    // Hide when page is offline (same rule as marketing GET for anonymous)
    if (doc.page_state === false && !canEdit) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (req.method === 'HEAD') {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', canEdit ? 'private, max-age=60' : 'public, max-age=300');
      return res.status(200).end();
    }

    const handled = await streamCloudinaryPrivateImage(res, doc.teacher_picture);
    if (!handled && !res.headersSent) {
      return res.status(500).json({ error: 'Failed to load image' });
    }
  } catch (error) {
    console.error('marketing teacher-picture error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    if (client) await client.close();
  }
}
