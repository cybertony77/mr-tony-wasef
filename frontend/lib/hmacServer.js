/**
 * Server-only public-link HMAC. Do NOT import this from client components —
 * use /api/students/public-link instead (see generatePublicLink.js).
 */
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
 * Prefer dedicated PUBLIC_LINK_HMAC_SECRET; fall back to JWT_SECRET.
 * No hardcoded demo secrets.
 */
export function getPublicLinkSecret() {
  const secret =
    envConfig.PUBLIC_LINK_HMAC_SECRET ||
    process.env.PUBLIC_LINK_HMAC_SECRET ||
    envConfig.JWT_SECRET ||
    process.env.JWT_SECRET;
  if (!secret || secret === 'demo_secret' || secret === 'topphysics_secret') {
    // Still sign in demo envs, but warn — rotate for production
    if (!secret) {
      throw new Error('PUBLIC_LINK_HMAC_SECRET / JWT_SECRET is not configured');
    }
  }
  return secret;
}

export function generateSignature(studentId) {
  const cleanStudentId = String(studentId || '').trim();
  if (!cleanStudentId) return '';
  const secret = getPublicLinkSecret();
  return crypto
    .createHmac('sha256', secret)
    .update(`student_public_v1:${cleanStudentId}`)
    .digest('hex');
}

export function verifySignature(studentId, signature) {
  if (!studentId || !signature) return false;
  const cleanStudentId = String(studentId).trim();
  const cleanSignature = String(signature).trim();
  if (!cleanStudentId || !cleanSignature) return false;

  try {
    const expected = generateSignature(cleanStudentId);
    if (cleanSignature.length !== expected.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature, 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false;
  }
}

export function createPublicStudentPath(studentId) {
  const signature = generateSignature(studentId);
  return `/dashboard/student_info?id=${encodeURIComponent(String(studentId))}&sig=${encodeURIComponent(signature)}`;
}
