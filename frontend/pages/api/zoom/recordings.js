import { authMiddleware } from '../../../lib/authMiddleware';
import { listZoomUserRecordings } from '../../../lib/zoomServer';
import {
  getMp4DownloadUrlFromMeeting,
  getZoomProxyId,
} from '../../../lib/zoomUtils';

function formatDateTime(dateString, timezone) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const normalizedTimezone = String(timezone || '').trim();
  const safeTimezone =
    normalizedTimezone && normalizedTimezone !== 'UTC'
      ? normalizedTimezone
      : 'Africa/Cairo';

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: safeTimezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);

    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    const day = getPart('day');
    const month = getPart('month');
    const year = getPart('year');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const dayPeriod = (getPart('dayPeriod') || '').toUpperCase();

    return `${day}/${month}/${year} at ${hour}:${minute} ${dayPeriod}`;
  } catch {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);

    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    const day = getPart('day');
    const month = getPart('month');
    const year = getPart('year');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const dayPeriod = (getPart('dayPeriod') || '').toUpperCase();

    return `${day}/${month}/${year} at ${hour}:${minute} ${dayPeriod}`;
  }
}

function formatDuration(durationMinutes) {
  const total = Number(durationMinutes || 0);
  const safe = Number.isFinite(total) ? Math.max(0, total) : 0;
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, '0')}h:${String(mins).padStart(2, '0')}m`;
}

function resolveMeetingDate(meeting) {
  const files = Array.isArray(meeting?.recording_files) ? meeting.recording_files : [];
  return (
    meeting?.created_at ||
    meeting?.start_time ||
    files[0]?.recording_start ||
    null
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const startedAt = Date.now();

  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const nextPageToken = String(req.query.next_page_token || '');
    console.log('[zoom-recordings] list request', {
      userId: user.id || user._id || null,
      role: user.role,
      hasNextPageToken: Boolean(nextPageToken),
    });

    let payload;
    let retriedAfter401 = false;
    try {
      payload = await listZoomUserRecordings(nextPageToken);
    } catch (error) {
      if (error?.statusCode === 401) {
        retriedAfter401 = true;
        console.warn('[zoom-recordings] 401 — forcing OAuth refresh and retry', {
          message: error?.message || 'Zoom token expired',
        });
        payload = await listZoomUserRecordings(nextPageToken, true);
      } else {
        throw error;
      }
    }

    const meetings = Array.isArray(payload?.meetings) ? payload.meetings : [];
    const mapped = meetings.map((meeting) => {
      const proxyId = getZoomProxyId(meeting);
      return {
        ...(meeting || {}),
        uuid: meeting.uuid || '',
        id: meeting.id || null,
        topic: meeting.topic || '',
        start_time: meeting.start_time || null,
        duration: meeting.duration || 0,
        timezone: meeting.timezone || null,
        created_at: resolveMeetingDate(meeting),
        recording_files: Array.isArray(meeting.recording_files) ? meeting.recording_files : [],
        zoom_mp4_download_url: getMp4DownloadUrlFromMeeting(meeting),
        // Recording uuid (unique per session) — never an access_token URL that expires
        zoom_direct_video_url: proxyId,
        zoom_proxy_id: proxyId,
        created_at_formated: formatDateTime(resolveMeetingDate(meeting), meeting.timezone),
        duration_furmated: formatDuration(meeting.duration),
      };
    });

    console.log('[zoom-recordings] list success', {
      count: mapped.length,
      retriedAfter401,
      hasMore: Boolean(payload?.next_page_token),
      durationMs: Date.now() - startedAt,
    });

    return res.json({
      meetings: mapped,
      next_page_token: payload?.next_page_token || '',
    });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const details = error?.message || 'Unknown error';
    const missingScope = details.includes('does not contain scopes');

    console.error('[zoom-recordings] list failed', {
      httpStatus: statusCode,
      zoomCode: error?.zoomCode ?? error?.details?.code ?? null,
      zoomMessage: error?.zoomMessage || error?.details?.message || details,
      isTimeout: Boolean(error?.isTimeout),
      missingScope,
      durationMs: Date.now() - startedAt,
      zoomDetails: error?.details || null,
    });

    if (statusCode === 401) {
      return res.status(401).json({ error: 'Zoom token expired' });
    }
    return res.status(statusCode).json({
      error: 'Failed to fetch zoom recordings',
      details,
      hint: missingScope
        ? 'Your Zoom app token is missing recording scopes. Add cloud recording read/list scopes in Zoom Marketplace app settings, then regenerate token.'
        : undefined,
      zoom: error?.details || null,
    });
  }
}
