import { MongoClient } from 'mongodb';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { hashPasswordResetToken } from '../../../../lib/authSecrets';

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
          value = value.replace(/^"|"$/g, '');
          envVars[key] = value;
        }
      }
    });
    return envVars;
  } catch {
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'topphysics';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, sig } = req.body;

  if (!id || !sig) {
    return res.status(400).json({ error: 'ID and signature are required', valid: false });
  }
  if ((typeof id !== 'string' && typeof id !== 'number') || typeof sig !== 'string') {
    return res.status(400).json({ error: 'Invalid input types', valid: false });
  }

  const safeId = String(id).replace(/[$]/g, '');

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const userId = /^\d+$/.test(safeId) ? Number(safeId) : safeId;
    const user = await db.collection('users').findOne({
      $or: [{ id: userId }, { id: safeId }],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found', valid: false });
    }

    const otpData = user.OTP_rest_password;
    if (otpData && otpData.used === true) {
      return res.json({
        valid: false,
        error: 'OTP has already been used. Please request a new OTP.',
      });
    }

    const storedHash = otpData?.reset_token_hash;
    const expires = otpData?.reset_token_expires
      ? new Date(otpData.reset_token_expires)
      : null;

    if (!storedHash || !expires) {
      return res.json({
        valid: false,
        error: 'OTP session has expired. Please request a new OTP.',
      });
    }

    if (new Date() > expires) {
      return res.json({
        valid: false,
        error: 'OTP session has expired. Please request a new OTP.',
      });
    }

    const incomingHash = hashPasswordResetToken(sig);
    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(incomingHash, 'utf8'),
        Buffer.from(String(storedHash), 'utf8')
      );
    } catch {
      isValid = false;
    }

    if (!isValid) {
      return res.json({ valid: false, error: 'Invalid signature' });
    }

    res.json({ valid: true });
  } catch (error) {
    console.error('Verify signature error:', error);
    res.status(500).json({ error: 'Failed to verify signature', valid: false });
  } finally {
    if (client) await client.close();
  }
}
