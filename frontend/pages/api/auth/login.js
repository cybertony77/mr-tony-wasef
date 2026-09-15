import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import {
  applyDeviceLimitationsAtomic,
  extractClientIp,
  parseUserAgentMeta,
  isUsableDeviceId,
} from '../../../lib/deviceLimitationsServer';
import { buildAuthCookie } from '../../../lib/authSecrets';
import { checkRateLimit, clientKey } from '../../../lib/rateLimit';
import { invalidateSubscriptionStatusCache } from '../../../lib/subscriptionGuard';

// Load environment variables from env.config
function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
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
let JWT_SECRET;
try {
  const { getJwtSecret } = require('../../../lib/authSecrets');
  JWT_SECRET = getJwtSecret();
} catch {
  JWT_SECRET = envConfig.JWT_SECRET || process.env.JWT_SECRET;
}
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'mr-george-magdy';
function isSubscriptionEnabled() {
  try {
    const latestEnv = loadEnvConfig();
    const rawValue = latestEnv.SYSTEM_SUBSCRIPTION || process.env.SYSTEM_SUBSCRIPTION;
    const normalized = String(rawValue || '').toLowerCase().trim();
    return normalized === 'true' || normalized === '1';
  } catch {
    return false;
  }
}

// Helper to dynamically check if device limitations are enabled on each request
function isDeviceLimitationsEnabled() {
  try {
    const latestEnv = loadEnvConfig();
    const rawValue = latestEnv.SYSTEM_DEVICE_LIMITATIONS || process.env.SYSTEM_DEVICE_LIMITATIONS;
    const normalized = String(rawValue || '').toLowerCase().trim();
    const enabled = normalized === 'true' || normalized === '1';

    if (process.env.NODE_ENV !== 'production') {
      console.log('🔐 Device Limitations (login):', {
        envConfigValue: latestEnv.SYSTEM_DEVICE_LIMITATIONS,
        processEnvValue: process.env.SYSTEM_DEVICE_LIMITATIONS,
        normalized,
        enabled,
      });
    }

    return enabled;
  } catch (e) {
    console.log('⚠️  Failed to determine device limitations state, defaulting to disabled', e);
    return false;
  }
}

