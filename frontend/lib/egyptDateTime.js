/**
 * Egypt / Africa/Cairo datetime helpers.
 * Display format: "14/08/2026 at 02:34 PM"
 */

export const EGYPT_TIME_ZONE = 'Africa/Cairo';

/** Current instant (UTC-based Date). Format with formatEgyptDateTime for Cairo wall clock. */
export function nowEgyptDate() {
  return new Date();
}

/**
 * Format a Date / ISO string in Africa/Cairo as "DD/MM/YYYY at hh:mm AM/PM".
 */
export function formatEgyptDateTime(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EGYPT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const period = get('dayPeriod');

  return `${day}/${month}/${year} at ${hour}:${minute} ${period}`;
}

/** Format attendance as "DD/MM/YYYY in Center at h:mm AM/PM". */
export function formatEgyptAttendance(input = new Date(), center = 'Online') {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EGYPT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} in ${center || 'Unknown Center'} at ${get('hour').replace(/^0/, '')}:${get('minute')} ${get('dayPeriod')}`;
}

/** YYYY-MM-DD for a Date/ISO instant in Africa/Cairo. */
export function toEgyptYmd(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EGYPT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) return null;
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD for "today" in Africa/Cairo. */
export function getEgyptYmdToday() {
  return toEgyptYmd(new Date());
}

/** Add calendar days to a YYYY-MM-DD string (Egypt civil date arithmetic). */
export function addDaysEgyptYmd(ymd, days) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const n = Number(days);
  if (Number.isNaN(n) || !Number.isFinite(n)) return null;
  const [y, mo, d] = ymd.split('-').map(Number);
  // Noon UTC avoids DST edge cases when shifting civil dates
  const utc = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const shifted = new Date(utc + Math.trunc(n) * 24 * 60 * 60 * 1000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Compare YYYY-MM-DD: -1 if a<b, 0 if equal, 1 if a>b. */
export function compareEgyptYmd(a, b) {
  if (!a || !b) return 0;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
