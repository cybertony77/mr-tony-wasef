import fs from 'fs';
import path from 'path';
import {
  extractZoomDownloadKey,
  extractZoomMeetingId,
  getMp4DownloadUrlFromMeeting,
  isZoomRecordingUuid,
} from './zoomUtils';
import { readEnvInt } from './videoStreamLifecycle';
import { getEgyptYmdToday, addDaysEgyptYmd } from './egyptDateTime';

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

/** Live Zoom S2S credentials (re-read env so key rotation works without restart). */
function getZoomCredentials() {
  const envConfig = loadEnvConfig();
  return {
    envConfig,
    clientId: envConfig.ZOOM_CLIENT_ID || process.env.ZOOM_CLIENT_ID || '',
    clientSecret: envConfig.ZOOM_CLIENT_SECRET || process.env.ZOOM_CLIENT_SECRET || '',
    accountId: envConfig.ZOOM_ACCOUNT_ID || process.env.ZOOM_ACCOUNT_ID || '',
  };
}

function getZoomRuntimeConfig() {
  const { envConfig } = getZoomCredentials();
  return {
    oauthTimeoutMs: readEnvInt(envConfig, 'ZOOM_OAUTH_TIMEOUT_MS', 12_000),
    oauthMaxAttempts: 3,
    tokenSkewMs: readEnvInt(envConfig, 'ZOOM_TOKEN_SKEW_MS', 10 * 60_000),
    apiTimeoutMs: readEnvInt(envConfig, 'ZOOM_API_TIMEOUT_MS', 12_000),
    listFetchMs: readEnvInt(envConfig, 'ZOOM_LIST_FETCH_MS', 15_000),
  };
}

let cachedToken = null;
let cachedTokenExpiresAt = 0;
/** Single-flight mutex: concurrent callers share one in-progress OAuth refresh. */
let tokenPromise = null;
/** Tracks which credential fingerprint produced the cache (forces refresh on env change). */
let cachedCredFingerprint = '';

function zoomCredFingerprint(creds) {
  return `${creds.clientId}|${creds.accountId}|${String(creds.clientSecret).slice(0, 8)}`;
}

function ensureZoomEnv() {
  const creds = getZoomCredentials();
  if (!creds.clientId || !creds.clientSecret || !creds.accountId) {
    throw new Error('Zoom configuration is missing');
  }
  const fp = zoomCredFingerprint(creds);
  if (cachedCredFingerprint && cachedCredFingerprint !== fp) {
    clearZoomAccessTokenCache();
  }
  cachedCredFingerprint = fp;
  return creds;
}