console.log('🔗 Using Mongo URI:', MONGO_URI);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'Server auth is misconfigured' });
  }

  const rl = checkRateLimit(clientKey(req, 'login'), { windowMs: 60 * 1000, max: 20 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec || 60));
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  const { assistant_id, password, device_id, device_fingerprint } = req.body;
  if (!assistant_id || !password) {
    return res.status(400).json({ error: 'assistant_id and password required' });
  }
  if (typeof assistant_id !== 'string' && typeof assistant_id !== 'number') {
    return res.status(400).json({ error: 'Invalid assistant_id' });
  }
  if (typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid password' });
  }
  // Convert ID to appropriate type - try both number and string formats
  let safeId;
  let safeIdAsNumber = null;
  let safeIdAsString = null;
  
  if (typeof assistant_id === 'number') {
    safeId = assistant_id;
    safeIdAsNumber = assistant_id;
    safeIdAsString = String(assistant_id);
  } else {
    const idStr = String(assistant_id).replace(/[$]/g, '').trim();
    // If it's a numeric string, try both number and string formats
    if (/^\d+$/.test(idStr)) {
      safeIdAsNumber = parseInt(idStr, 10);
      safeIdAsString = idStr;
      safeId = safeIdAsNumber; // Default to number for numeric IDs
    } else {
      safeId = idStr;
      safeIdAsString = idStr;
    }
  }
  
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    
    // Try to find user by ID - try number first, then string if numeric
    let assistant = null;
    if (safeIdAsNumber !== null) {
      // Try as number first
      assistant = await db.collection('users').findOne({ id: safeIdAsNumber });
      if (!assistant) {
        // If not found as number, try as string
        assistant = await db.collection('users').findOne({ id: safeIdAsString });
      }
    } else {
      // Non-numeric ID, try as string
      assistant = await db.collection('users').findOne({ id: safeId });
    }
    
    if (!assistant) {
      return res.status(401).json({ error: 'user_not_found' });
    }
    const valid = await bcrypt.compare(password, assistant.password);
    if (!valid) {
      return res.status(401).json({ error: 'wrong_password' });
    }
    
    // Check account_state based on role
    let accountState = null;
    
    if (assistant.role === 'student') {
      // For students, get account_state from students collection
      const student = await db.collection('students').findOne({ id: assistant.id });
      if (student) {
        // Use account_state if it exists, otherwise default to 'Deactivated'
        accountState = student.account_state || 'Deactivated';
      } else {
        // If student not found in students collection, treat as deactivated
        accountState = 'Deactivated';
      }
    } else {
      // For non-students, get account_state from users collection
      // Use account_state if it exists, otherwise default to 'Deactivated'
      accountState = assistant.account_state || 'Deactivated';
    }
    
    // Only allow login if account_state is "Activated"
    if (accountState !== 'Activated') {
      if (assistant.role === 'student') {
        return res.status(403).json({ error: 'student_account_deactivated' });
      } else {
        return res.status(403).json({ error: 'account_deactivated' });
      }
    }

    // Check subscription status (only if subscription system is enabled).
    // Students + developers always bypass (inactive, expired, or never activated).
    // Admin/assistant are blocked unless there is an active, non-expired subscription.
    if (isSubscriptionEnabled()) {
      const subscription = await db.collection('subscription').findOne({});
      const now = new Date();
      const expirationDate = subscription?.date_of_expiration
        ? new Date(subscription.date_of_expiration)
        : null;

      // Auto-expire if past date_of_expiration
      if (subscription?.active && expirationDate && now.getTime() >= expirationDate.getTime()) {
        console.log('⏰ Subscription expiration time reached, deactivating...');
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
        invalidateSubscriptionStatusCache();
        if (subscription) subscription.active = false;
      }

      const canBypassSubscription =
        assistant.role === 'developer' || assistant.role === 'student';
      const isActive =
        Boolean(subscription?.active) &&
        (!expirationDate || now.getTime() < expirationDate.getTime());

      if (!isActive && !canBypassSubscription) {
        return res.status(403).json({
          error: 'subscription_inactive',
          message:
            'Access unavailable: Subscription expired. Please contact Tony Joseph (developer) to renew.',
        });
      }
    }

    // Device limitations logic (only if enabled and role is NOT developer)
    if (isDeviceLimitationsEnabled() && assistant.role !== 'developer') {
      if (!isUsableDeviceId(device_id)) {
        return res.status(400).json({
          error: 'device_id_required',
          message: 'A stable device identity is required to sign in.',
        });
      }

      const incomingDeviceId = String(device_id).trim();
      const ip = extractClientIp(req);
      const { browser, os, deviceType } = parseUserAgentMeta(req.headers['user-agent'] || '');

      const deviceResult = await applyDeviceLimitationsAtomic(db, assistant, {
        incomingDeviceId,
        fingerprintRaw: device_fingerprint,
        ip,
        browser,
        os,
        deviceType,
      });

      if (!deviceResult.ok) {
        if (deviceResult.error === 'device_limit_reached') {
          return res.status(403).json({ error: 'device_limit_reached' });
        }
        if (deviceResult.error === 'device_id_required') {
          return res.status(400).json({
            error: 'device_id_required',
            message: 'A stable device identity is required to sign in.',
          });
        }
        return res.status(409).json({
          error: deviceResult.error || 'device_update_conflict',
          message: 'Could not register this device. Please try again.',
        });
      }
    }
    
    const token = jwt.sign(
      { assistant_id: assistant.id, name: assistant.name, role: assistant.role },
      JWT_SECRET,
      { expiresIn: '6h' }
    );
    
    // Set HTTP-only cookie with the token
    res.setHeader('Set-Cookie', [buildAuthCookie(token)]);
    
    res.json({ success: true, message: 'Login successful', role: assistant.role });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
} 