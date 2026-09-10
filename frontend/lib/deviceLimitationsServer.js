/**
 * Server-side device-limitation helpers.
 * Used by /api/auth/login for robust matching + race-safe updates.
 */

import crypto from 'crypto';
import UAParser from 'ua-parser-js';

const MAX_IP_HISTORY = 15;
const MIN_FINGERPRINT_LENGTH = 40;

const DEVICE_LOG =
  process.env.DEVICE_LIMITATIONS_DEBUG === 'true' ||
  process.env.NODE_ENV !== 'production';

export function deviceLog(payload) {
  if (!DEVICE_LOG) return;
  try {
    console.log('DEVICE CHECK', payload);
  } catch {
    /* ignore */
  }
}

export function hashDeviceFingerprint(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < MIN_FINGERPRINT_LENGTH) return null;
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest('hex');
}

export function isUsableDeviceId(deviceId) {
  if (typeof deviceId !== 'string') return false;
  const trimmed = deviceId.trim();
  if (!trimmed || trimmed === 'unknown-device') return false;
  return trimmed.length >= 8 && trimmed.length <= 128;
}

export function formatEgyptDateTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} at ${get('hour')}:${get('minute')} ${String(get('dayPeriod') || '').toUpperCase()}`;
}

export function extractClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ipFromHeader = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || '')
        .split(',')[0]
        .trim();
  return (
    ipFromHeader ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown'
  );
}

export function parseUserAgentMeta(userAgent) {
  let browser = 'Unknown';
  let os = 'Unknown';
  let deviceType = 'desktop';
  try {
    const parser = new UAParser(userAgent || '');
    const result = parser.getResult();
    if (result.browser?.name) browser = result.browser.name;
    if (result.os?.name) os = result.os.name;
    if (result.device?.type) deviceType = result.device.type;
  } catch {
    /* defaults */
  }
  return { browser, os, deviceType };
}

function normalizeIpHistory(existingHistory, ip, nowFormatted) {
  const history = Array.isArray(existingHistory) ? [...existingHistory] : [];
  if (!ip || ip === 'unknown') {
    return history.slice(0, MAX_IP_HISTORY);
  }
  const idx = history.findIndex((h) => h && h.ip === ip);
  if (idx >= 0) {
    history[idx] = { ...history[idx], ip, last_seen: nowFormatted };
    const [entry] = history.splice(idx, 1);
    history.unshift(entry);
  } else {
    history.unshift({ ip, last_seen: nowFormatted });
  }
  return history.slice(0, MAX_IP_HISTORY);
}

/**
 * Find existing device by exact device_id, then by fingerprint_hash.
 * @returns {{ index: number, matchType: 'device_id' | 'fingerprint' | null, device: object | null }}
 */
export function findMatchingDevice(devices, incomingDeviceId, fingerprintHash) {
  const list = Array.isArray(devices) ? devices : [];

  if (isUsableDeviceId(incomingDeviceId)) {
    const byId = list.findIndex((d) => d && d.device_id === incomingDeviceId);
    if (byId >= 0) {
      return { index: byId, matchType: 'device_id', device: list[byId] };
    }
  }

  if (fingerprintHash && typeof fingerprintHash === 'string') {
    const byFp = list.findIndex(
      (d) =>
        d &&
        typeof d.fingerprint_hash === 'string' &&
        d.fingerprint_hash.length >= 32 &&
        d.fingerprint_hash === fingerprintHash
    );
    if (byFp >= 0) {
      return { index: byFp, matchType: 'fingerprint', device: list[byFp] };
    }
  }

  return { index: -1, matchType: null, device: null };
}

export function buildUpdatedDeviceRecord({
  existing,
  incomingDeviceId,
  fingerprintHash,
  ip,
  browser,
  os,
  deviceType,
  nowFormatted,
  isNew,
}) {
  const base = existing && typeof existing === 'object' ? { ...existing } : {};
  const firstLogin = isNew ? nowFormatted : base.first_login || nowFormatted;
  const ipHistory = normalizeIpHistory(base.ip_history, ip, nowFormatted);

  const next = {
    ...base,
    device_id: incomingDeviceId,
    browser: browser || base.browser || 'Unknown',
    os: os || base.os || 'Unknown',
    device_type: deviceType || base.device_type || 'desktop',
    first_login: firstLogin,
    last_login: nowFormatted,
    last_ip: ip,
    ip: ip || base.ip || 'unknown',
    ip_history: ipHistory,
  };

  if (fingerprintHash) {
    next.fingerprint_hash = fingerprintHash;
  } else if (base.fingerprint_hash) {
    next.fingerprint_hash = base.fingerprint_hash;
  }

  return next;
}

/**
 * Apply device limitations with atomic Mongo updates + retries.
 *
 * Match order: device_id → fingerprint_hash → new device (with limit check).
 *
 * @returns {Promise<{ ok: true, action: string, deviceCount: number, allowedDevices: number } | { ok: false, error: string }>}
 */
export async function applyDeviceLimitationsAtomic(db, userDoc, {
  incomingDeviceId,
  fingerprintRaw,
  ip,
  browser,
  os,
  deviceType,
}) {
  if (!isUsableDeviceId(incomingDeviceId)) {
    return { ok: false, error: 'device_id_required' };
  }

  const fingerprintHash = hashDeviceFingerprint(fingerprintRaw);
  const nowFormatted = formatEgyptDateTime(new Date());
  const MAX_RETRIES = 6;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const fresh = await db.collection('users').findOne(
      { _id: userDoc._id },
      { projection: { device_limitations: 1, id: 1, role: 1 } }
    );
    if (!fresh) {
      return { ok: false, error: 'user_not_found' };
    }

    const existingLimitations = fresh.device_limitations || {};
    const allowedDevices =
      typeof existingLimitations.allowed_devices === 'number'
        ? existingLimitations.allowed_devices
        : 1;
    const devices = Array.isArray(existingLimitations.devices)
      ? existingLimitations.devices
      : [];

    const { index, matchType, device: matched } = findMatchingDevice(
      devices,
      incomingDeviceId,
      fingerprintHash
    );

    // --- Existing device (by ID or fingerprint) ---
    if (index >= 0 && matched) {
      const updatedDevice = buildUpdatedDeviceRecord({
        existing: matched,
        incomingDeviceId,
        fingerprintHash,
        ip,
        browser,
        os,
        deviceType,
        nowFormatted,
        isNew: false,
      });
      const repaired =
        matchType === 'fingerprint' && matched.device_id !== incomingDeviceId;
      const action = repaired ? 'EXISTING_DEVICE_REPAIRED_ID' : 'EXISTING_DEVICE';

      // Match on the stable key we found so concurrent writers don't clobber the wrong slot
      const matchFilter =
        matchType === 'device_id'
          ? {
              _id: fresh._id,
              'device_limitations.devices.device_id': matched.device_id,
            }
          : {
              _id: fresh._id,
              'device_limitations.devices.fingerprint_hash': matched.fingerprint_hash,
            };

      const updateResult = await db.collection('users').updateOne(matchFilter, {
        $set: {
          'device_limitations.devices.$': updatedDevice,
          'device_limitations.last_login': nowFormatted,
          'device_limitations.allowed_devices': allowedDevices,
        },
      });

      if (updateResult.matchedCount === 1) {
        deviceLog({
          User: fresh.id,
          IncomingDeviceId: incomingDeviceId,
          ExactIdMatch: matchType === 'device_id',
          FingerprintMatch: matchType === 'fingerprint',
          MatchedExistingDevice: matched.device_id || null,
          DeviceCount: devices.length,
          AllowedDevices: allowedDevices,
          Action: action,
          Attempt: attempt + 1,
          HasFingerprint: Boolean(fingerprintHash),
        });
        return {
          ok: true,
          action,
          deviceCount: devices.length,
          allowedDevices,
        };
      }

      deviceLog({
        User: fresh.id,
        IncomingDeviceId: incomingDeviceId,
        Action: 'RETRY_CONFLICT_EXISTING',
        Attempt: attempt + 1,
      });
      continue;
    }

    // --- New device ---
    if (devices.length >= allowedDevices) {
      deviceLog({
        User: fresh.id,
        IncomingDeviceId: incomingDeviceId,
        ExactIdMatch: false,
        FingerprintMatch: false,
        MatchedExistingDevice: null,
        DeviceCount: devices.length,
        AllowedDevices: allowedDevices,
        Action: 'BLOCKED',
        Attempt: attempt + 1,
      });
      return { ok: false, error: 'device_limit_reached' };
    }

    const newDevice = buildUpdatedDeviceRecord({
      existing: null,
      incomingDeviceId,
      fingerprintHash,
      ip,
      browser,
      os,
      deviceType,
      nowFormatted,
      isNew: true,
    });

    const pushFilter = {
      _id: fresh._id,
      'device_limitations.devices.device_id': { $ne: incomingDeviceId },
      $expr: {
        $lt: [
          { $size: { $ifNull: ['$device_limitations.devices', []] } },
          allowedDevices,
        ],
      },
    };
    if (fingerprintHash) {
      pushFilter['device_limitations.devices.fingerprint_hash'] = {
        $ne: fingerprintHash,
      };
    }

    const pushResult = await db.collection('users').updateOne(pushFilter, {
      $set: {
        'device_limitations.allowed_devices': allowedDevices,
        'device_limitations.last_login': nowFormatted,
      },
      $push: {
        'device_limitations.devices': newDevice,
      },
    });

    if (pushResult.modifiedCount === 1) {
      deviceLog({
        User: fresh.id,
        IncomingDeviceId: incomingDeviceId,
        ExactIdMatch: false,
        FingerprintMatch: false,
        MatchedExistingDevice: null,
        DeviceCount: devices.length + 1,
        AllowedDevices: allowedDevices,
        Action: 'NEW_DEVICE',
        Attempt: attempt + 1,
        HasFingerprint: Boolean(fingerprintHash),
      });
      return {
        ok: true,
        action: 'NEW_DEVICE',
        deviceCount: devices.length + 1,
        allowedDevices,
      };
    }

    // Another request may have registered this device_id/fingerprint or filled the slots
    deviceLog({
      User: fresh.id,
      IncomingDeviceId: incomingDeviceId,
      Action: 'RETRY_CONFLICT_NEW',
      Attempt: attempt + 1,
    });
  }

  return { ok: false, error: 'device_update_conflict' };
}
