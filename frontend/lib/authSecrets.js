import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function loadEnvConfig() {
  try {
    const candidates = [
      path.join(process.cwd(), '..', 'env.config'),
      path.join(process.cwd(), 'env.config'),
    ];
    let envContent = null;
    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        break;
      }
    }
    if (!envContent) return {};
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

/**
 * JWT signing/verify secret. No hardcoded production fallbacks.
 * Demo weak values still work so local doesn't crash — rotate in prod.
 */
export function getJwtSecret() {
  const secret = envConfig.JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

/** Auth cookie flags — Secure when serving over HTTPS / production. */
export function buildAuthCookie(token, maxAgeSec = 6 * 60 * 60) {
  const domain = String(envConfig.SYSTEM_DOMAIN || process.env.SYSTEM_DOMAIN || '');
  const useSecure =
    process.env.NODE_ENV === 'production' ||
    domain.startsWith('https://') ||
    process.env.FORCE_SECURE_COOKIES === 'true';

  const parts = [
    `token=${token}`,
    'HttpOnly',
    useSecure ? 'Secure' : '',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAgeSec}`,
  ].filter(Boolean);

  return parts.join('; ');
}

export function clearAuthCookieHeader() {
  const domain = String(envConfig.SYSTEM_DOMAIN || process.env.SYSTEM_DOMAIN || '');
  const useSecure =
    process.env.NODE_ENV === 'production' ||
    domain.startsWith('https://') ||
    process.env.FORCE_SECURE_COOKIES === 'true';

  return [
    `token=; HttpOnly; ${useSecure ? 'Secure; ' : ''}SameSite=Strict; Path=/; Max-Age=0`,
  ];
}

/** One-time password-reset token helpers */
export function createPasswordResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
