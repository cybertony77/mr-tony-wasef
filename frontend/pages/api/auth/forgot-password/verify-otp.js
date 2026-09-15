import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import {
  createPasswordResetToken,
  hashPasswordResetToken,
} from '../../../../lib/authSecrets';
import { checkRateLimit, clientKey } from '../../../../lib/rateLimit';

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

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = checkRateLimit(clientKey(req, 'verify-otp'), { windowMs: 60 * 1000, max: 15 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec || 60));
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const { id, otp } = req.body;

  if (!id || !otp) {
    return res.status(400).json({ error: 'ID and OTP are required' });
  }
  if (typeof id !== 'string' && typeof id !== 'number') {
    return res.status(400).json({ error: 'Invalid ID type' });
  }
  if (typeof otp !== 'string') {
    return res.status(400).json({ error: 'Invalid OTP type' });
  }
  if (otp.length !== 8) {
    return res.status(400).json({ error: 'OTP must be 8 digits' });
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
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.OTP_rest_password || !user.OTP_rest_password.OTP) {
      return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    }

    if (user.OTP_rest_password.used === true) {
      return res.status(400).json({ error: 'This OTP has already been used. Please request a new one.' });
    }

    const expirationDate = new Date(user.OTP_rest_password.OTP_Expiration_Date);
    if (new Date() > expirationDate) {
      return res.status(400).json({ error: 'OTP Expired' });
    }

    const isValid = await bcrypt.compare(otp, user.OTP_rest_password.OTP);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // One-time reset token (plaintext returned once; only hash stored)
    const resetToken = createPasswordResetToken();
    const resetTokenHash = hashPasswordResetToken(resetToken);
    const resetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await db.collection('users').updateOne(
      { id: user.id },
      {
        $set: {
          'OTP_rest_password.OTP': null,
          'OTP_rest_password.used': false,
          'OTP_rest_password.reset_token_hash': resetTokenHash,
          'OTP_rest_password.reset_token_expires': resetExpires,
        },
      }
    );

    // Keep response key `sig` so existing forgot-password UI keeps working
    res.json({ success: true, message: 'OTP Verified', sig: resetToken });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP. Please try again.' });
  } finally {
    if (client) await client.close();
  }
}
