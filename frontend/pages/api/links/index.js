import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../../../lib/authMiddleware';
import { getCookieValue } from '../../../lib/cookies';
import { getMongoFromEnv, LINKS_DOC_ID, defaultLinksDoc } from '../../../lib/linksMongo';
import { buildStoredLinksPayload } from '../../../lib/linksClientUtils';

function tryDecodeJwt(req, jwtSecret) {
  const token = getCookieValue(req.headers?.cookie, 'token');
  if (!token || !jwtSecret) return null;
  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
}

async function loadUserRole(db, decoded) {
  if (!decoded?.assistant_id) return null;
  const u = await db.collection('users').findOne(
    { id: decoded.assistant_id },
    { projection: { role: 1 } }
  );
  return u?.role || null;
}

function canManageLinks(role) {
  return role === 'admin' || role === 'developer' || role === 'assistant';
}

async function getOrCreateLinksDoc(db) {
  let doc = await db.collection('links').findOne({ _id: LINKS_DOC_ID });
  if (!doc) {
    const base = defaultLinksDoc();
    await db.collection('links').insertOne(base);
    doc = base;
  }
  return doc;
}

export default async function handler(req, res) {
  const { MONGO_URI, DB_NAME, envConfig } = getMongoFromEnv();
  const JWT_SECRET = envConfig.JWT_SECRET || process.env.JWT_SECRET;

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    if (req.method === 'GET') {
      const decoded = tryDecodeJwt(req, JWT_SECRET);
      if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const role = await loadUserRole(db, decoded);
      if (!role) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const doc = await getOrCreateLinksDoc(db);
      const items = Array.isArray(doc.items) ? doc.items : [];
      return res.status(200).json({
        items: items.filter((r) => r?.name && r?.link),
        canManage: canManageLinks(role),
      });
    }

    if (req.method === 'PATCH') {
      let user;
      try {
        user = await authMiddleware(req);
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const dbUser = await db.collection('users').findOne({ id: user.assistant_id });
      if (!dbUser || !canManageLinks(dbUser.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rawItems = body.items;
      const items = buildStoredLinksPayload(Array.isArray(rawItems) ? rawItems : []);

      await db.collection('links').updateOne(
        { _id: LINKS_DOC_ID },
        { $set: { items } },
        { upsert: true }
      );

      return res.status(200).json({ items, success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('links API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
