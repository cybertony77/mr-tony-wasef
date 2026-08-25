/**
 * Normalize any saved Zoom value (numeric id, download key, uuid, or full URL)
 * into a stable identifier for /api/videos/zoom/{id}.
 */
export function extractZoomMeetingId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const downloadMatch = parsed.pathname.match(/\/rec\/download\/([^/]+)/i);
      if (downloadMatch?.[1]) return decodeURIComponent(downloadMatch[1]);
      const joinMatch = parsed.pathname.match(/\/(?:j|wc\/j(?:oin)?)\/([0-9]+)/i);
      if (joinMatch?.[1]) return joinMatch[1];
      const token = parsed.searchParams.get('access_token');
      if (token) {
        // Expired direct link — cannot recover id from token alone
        return '';
      }
    } catch {
      // fall through
    }
  }

  const noSpaces = raw.replace(/\s+/g, '');
  if (/^[0-9]+$/.test(noSpaces)) return noSpaces;

  const downloadMatch = noSpaces.match(/\/rec\/download\/([^/?#]+)/i);
  if (downloadMatch?.[1]) return decodeURIComponent(downloadMatch[1]);

  const joinMatch = noSpaces.match(/zoom\.us\/(?:j|wc\/j(?:oin)?)\/([0-9]+)/i);
  if (joinMatch?.[1]) return joinMatch[1];

  return noSpaces;
}

export function extractZoomDownloadKey(downloadUrl) {
  const raw = String(downloadUrl || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/rec\/download\/([^/]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    const match = raw.match(/\/rec\/download\/([^/?#]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return '';
}

export function getMp4DownloadUrlFromMeeting(meeting) {
  const files = Array.isArray(meeting?.recording_files) ? meeting.recording_files : [];
  const mp4File = files.find((file) => {
    const fileType = String(file?.file_type || '').toUpperCase();
    const status = String(file?.status || '').toLowerCase();
    return fileType === 'MP4' && (!status || status === 'completed');
  });
  return mp4File?.download_url || '';
}

/**
 * Unique id for /api/videos/zoom/{id}.
 * Prefer recording uuid — numeric meeting id is shared across recurring sessions.
 */
export function getZoomProxyId(meeting) {
  const uuid = String(meeting?.uuid || '').trim();
  if (uuid) return uuid;

  const mp4Url = getMp4DownloadUrlFromMeeting(meeting);
  const downloadKey = extractZoomDownloadKey(mp4Url);
  if (downloadKey) return downloadKey;

  if (meeting?.id != null && String(meeting.id).trim() !== '') {
    return String(meeting.id).trim();
  }
  return '';
}

export function isZoomRecordingUuid(value) {
  const id = String(value || '').trim();
  if (!id) return false;
  if (/^[0-9]+$/.test(id)) return false;
  return true;
}

export function buildZoomVideoProxyPath(meetingId) {
  const id = extractZoomMeetingId(meetingId);
  if (!id) return '';
  return `/api/videos/zoom/${encodeURIComponent(id)}`;
}
