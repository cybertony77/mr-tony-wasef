import { MongoClient } from 'mongodb';
import { getMongoFromEnv, MARKETING_DOC_ID } from '../../../lib/marketingPageMongo';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { MONGO_URI, DB_NAME, envConfig } = getMongoFromEnv();
  const system_marketing_page =
    envConfig.SYSTEM_MARKETING_PAGE === 'true' || process.env.SYSTEM_MARKETING_PAGE === 'true';

  if (!system_marketing_page) {
    return res.status(200).json({ system_marketing_page: false, page_state: false });
  }

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    const doc = await db.collection('marketing_page').findOne({ _id: MARKETING_DOC_ID });
    const page_state = doc ? doc.page_state !== false : true;
    return res.status(200).json({ system_marketing_page: true, page_state });
  } catch (e) {
    console.error('marketing_page visibility:', e);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
