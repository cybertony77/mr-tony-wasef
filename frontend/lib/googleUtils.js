/**
 * Client-safe Google Meet URL helpers (no Node crypto).
 */

export function buildGoogleMeetVideoProxyPath(secureId) {
  const id = String(secureId || '').trim();
  if (!id) return '';
  return `/api/videos/google/${encodeURIComponent(id)}`;
}
