import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index === -1) return;
      const key = trimmed.substring(0, index).trim();
      let value = trimmed.substring(index + 1).trim();
      value = value.replace(/^"|"$/g, '');
      envVars[key] = value;
    });
    return envVars;
  } catch {
    return {};
  }
}

const envConfig = loadEnvConfig();
const SECRET =
  envConfig.JWT_SECRET ||
  process.env.JWT_SECRET ||
  'google-meet-video-fallback-secret';

const KEY = crypto.createHash('sha256').update(`google-meet-video:${SECRET}`).digest();

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(str) {
  const raw = String(str || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  const pad = raw.length % 4 === 0 ? '' : '='.repeat(4 - (raw.length % 4));
  return Buffer.from(raw + pad, 'base64');
}

/**
 * Opaque playback / selector id. Not reversible without JWT_SECRET.
 * Payload: { f: driveFileId, o: ownerUserId, v: 1 }
 * IV is derived from the payload so the same file+owner always maps to the same URL id.
 */
export function encodeGoogleMeetSecureId({ fileId, ownerUserId }) {
  const driveFileId = String(fileId || '').trim();
  const ownerId = String(ownerUserId ?? '').trim();
  if (!driveFileId) return '';

  const payload = Buffer.from(
    JSON.stringify({ f: driveFileId, o: ownerId, v: 1 }),
    'utf8'
  );
  const iv = crypto.createHmac('sha256', KEY).update(`iv:${driveFileId}:${ownerId}`).digest().subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return toBase64Url(Buffer.concat([iv, tag, encrypted]));
}

export function decodeGoogleMeetSecureId(secureId) {
  const raw = String(secureId || '').trim();
  if (!raw) return null;
  try {
    const buf = fromBase64Url(raw);
    if (buf.length < 12 + 16 + 1) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString('utf8'));
    const fileId = String(parsed?.f || '').trim();
    if (!fileId) return null;
    return {
      fileId,
      ownerUserId: String(parsed?.o || '').trim(),
      version: parsed?.v || 1,
    };
  } catch {
    return null;
  }
}

/** Encrypt refresh token at rest (same key material). */
export function encryptSecret(plaintext) {
  const text = String(plaintext || '');
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${toBase64Url(Buffer.concat([iv, tag, encrypted]))}`;
}

export function decryptSecret(ciphertext) {
  const raw = String(ciphertext || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('v1:')) return raw; // legacy plaintext fallback
  try {
    const buf = fromBase64Url(raw.slice(3));
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Replace raw Drive file IDs with opaque secure IDs before sending docs to the browser.
 */
export function maskGoogleMeetIdsInDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const next = { ...doc };
  for (let i = 1; i <= 50; i += 1) {
    const typeKey = `video_type_${i}`;
    const idKey = `video_ID_${i}`;
    const ownerKey = `video_google_owner_${i}`;
    if (String(next[typeKey] || '').toLowerCase() !== 'google_meet') continue;
    const fileId = String(next[idKey] || '').trim();
    if (!fileId) continue;
    // Already opaque?
    if (decodeGoogleMeetSecureId(fileId)) continue;
    const ownerUserId = String(next[ownerKey] || '').trim();
    next[idKey] = encodeGoogleMeetSecureId({ fileId, ownerUserId });
  }

  if (String(next.session_video_type || '').toLowerCase() === 'google_meet') {
    const fileId = String(next.session_video_id || '').trim();
    const ownerUserId = String(next.session_video_google_owner || '').trim();
    if (fileId && !decodeGoogleMeetSecureId(fileId)) {
      next.session_video_id = encodeGoogleMeetSecureId({ fileId, ownerUserId });
    }
  }

  return next;
}

export function maskGoogleMeetIdsInDocuments(docs) {
  if (!Array.isArray(docs)) return docs;
  return docs.map((doc) => maskGoogleMeetIdsInDocument(doc));
}
