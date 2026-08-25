import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import {
  decodeGoogleMeetSecureId,
  decryptSecret,
  encodeGoogleMeetSecureId,
  encryptSecret,
} from './googleVideoIds';
import { getSharedDb } from './mongoShared';
import { composeAbortSignals, readEnvInt } from './videoStreamLifecycle';

const MEET_SCOPE = 'https://www.googleapis.com/auth/drive.meet.readonly';
const SYSTEM_INTEGRATION_ID = 'google_meet';
export const SYSTEM_GOOGLE_OWNER_ID = 'system';

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
const TOKEN_SKEW_MS = readEnvInt(envConfig, 'GOOGLE_TOKEN_SKEW_MS', 5 * 60_000);
const GOOGLE_API_TIMEOUT_MS = readEnvInt(envConfig, 'GOOGLE_API_TIMEOUT_MS', 15_000);
const GOOGLE_STREAM_CONNECT_TIMEOUT_MS = readEnvInt(
  envConfig,
  'GOOGLE_STREAM_CONNECT_TIMEOUT_MS',
  45_000
);

export function getGoogleOAuthConfig() {
  const clientId = envConfig.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret =
    envConfig.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri =
    envConfig.GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || '';
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleMeetConfigured() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  return Boolean(clientId && clientSecret && redirectUri);
}

function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    const err = new Error('Google Meet OAuth is not configured');
    err.statusCode = 500;
    throw err;
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** In-memory access-token cache keyed by staff user id. */
const accessTokenCache = new Map();
/** Single-flight refresh promises keyed by owner. */
const accessTokenRefreshPromises = new Map();

export function clearGoogleAccessTokenCache(ownerUserId) {
  if (ownerUserId == null || ownerUserId === '') {
    accessTokenCache.clear();
    accessTokenRefreshPromises.clear();
    return;
  }
  const key = String(ownerUserId);
  accessTokenCache.delete(key);
  accessTokenRefreshPromises.delete(key);
}

export function getGoogleAuthUrl(state) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [MEET_SCOPE],
    state: String(state || ''),
  });
}

export async function exchangeGoogleAuthCode(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(String(code || ''));
  return tokens;
}

async function withUsersCollection(fn) {
  // Shared process client — do not connect/close per Google token or OAuth call.
  const db = await getSharedDb();
  return fn(db.collection('users'), db);
}

async function withIntegrationsCollection(fn) {
  const db = await getSharedDb();
  return fn(db.collection('system_integrations'), db);
}

function mapSystemIntegration(doc) {
  if (!doc?.connected || !doc.refresh_token) return null;
  return {
    userId: SYSTEM_GOOGLE_OWNER_ID,
    email: doc.email || '',
    connectedAt: doc.connected_at || null,
    refreshTokenEnc: doc.refresh_token || '',
    connectedBy: doc.connected_by || null,
  };
}

export async function getSystemGoogleMeetIntegration() {
  return withIntegrationsCollection(async (integrations) => {
    const doc = await integrations.findOne({ _id: SYSTEM_INTEGRATION_ID });
    return mapSystemIntegration(doc);
  });
}

async function getLegacyUserGoogleMeetIntegration(ownerUserId) {
  const id = ownerUserId;
  if (id == null || id === '' || String(id) === SYSTEM_GOOGLE_OWNER_ID) return null;
  return withUsersCollection(async (users) => {
    const user =
      (await users.findOne({ id })) ||
      (await users.findOne({ id: Number(id) })) ||
      (await users.findOne({ id: String(id) }));
    const integration = user?.google_meet;
    if (!integration || !integration.connected || !integration.refresh_token) return null;
    return {
      userId: user.id,
      email: integration.email || '',
      connectedAt: integration.connected_at || null,
      refreshTokenEnc: integration.refresh_token || '',
    };
  });
}

async function findAnyLegacyGoogleMeetIntegration() {
  return withUsersCollection(async (users) => {
    const user = await users.findOne(
      {
        'google_meet.connected': true,
        'google_meet.refresh_token': { $exists: true, $ne: '' },
      },
      { projection: { id: 1, google_meet: 1 } }
    );
    if (!user?.google_meet?.refresh_token) return null;
    return {
      userId: user.id,
      email: user.google_meet.email || '',
      connectedAt: user.google_meet.connected_at || null,
      refreshTokenEnc: user.google_meet.refresh_token || '',
    };
  });
}