export function clearZoomAccessTokenCache() {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableOAuthFailure(error, statusCode) {
  if (statusCode === 400 || statusCode === 401 || statusCode === 403) return false;
  if (statusCode >= 500) return true;
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return true;
  if (error?.isTimeout) return true;
  if (error?.isNetworkError) return true;
  // fetch network failures typically have no statusCode
  if (!statusCode && error) return true;
  return false;
}

function extractZoomErrorFields(payload) {
  const zoomCode =
    payload?.code != null && payload.code !== ''
      ? payload.code
      : payload?.errorCode != null && payload.errorCode !== ''
        ? payload.errorCode
        : null;
  const zoomMessage =
    payload?.message ||
    payload?.reason ||
    payload?.error ||
    null;
  return { zoomCode, zoomMessage };
}

/**
 * Build a Zoom API error that preserves HTTP status + Zoom body fields for logs/callers.
 */
function createZoomApiError(response, payload, fallbackMessage = 'Zoom API failure') {
  const { zoomCode, zoomMessage } = extractZoomErrorFields(payload);
  const message = zoomMessage || fallbackMessage;
  const err = new Error(message);
  err.statusCode = response?.status || 502;
  err.zoomCode = zoomCode;
  err.zoomMessage = zoomMessage;
  err.details = payload || null;
  return err;
}

function logZoomApiError(context, response, payload, extra = {}) {
  const { zoomCode, zoomMessage } = extractZoomErrorFields(payload);
  console.error(`[zoom-api] ${context}`, {
    httpStatus: response?.status ?? null,
    zoomCode,
    zoomMessage,
    ...extra,
  });
}

async function fetchZoomApi(url, { method = 'GET', headers = {}, timeoutMs, context = 'request' } = {}) {
  const resolvedTimeout = timeoutMs ?? getZoomRuntimeConfig().apiTimeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), resolvedTimeout);
  const startedAt = Date.now();

  try {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
        const err = new Error(`Zoom API request timed out after ${resolvedTimeout}ms (${context})`);
        err.statusCode = 504;
        err.isTimeout = true;
        console.error('[zoom-api] timeout', {
          context,
          timeoutMs: resolvedTimeout,
          durationMs: Date.now() - startedAt,
        });
        throw err;
      }
      const err = new Error(error?.message || `Zoom API network error (${context})`);
      err.statusCode = 502;
      err.isNetworkError = true;
      console.error('[zoom-api] network error', {
        context,
        message: err.message,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }

    const payload = await response.json().catch(() => ({}));
    return { response, payload, durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Single OAuth account_credentials request with AbortController timeout.
 * @returns {{ accessToken: string, expiresAt: number, expiresIn: number }}
 */
async function requestAccessTokenOnce() {
  const creds = ensureZoomEnv();
  const { oauthTimeoutMs } = getZoomRuntimeConfig();
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const tokenUrl =
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), oauthTimeoutMs);
  const startedAt = Date.now();

  try {
    let response;
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
        const err = new Error(`Zoom OAuth request timed out after ${oauthTimeoutMs}ms`);
        err.statusCode = 504;
        err.isTimeout = true;
        console.error('[zoom-oauth] timeout', { timeoutMs: oauthTimeoutMs });
        throw err;
      }
      const err = new Error(error?.message || 'Zoom OAuth network error');
      err.statusCode = 502;
      err.isNetworkError = true;
      console.error('[zoom-oauth] network error', { message: err.message });
      throw err;
    }

    const payload = await response.json().catch(() => ({}));
    console.log('[zoom-oauth] response status', {
      status: response.status,
      durationMs: Date.now() - startedAt,
    });

    if (!response.ok || !payload?.access_token) {
      const { zoomCode, zoomMessage } = extractZoomErrorFields(payload);
      const message = zoomMessage || payload?.reason || 'Failed to generate Zoom token';
      console.error('[zoom-oauth] token request failed', {
        httpStatus: response.status,
        zoomCode,
        zoomMessage: message,
      });
      const err = new Error(message);
      err.statusCode = response.status || 502;
      err.zoomCode = zoomCode;
      err.zoomMessage = message;
      err.details = payload;
      throw err;
    }

    const expiresIn = Number(payload.expires_in || 3600);
    const expiresAt = Date.now() + expiresIn * 1000;
    return {
      accessToken: payload.access_token,
      expiresAt,
      expiresIn,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateAccessTokenWithRetry() {
  const overallStartedAt = Date.now();
  const { oauthMaxAttempts } = getZoomRuntimeConfig();
  console.log('[zoom-oauth] token generation started');

  let lastError = null;

  for (let attempt = 1; attempt <= oauthMaxAttempts; attempt += 1) {
    try {
      const result = await requestAccessTokenOnce();
      console.log('[zoom-oauth] token generation completed', {
        attempt,
        durationMs: Date.now() - overallStartedAt,
        expiresIn: result.expiresIn,
        expiresAt: new Date(result.expiresAt).toISOString(),
      });
      return result;
    } catch (error) {
      lastError = error;
      const statusCode = error?.statusCode || 0;
      const retryable = isRetryableOAuthFailure(error, statusCode);

      console.error('[zoom-oauth] attempt failed', {
        attempt,
        maxAttempts: oauthMaxAttempts,
        httpStatus: statusCode || null,
        zoomCode: error?.zoomCode ?? null,
        zoomMessage: error?.zoomMessage || error?.message || 'unknown',
        retryable,
        isTimeout: Boolean(error?.isTimeout),
      });

      if (!retryable || attempt >= oauthMaxAttempts) {
        throw error;
      }

      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 4000);
      console.log('[zoom-oauth] retry scheduled', { attempt, nextAttempt: attempt + 1, backoffMs });
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error('Failed to generate Zoom token');
}

export async function getZoomAccessToken(forceRefresh = false) {
  ensureZoomEnv();
  const { tokenSkewMs } = getZoomRuntimeConfig();

  if (forceRefresh) {
    clearZoomAccessTokenCache();
    // Wait out any in-flight refresh that may have cached a rejected token, then mint fresh.
    if (tokenPromise) {
      try {
        await tokenPromise;
      } catch {
        /* ignore — we are forcing a new token */
      }
      clearZoomAccessTokenCache();
    }
  }

  const now = Date.now();
  if (
    !forceRefresh &&
    cachedToken &&
    cachedTokenExpiresAt > now + tokenSkewMs
  ) {
    return cachedToken;
  }

  // Join the in-flight refresh (timeouts/errors still settle the shared promise).
  if (tokenPromise) {
    return tokenPromise;
  }

  // Single-flight: only one OAuth request at a time.
  tokenPromise = (async () => {
    try {
      const result = await generateAccessTokenWithRetry();
      cachedToken = result.accessToken;
      cachedTokenExpiresAt = result.expiresAt;
      return cachedToken;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

function handleZoomUnauthorized(payload = null) {
  clearZoomAccessTokenCache();
  const { zoomCode, zoomMessage } = extractZoomErrorFields(payload || {});
  const err = new Error(zoomMessage || 'Zoom token expired');
  err.statusCode = 401;
  err.zoomCode = zoomCode ?? 124;
  err.zoomMessage = zoomMessage || 'Invalid access token.';
  err.details = payload;
  return err;
}

export async function getZoomMeetingMp4DownloadUrl(meetingId, forceRefresh = false) {
  if (!meetingId || !String(meetingId).trim()) {
    const err = new Error('Meeting ID is required');
    err.statusCode = 400;
    throw err;
  }

  const token = await getZoomAccessToken(forceRefresh);
  const { response, payload } = await fetchZoomApi(
    `https://api.zoom.us/v2/meetings/${encodeURIComponent(String(meetingId).trim())}/recordings`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: getZoomRuntimeConfig().apiTimeoutMs,
      context: 'meetings/recordings',
    }
  );

  if (response.status === 401) {
    logZoomApiError('meetings/recordings unauthorized', response, payload, { meetingId });
    throw handleZoomUnauthorized(payload);
  }

  if (!response.ok) {
    logZoomApiError('meetings/recordings failed', response, payload, { meetingId });
    throw createZoomApiError(response, payload);
  }

  const files = Array.isArray(payload?.recording_files) ? payload.recording_files : [];
  const mp4File = files.find((file) => {
    const fileType = String(file?.file_type || '').toUpperCase();
    const status = String(file?.status || '').toLowerCase();
    return fileType === 'MP4' && (!status || status === 'completed');
  });

  if (!mp4File?.download_url) {
    const err = new Error('No MP4 recording found for this meeting');
    err.statusCode = 404;
    throw err;
  }

  return {
    downloadUrl: mp4File.download_url,
    recordingFileId: mp4File.id || null,
  };
}

function encodeZoomMeetingIdForApi(meetingId) {
  const id = String(meetingId || '').trim();
  if (/^[0-9]+$/.test(id)) return id;
  // Zoom UUIDs can contain "/" — require double encoding for the path segment
  if (id.includes('/') || id.includes('//')) {
    return encodeURIComponent(encodeURIComponent(id));
  }
  return encodeURIComponent(id);
}

function pickMp4DownloadUrlFromRecordingsPayload(payload) {
  const files = Array.isArray(payload?.recording_files) ? payload.recording_files : [];
  const mp4File = files.find((file) => {
    const fileType = String(file?.file_type || '').toUpperCase();
    const status = String(file?.status || '').toLowerCase();
    return fileType === 'MP4' && (!status || status === 'completed');
  });
  return mp4File?.download_url || '';
}

export async function getZoomMeetingRecordingsPayload(meetingId, forceRefresh = false) {
  const token = await getZoomAccessToken(forceRefresh);
  const encoded = encodeZoomMeetingIdForApi(meetingId);
  const { response, payload, durationMs } = await fetchZoomApi(
    `https://api.zoom.us/v2/meetings/${encoded}/recordings`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: getZoomRuntimeConfig().apiTimeoutMs,
      context: 'meetings/{id}/recordings',
    }
  );

  if (response.status === 401) {
    logZoomApiError('meetings/{id}/recordings unauthorized', response, payload, {
      meetingId,
      durationMs,
    });
    throw handleZoomUnauthorized(payload);
  }

  if (!response.ok) {
    logZoomApiError('meetings/{id}/recordings failed', response, payload, {
      meetingId,
      durationMs,
    });
    throw createZoomApiError(response, payload);
  }

  return payload;
}

const ZOOM_RECORDING_LOOKUP_MAX_PAGES = 12;

async function findFreshDownloadUrlInRecordingsList(identifier, forceRefresh = false) {
  const safeId = String(identifier || '').trim();
  if (!safeId) {
    const err = new Error('Recording identifier is required');
    err.statusCode = 400;
    throw err;
  }

  let nextPageToken = '';
  let pages = 0;
  const numericIdMatches = [];

  while (pages < ZOOM_RECORDING_LOOKUP_MAX_PAGES) {
    const payload = await listZoomUserRecordings(nextPageToken, forceRefresh);
    const meetings = Array.isArray(payload?.meetings) ? payload.meetings : [];

    for (const meeting of meetings) {
      const mp4Url = getMp4DownloadUrlFromMeeting(meeting);
      if (!mp4Url) continue;

      const uuid = String(meeting.uuid || '').trim();
      if (uuid && uuid === safeId) return mp4Url;

      const key = extractZoomDownloadKey(mp4Url);
      if (key && key === safeId) return mp4Url;

      if (/^[0-9]+$/.test(safeId) && String(meeting.id || '') === safeId) {
        numericIdMatches.push(mp4Url);
      }
    }

    nextPageToken = String(payload?.next_page_token || '').trim();
    if (!nextPageToken) break;
    pages += 1;
  }

  if (numericIdMatches.length === 1) return numericIdMatches[0];

  if (numericIdMatches.length > 1) {
    const err = new Error(
      'Multiple recordings share this meeting ID. Open the recording list and select the session again (uses unique UUID).'
    );
    err.statusCode = 409;
    throw err;
  }

  const err = new Error('No MP4 recording found for this Zoom identifier');
  err.statusCode = 404;
  throw err;
}

/**
 * Resolve a fresh Zoom MP4 download_url for streaming (never cached).
 * Uses recording uuid (unique per session), not shared numeric meeting id.
 * Internal Zoom REST calls use AbortController timeouts (ZOOM_API_TIMEOUT_MS).
 */
export async function resolveZoomMp4DownloadUrl(identifier, forceRefresh = false) {
  const normalized = extractZoomMeetingId(identifier) || String(identifier || '').trim();
  if (!normalized) {
    const err = new Error('Zoom recording identifier is required');
    err.statusCode = 400;
    throw err;
  }

  const startedAt = Date.now();
  console.log('[zoom-resolve] start', { recordingId: normalized, forceRefresh: Boolean(forceRefresh) });

  if (isZoomRecordingUuid(normalized)) {
    try {
      const payload = await getZoomMeetingRecordingsPayload(normalized, forceRefresh);
      const downloadUrl = pickMp4DownloadUrlFromRecordingsPayload(payload);
      if (downloadUrl) {
        console.log('[zoom-resolve] resolved via meeting uuid', {
          recordingId: normalized,
          durationMs: Date.now() - startedAt,
        });
        return downloadUrl;
      }
    } catch (error) {
      if (error?.statusCode !== 404) {
        console.error('[zoom-resolve] uuid lookup failed', {
          recordingId: normalized,
          httpStatus: error?.statusCode ?? null,
          zoomCode: error?.zoomCode ?? null,
          zoomMessage: error?.zoomMessage || error?.message || null,
          isTimeout: Boolean(error?.isTimeout),
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
      console.log('[zoom-resolve] uuid not found — falling back to recordings list', {
        recordingId: normalized,
        httpStatus: error?.statusCode ?? 404,
        zoomCode: error?.zoomCode ?? null,
        zoomMessage: error?.zoomMessage || error?.message || null,
      });
    }
  }

  try {
    const downloadUrl = await findFreshDownloadUrlInRecordingsList(normalized, forceRefresh);
    console.log('[zoom-resolve] resolved via recordings list', {
      recordingId: normalized,
      durationMs: Date.now() - startedAt,
    });
    return downloadUrl;
  } catch (error) {
    console.error('[zoom-resolve] failed', {
      recordingId: normalized,
      httpStatus: error?.statusCode ?? null,
      zoomCode: error?.zoomCode ?? null,
      zoomMessage: error?.zoomMessage || error?.message || null,
      isTimeout: Boolean(error?.isTimeout),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function listZoomUserRecordings(nextPageToken = '', forceRefresh = false) {
  const token = await getZoomAccessToken(forceRefresh);
  const safeNextPageToken = String(nextPageToken || '').trim();
  const to = getEgyptYmdToday();
  const from = addDaysEgyptYmd(to, -30) || to;

  const url = new URL('https://api.zoom.us/v2/users/me/recordings');
  url.searchParams.set('page_size', '30');
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  if (safeNextPageToken) {
    url.searchParams.set('next_page_token', safeNextPageToken);
  }

  const { response, payload, durationMs } = await fetchZoomApi(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: getZoomRuntimeConfig().listFetchMs,
    context: 'users/me/recordings',
  });

  if (response.status === 401) {
    logZoomApiError('users/me/recordings unauthorized', response, payload, { durationMs });
    throw handleZoomUnauthorized(payload);
  }

  if (!response.ok) {
    logZoomApiError('users/me/recordings failed', response, payload, { durationMs });
    throw createZoomApiError(response, payload);
  }

  return payload;
}
