import { MongoClient } from 'mongodb';
import { authMiddleware } from '../../../lib/authMiddleware';
import { getMongoFromEnv } from '../../../lib/marketingPageMongo';

function isPrivileged(role) {
  return role === 'admin' || role === 'developer';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    const { MONGO_URI, DB_NAME } = getMongoFromEnv();
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const dbUser = await db.collection('users').findOne({ id: user.assistant_id });
    if (!dbUser || !isPrivileged(dbUser.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const centers = await db.collection('centers').find({}).sort({ name: 1 }).toArray();

    const staff = await db
      .collection('users')
      .find({
        role: { $in: ['assistant', 'admin'] },
        account_state: 'Activated',
      })
      .project({ id: 1, name: 1, role: 1, phone: 1 })
      .sort({ name: 1 })
      .toArray();

    return res.status(200).json({
      centers: centers.map((c) => ({
        value: c._id.toString(),
        label: c.name || 'Unnamed center',
      })),
      centersDetail: centers.map((c) => ({
        _id: c._id.toString(),
        name: c.name || '',
        location: c.location || null,
        grades: c.grades || [],
      })),
      staff: staff.map((s) => ({
        value: s._id.toString(),
        label: `${s.name || s.id} • ${s.role}`,
        name: s.name,
        role: s.role,
        phone: s.phone,
      })),
    });
  } catch (e) {
    if (e.message === 'No token provided' || e.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('marketing_page options:', e);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