/** Shared system connection first; legacy per-user fallback for older data / playback. */
export async function getGoogleMeetIntegration(ownerUserId) {
  const system = await getSystemGoogleMeetIntegration();
  if (system) return system;

  if (ownerUserId != null && ownerUserId !== '') {
    const legacy = await getLegacyUserGoogleMeetIntegration(ownerUserId);
    if (legacy) return legacy;
  }

  return findAnyLegacyGoogleMeetIntegration();
}

export async function saveGoogleMeetIntegration(_ownerUserId, { email, refreshToken, connectedBy } = {}) {
  const refresh = String(refreshToken || '').trim();
  if (!refresh) {
    throw new Error('Google did not return a refresh token. Reconnect and grant consent.');
  }

  return withIntegrationsCollection(async (integrations) => {
    await integrations.updateOne(
      { _id: SYSTEM_INTEGRATION_ID },
      {
        $set: {
          connected: true,
          email: String(email || '').trim(),
          refresh_token: encryptSecret(refresh),
          connected_at: new Date().toISOString(),
          connected_by: connectedBy || null,
        },
      },
      { upsert: true }
    );
    clearGoogleAccessTokenCache(SYSTEM_GOOGLE_OWNER_ID);
    return true;
  });
}

export async function disconnectGoogleMeetIntegration(_ownerUserId) {
  await withIntegrationsCollection(async (integrations) => {
    await integrations.updateOne(
      { _id: SYSTEM_INTEGRATION_ID },
      {
        $set: {
          connected: false,
          email: '',
          refresh_token: '',
          disconnected_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );
  });

  await withUsersCollection(async (users) => {
    await users.updateMany(
      { 'google_meet.connected': true },
      {
        $set: {
          'google_meet.connected': false,
          'google_meet.email': '',
          'google_meet.refresh_token': '',
          'google_meet.disconnected_at': new Date().toISOString(),
        },
      }
    );
  });

  clearGoogleAccessTokenCache();
  return true;
}

export async function markGoogleMeetDisconnected(ownerUserId) {
  return disconnectGoogleMeetIntegration(ownerUserId);
}

async function fetchGoogleUserEmail(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return '';
    const data = await res.json();
    return String(data?.email || '').trim();
  } catch {
    return '';
  }
}

export async function completeGoogleOAuthForUser(_ownerUserId, code, connectedBy = null) {
  const tokens = await exchangeGoogleAuthCode(code);
  const refreshToken = tokens.refresh_token;
  const accessToken = tokens.access_token;
  let email = '';
  if (accessToken) {
    email = await fetchGoogleUserEmail(accessToken);
  }
  // If Google did not return a new refresh token, keep the previous one when reconnecting
  if (!refreshToken) {
    const existing = await getGoogleMeetIntegration();
    if (existing?.refreshTokenEnc) {
      const prev = decryptSecret(existing.refreshTokenEnc);
      if (prev) {
        await saveGoogleMeetIntegration(SYSTEM_GOOGLE_OWNER_ID, {
          email: email || existing.email,
          refreshToken: prev,
          connectedBy,
        });
        if (accessToken) {
          accessTokenCache.set(SYSTEM_GOOGLE_OWNER_ID, {
            token: accessToken,
            expiresAt: Date.now() + Math.max(0, (tokens.expiry_date || Date.now() + 3500_000) - Date.now()),
          });
        }
        return { email: email || existing.email };
      }
    }
    const err = new Error(
      'Google did not return a refresh token. Disconnect Google, then connect again and approve access.'
    );
    err.statusCode = 400;
    throw err;
  }

  await saveGoogleMeetIntegration(SYSTEM_GOOGLE_OWNER_ID, { email, refreshToken, connectedBy });
  if (accessToken) {
    accessTokenCache.set(SYSTEM_GOOGLE_OWNER_ID, {
      token: accessToken,
      expiresAt: tokens.expiry_date || Date.now() + 3500_000,
    });
  }
  return { email };
}

/**
 * Returns a valid access token for the staff user who connected Google.
 * Renews BEFORE expiry (TOKEN_SKEW_MS). Concurrent callers share one refresh.
 * On invalid_grant, marks integration disconnected and throws.
 */
export async function getGoogleAccessTokenForUser(ownerUserId, forceRefresh = false) {
  const integration = await getGoogleMeetIntegration(ownerUserId);
  if (!integration?.refreshTokenEnc) {
    const err = new Error('Google account connection required.');
    err.statusCode = 403;
    err.code = 'GOOGLE_NOT_CONNECTED';
    throw err;
  }

  const ownerKey = String(integration.userId ?? SYSTEM_GOOGLE_OWNER_ID);

  if (forceRefresh) {
    accessTokenCache.delete(ownerKey);
  }

  const cached = accessTokenCache.get(ownerKey);
  if (
    !forceRefresh &&
    cached?.token &&
    cached.expiresAt &&
    cached.expiresAt - TOKEN_SKEW_MS > Date.now()
  ) {
    return cached.token;
  }

  // Always single-flight (including forceRefresh / 401 retry) so N near-expiry
  // callers share exactly one OAuth refresh.
  if (accessTokenRefreshPromises.has(ownerKey)) {
    return accessTokenRefreshPromises.get(ownerKey);
  }

  const refreshPromise = (async () => {
    const refreshToken = decryptSecret(integration.refreshTokenEnc);
    if (!refreshToken) {
      await markGoogleMeetDisconnected(ownerUserId);
      const err = new Error('Google account connection required.');
      err.statusCode = 403;
      err.code = 'GOOGLE_NOT_CONNECTED';
      throw err;
    }

    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });

    try {
      const { credentials } = await client.refreshAccessToken();
      const token = credentials.access_token;
      if (!token) {
        throw new Error('Failed to refresh Google access token');
      }
      accessTokenCache.set(ownerKey, {
        token,
        expiresAt: credentials.expiry_date || Date.now() + 3500_000,
      });
      return token;
    } catch (error) {
      const msg = String(error?.message || error?.response?.data?.error || '');
      const dataError = error?.response?.data?.error;
      if (
        dataError === 'invalid_grant' ||
        msg.includes('invalid_grant') ||
        msg.includes('Token has been expired or revoked')
      ) {
        await markGoogleMeetDisconnected(ownerUserId);
        const err = new Error('Google account connection required.');
        err.statusCode = 403;
        err.code = 'GOOGLE_NOT_CONNECTED';
        throw err;
      }
      throw error;
    }
  })();

  accessTokenRefreshPromises.set(ownerKey, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    // Only clear if we still own the slot (avoids wiping a newer in-flight refresh).
    if (accessTokenRefreshPromises.get(ownerKey) === refreshPromise) {
      accessTokenRefreshPromises.delete(ownerKey);
    }
  }
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);
    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${getPart('day')}/${getPart('month')}/${getPart('year')} at ${getPart('hour')}:${getPart('minute')} ${(getPart('dayPeriod') || '').toUpperCase()}`;
  } catch {
    return date.toISOString();
  }
}

function formatDurationMs(durationMs) {
  const totalSec = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  return `${String(hours).padStart(2, '0')}h:${String(mins).padStart(2, '0')}m`;
}

export async function listGoogleMeetRecordings(_ownerUserId, pageToken = '') {
  const accessToken = await getGoogleAccessTokenForUser();
  const client = createOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: client });

  let response;
  try {
    response = await drive.files.list({
      q: "mimeType contains 'video/' and trashed = false",
      pageSize: 50,
      pageToken: pageToken || undefined,
      orderBy: 'createdTime desc',
      fields:
        'nextPageToken, files(id, name, createdTime, modifiedTime, mimeType, size, videoMediaMetadata, webViewLink)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
  } catch (error) {
    const status = error?.response?.status;
    if (status === 401) {
      clearGoogleAccessTokenCache(SYSTEM_GOOGLE_OWNER_ID);
      const retryToken = await getGoogleAccessTokenForUser(null, true);
      client.setCredentials({ access_token: retryToken });
      response = await drive.files.list({
        q: "mimeType contains 'video/' and trashed = false",
        pageSize: 50,
        pageToken: pageToken || undefined,
        orderBy: 'createdTime desc',
        fields:
          'nextPageToken, files(id, name, createdTime, modifiedTime, mimeType, size, videoMediaMetadata)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
    } else {
      throw error;
    }
  }

  const files = Array.isArray(response?.data?.files) ? response.data.files : [];
  const recordings = files.map((file) => {
    const fileId = String(file.id || '').trim();
    const secureId = encodeGoogleMeetSecureId({
      fileId,
      ownerUserId: SYSTEM_GOOGLE_OWNER_ID,
    });
    const durationMs = Number(file?.videoMediaMetadata?.durationMillis || 0);
    return {
      id: secureId,
      title: file.name || 'Untitled recording',
      name: file.name || 'Untitled recording',
      createdAt: file.createdTime || null,
      modifiedAt: file.modifiedTime || null,
      mimeType: file.mimeType || '',
      size: file.size != null ? Number(file.size) : null,
      durationMs: durationMs || null,
      created_at_formated: formatDateTime(file.createdTime),
      duration_furmated: durationMs ? formatDurationMs(durationMs) : '-',
    };
  });

  return {
    recordings,
    next_page_token: response?.data?.nextPageToken || '',
  };
}

/**
 * Stream a private Drive file. Forwards Range when provided.
 * Does not buffer the whole file in memory.
 * @param {object} opts
 * @param {AbortSignal} [opts.signal] - linked to browser request; aborts Undici body
 * @param {number} [opts.connectTimeoutMs] - startup timeout only (cleared by caller after headers)
 */
export async function fetchGoogleDriveFileStream({
  ownerUserId,
  fileId,
  rangeHeader,
  method = 'GET',
  forceRefresh = false,
  signal = null,
  connectTimeoutMs = GOOGLE_STREAM_CONNECT_TIMEOUT_MS,
}) {
  const accessToken = await getGoogleAccessTokenForUser(ownerUserId, forceRefresh);
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (rangeHeader) {
    headers.Range = rangeHeader;
  }

  const doFetch = async (token) => {
    const localHeaders = { ...headers, Authorization: `Bearer ${token}` };
    const timeoutController =
      connectTimeoutMs > 0 ? new AbortController() : null;
    const timeoutId =
      timeoutController &&
      setTimeout(() => {
        try {
          timeoutController.abort();
        } catch {
          /* ignore */
        }
      }, connectTimeoutMs);

    const signals = [];
    if (signal) signals.push(signal);
    if (timeoutController) signals.push(timeoutController.signal);
    // Always compose — never drop the connect timeout when AbortSignal.any is missing.
    const combinedSignal = composeAbortSignals(signals);

    try {
      const response = await fetch(url, {
        method,
        headers: localHeaders,
        signal: combinedSignal,
      });
      // Headers received — stop connect timer; keep client signal for body cancel.
      if (timeoutId) clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
        if (signal?.aborted) {
          const err = new Error('Google Drive request aborted');
          err.statusCode = 499;
          err.isAbort = true;
          throw err;
        }
        const err = new Error(
          `Google Drive stream connect timed out after ${connectTimeoutMs}ms`
        );
        err.statusCode = 504;
        err.isTimeout = true;
        throw err;
      }
      throw error;
    }
  };

  let response = await doFetch(accessToken);

  if (response.status === 401 || response.status === 403) {
    clearGoogleAccessTokenCache(ownerUserId);
    const retryToken = await getGoogleAccessTokenForUser(ownerUserId, true);
    response = await doFetch(retryToken);
  }

  return response;
}

/**
 * Confirm the Drive file id is assigned to at least one lesson/video in our DB.
 */
export async function assertGoogleMeetFileAssigned(fileId) {
  const id = String(fileId || '').trim();
  if (!id) return false;
  try {
    const db = await getSharedDb();

    const orClauses = [
      { session_video_type: 'google_meet', session_video_id: id },
    ];
    for (let i = 1; i <= 30; i += 1) {
      orClauses.push({
        [`video_type_${i}`]: 'google_meet',
        [`video_ID_${i}`]: id,
      });
    }

    for (const name of ['online_sessions', 'homeworks_videos', 'marketing_page']) {
      const hit = await db.collection(name).findOne({ $or: orClauses }, { projection: { _id: 1 } });
      if (hit) return true;
    }
    return false;
  } catch (error) {
    console.error('[google] assertGoogleMeetFileAssigned failed:', error?.message || error);
    return false;
  }
}

/**
 * Resolve google_meet video_id from client (secure id) into DB fields.
 */
export function resolveGoogleMeetVideoForSave(videoId, _fallbackOwnerUserId) {
  const raw = String(videoId || '').trim();
  if (!raw) return null;

  const decoded = decodeGoogleMeetSecureId(raw);
  if (decoded?.fileId) {
    return {
      fileId: decoded.fileId,
      ownerUserId: decoded.ownerUserId || SYSTEM_GOOGLE_OWNER_ID,
    };
  }

  // Reject raw Drive file ids from the client — only opaque secure ids are accepted.
  return null;
}
