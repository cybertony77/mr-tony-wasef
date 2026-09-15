import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { sendPasswordChangeEmail } from '../../lib/emailUtils';
import { hashPasswordResetToken } from '../../../../lib/authSecrets';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = checkRateLimit(clientKey(req, 'reset-password'), { windowMs: 60 * 1000, max: 10 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec || 60));
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const { id, newPassword, sig } = req.body;

  if (!id || !newPassword) {
    return res.status(400).json({ error: 'ID and new password are required' });
  }
  if (typeof id !== 'string' && typeof id !== 'number') {
    return res.status(400).json({ error: 'Invalid ID type' });
  }
  if (typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Invalid password type' });
  }
  if (typeof sig !== 'string' || !sig) {
    return res.status(400).json({ error: 'Signature is required. Please verify OTP first.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
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

    const storedHash = user.OTP_rest_password?.reset_token_hash;
    const expires = user.OTP_rest_password?.reset_token_expires
      ? new Date(user.OTP_rest_password.reset_token_expires)
      : null;

    if (!storedHash || !expires) {
      return res.status(403).json({
        error: 'Unauthorized. Please verify OTP first.',
      });
    }

    if (new Date() > expires) {
      return res.status(403).json({
        error: 'Reset token expired. Please verify OTP again.',
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
      return res.status(403).json({
        error: 'Unauthorized. Invalid signature. Please verify OTP first.',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.collection('users').updateOne(
      { id: user.id },
      {
        $set: {
          password: hashedPassword,
          'OTP_rest_password.OTP': null,
          'OTP_rest_password.OTP_Expiration_Date': null,
          'OTP_rest_password.used': true,
          'OTP_rest_password.reset_token_hash': null,
          'OTP_rest_password.reset_token_expires': null,
        },
      }
    );

    if (user.email) {
      try {
        await sendPasswordChangeEmail(
          user.email,
          user.name || 'User',
          user.role || 'student'
        );
      } catch (emailError) {
        console.error('Failed to send password change email:', emailError);
      }
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  } finally {
    if (client) await client.close();
  }
}
