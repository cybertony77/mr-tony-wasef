import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';

// Load environment variables from env.config
function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, ''); // strip quotes
          envVars[key] = value;
        }
      }
    });

    return envVars;
  } catch (error) {
    console.log('⚠️  Could not read env.config, using process.env as fallback');
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'mr-george-magdy';

console.log('🔗 Using Mongo URI:', MONGO_URI);

async function requireDeveloper(req) {
  const user = await authMiddleware(req);
  if (user.role !== 'developer') {
    const err = new Error('Forbidden: Developers only');
    err.statusCode = 403;
    throw err;
  }
  return user;
}

// Auto-expire subscription if expired
async function checkAndExpireSubscription(db) {
  const subscription = await db.collection('subscription').findOne({});
  if (subscription && subscription.active && subscription.date_of_expiration) {
    const now = new Date();
    const expirationDate = new Date(subscription.date_of_expiration);

    if (now >= expirationDate) {
      console.log('⏰ Subscription expired, auto-deactivating...');
      await db.collection('subscription').updateOne(
        {},
        {
          $set: {
            active: false,
            subscription_duration: null,
            date_of_subscription: null,
            date_of_expiration: null,
            cost: null,
            note: null,
          },
        }
      );
      return true;
    }
  }
  return false;
}

export default async function handler(req, res) {
  let client;
  try {
    // Validate auth before DB work so expired/missing tokens always return 401
    if (req.method === 'GET' || req.method === 'PATCH') {
      await authMiddleware(req);
    } else if (req.method === 'POST' || req.method === 'PUT') {
      await requireDeveloper(req);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    await checkAndExpireSubscription(db);

    if (req.method === 'GET') {
      const subscription = await db.collection('subscription').findOne({});

      if (!subscription) {
        const defaultSubscription = {
          subscription_duration: null,
          date_of_subscription: null,
          date_of_expiration: null,
          cost: null,
          note: null,
          active: false,
        };
        await db.collection('subscription').insertOne(defaultSubscription);
        return res.json(defaultSubscription);
      }

      return res.json(subscription);
    }

    if (req.method === 'PATCH') {
      const subscription = await db.collection('subscription').findOne({});

      if (subscription && subscription.active && subscription.date_of_expiration) {
        const now = new Date();
        const expirationDate = new Date(subscription.date_of_expiration);

        if (now >= expirationDate) {
          await db.collection('subscription').updateOne(
            {},
            {
              $set: {
                active: false,
                subscription_duration: null,
                date_of_subscription: null,
                date_of_expiration: null,
                cost: null,
                note: null,
              },
            }
          );
          return res.json({ success: true, message: 'Subscription expired' });
        }
        return res.status(400).json({ error: 'Subscription has not expired yet' });
      }

      return res.json({ success: true, message: 'No active subscription to expire' });
    }

    if (req.method === 'POST') {
      const { subscription_duration, duration_type, cost, note, overwrite } = req.body;

      if (!subscription_duration || !cost) {
        return res.status(400).json({ error: 'Subscription duration and cost are required' });
      }

      const existingSubscription = await db.collection('subscription').findOne({});
      const now = new Date();

      if (!overwrite && existingSubscription && existingSubscription.active && existingSubscription.date_of_expiration) {
        const expirationDate = new Date(existingSubscription.date_of_expiration);
        if (now < expirationDate) {
          return res.status(409).json({
            error: 'ACTIVE_SUBSCRIPTION_EXISTS',
            message: "There is already a subscription and it's not expired yet",
          });
        }
      }

      const date_of_subscription = new Date();
      const date_of_expiration = new Date(date_of_subscription);

      if (duration_type === 'yearly') {
        date_of_expiration.setFullYear(date_of_expiration.getFullYear() + parseInt(subscription_duration));
      } else if (duration_type === 'monthly') {
        date_of_expiration.setMonth(date_of_expiration.getMonth() + parseInt(subscription_duration));
      } else if (duration_type === 'daily') {
        date_of_expiration.setDate(date_of_expiration.getDate() + parseInt(subscription_duration));
      } else if (duration_type === 'hourly') {
        date_of_expiration.setHours(date_of_expiration.getHours() + parseInt(subscription_duration));
      } else if (duration_type === 'minutely') {
        date_of_expiration.setMinutes(date_of_expiration.getMinutes() + parseInt(subscription_duration));
      }

      const durationLabel =
        duration_type === 'yearly'
          ? 'year'
          : duration_type === 'monthly'
            ? 'month'
            : duration_type === 'daily'
              ? 'day'
              : duration_type === 'hourly'
                ? 'hour'
                : 'minute';
      const subscriptionData = {
        subscription_duration: `${subscription_duration} ${durationLabel}${parseInt(subscription_duration) > 1 ? 's' : ''}`,
        date_of_subscription,
        date_of_expiration,
        cost: parseFloat(cost),
        note: note && note.trim() !== '' ? note.trim() : null,
        active: true,
      };

      await db.collection('subscription').updateOne({}, { $set: subscriptionData }, { upsert: true });

      return res.json({ success: true, subscription: subscriptionData });
    }

    if (req.method === 'PUT') {
      await db.collection('subscription').updateOne(
        {},
        {
          $set: {
            subscription_duration: null,
            date_of_subscription: null,
            date_of_expiration: null,
            cost: null,
            note: null,
            active: false,
          },
        }
      );

      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: error.message || 'Please log in to access this resource',
      });
    }
    if (error.statusCode === 403 || error.message === 'Forbidden: Developers only') {
      return res.status(403).json({
        error: 'Forbidden: Developers only',
        message: 'This resource is only accessible to users with the developer role',
      });
    }

    console.error('❌ Subscription API error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  } finally {
    if (client) await client.close();
  }
}
