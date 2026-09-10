/**
 * Deadline date + optional time ("05:30 PM") interpreted in Africa/Cairo.
 *
 * Stored:
 *   deadline_date: "YYYY-MM-DD" (Egypt civil day)
 *   deadline_time: "05:30 PM" or null (Egypt wall clock; null = end of that Cairo day)
 *
 * Display:
 *   "13/05/2026" or "13/05/2026 at 05:30 PM"
 */

export const EGYPT_TIME_ZONE = 'Africa/Cairo';
/** Egypt is permanently UTC+2 (no DST). Used only for Date.UTC conversions. */
export const EGYPT_UTC_OFFSET_HOURS = 2;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Normalize stored deadline_date to YYYY-MM-DD (Egypt civil date).
 * Accepts:
 *   - "2026-05-13" / "2026-05-13T00:00:00.000Z"
 *   - "13/05/2026" / "13-05-2026"
 *   - "13/05/2026 at 05:30 PM" (date part only)
 *   - Date / Mongo {$date}
 */
export function normalizeDeadlineDateYmd(deadlineDate) {
  if (deadlineDate == null || deadlineDate === '') return null;
  let raw = deadlineDate;
  if (typeof raw === 'object' && raw !== null && '$date' in raw) {
    raw = raw.$date;
  }
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return toEgyptYmdFromInstant(raw);
  }

  const s = String(raw)
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ');

  // ISO / HTML date input — take calendar date as written (admin enters Egypt day).
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY (optional " at …" suffix)
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const dd = pad2(dmy[1]);
    const mo = pad2(dmy[2]);
    const yyyy = dmy[3];
    return `${yyyy}-${mo}-${dd}`;
  }

  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return toEgyptYmdFromInstant(new Date(ms));
}

function toEgyptYmdFromInstant(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EGYPT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !mo || !d) return null;
  return `${y}-${mo}-${d}`;
}

export function hour12To24(h12, period) {
  const h = Number(h12);
  if (Number.isNaN(h) || h < 1 || h > 12) return null;
  const p = String(period || '').toUpperCase();
  if (p === 'AM') return h === 12 ? 0 : h;
  if (p === 'PM') return h === 12 ? 12 : h + 12;
  return null;
}

/**
 * Parse time as Egypt wall clock.
 * Accepts: "05:30 PM", "5:30 pm", "05:30:00 PM", or extracted from
 * "13/05/2026 at 05:30 PM".
 */
export function parseDeadlineTime(str) {
  if (str == null) return null;
  let s = typeof str === 'string' ? str : String(str);
  s = s
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ')
    .replace(/\s+/g, ' ');

  // Allow full "DD/MM/YYYY at 05:30 PM"
  const atIdx = s.toLowerCase().lastIndexOf(' at ');
  if (atIdx !== -1) {
    s = s.slice(atIdx + 4).trim();
  }

  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (!m) return null;
  const hour12 = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;
  return { hour12, minute, period };
}

/** Canonical stored time: "05:30 PM". null if incomplete / invalid. */
export function formatDeadlineTimeFromParts(hourStr, minuteStr, period) {
  const hs = String(hourStr ?? '').replace(/\D/g, '').slice(0, 2);
  const ms = String(minuteStr ?? '').replace(/\D/g, '').slice(0, 2);
  const p = String(period || '').toUpperCase();
  if (!hs || !ms || (p !== 'AM' && p !== 'PM')) return null;
  const h = parseInt(hs, 10);
  const m = parseInt(ms, 10);
  if (Number.isNaN(h) || h < 1 || h > 12 || Number.isNaN(m) || m < 0 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)} ${p}`;
}

/** Normalize any parseable time string to canonical "05:30 PM". */
export function canonicalizeDeadlineTime(raw) {
  const parsed = parseDeadlineTime(raw);
  if (!parsed) return null;
  return formatDeadlineTimeFromParts(parsed.hour12, pad2(parsed.minute), parsed.period);
}

/**
 * UTC ms for deadline instant in Africa/Cairo:
 * - with time → that Cairo clock time
 * - date only → end of that Cairo calendar day (23:59:59.999)
 */
export function getDeadlineEndUtcMs(deadlineDateYmd, deadlineTimeStr) {
  const ymd = normalizeDeadlineDateYmd(deadlineDateYmd);
  if (!ymd) return null;
  const [y, mo, d] = ymd.split('-').map(Number);
  const parsed = deadlineTimeStr ? parseDeadlineTime(String(deadlineTimeStr)) : null;
  const off = EGYPT_UTC_OFFSET_HOURS;
  if (parsed) {
    const h24 = hour12To24(parsed.hour12, parsed.period);
    if (h24 === null) return null;
    return Date.UTC(y, mo - 1, d, h24 - off, parsed.minute, 0, 0);
  }
  return Date.UTC(y, mo - 1, d, 23 - off, 59, 59, 999);
}

/** Cairo "now" parts (civil date + 24h clock) for Africa/Cairo. */
function getCairoNowParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: EGYPT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date());
  const pick = (t) => {
    const p = parts.find((x) => x.type === t);
    return p ? parseInt(p.value, 10) : 0;
  };
  return {
    y: pick('year'),
    mo: pick('month'),
    d: pick('day'),
    h: pick('hour'),
    min: pick('minute'),
    s: pick('second'),
  };
}

/**
 * True if current Cairo wall clock is past the deadline.
 * - Date + time: past that Cairo clock time
 * - Date only: past end of that Cairo calendar day (still open all day on the deadline date)
 * Uses Intl "now" so student/admin PC timezone does not affect the result.
 */
export function isDeadlinePassedEgypt(deadlineDateYmd, deadlineTimeStr) {
  const ymd = normalizeDeadlineDateYmd(deadlineDateYmd);
  if (!ymd) return false;
  const [dy, dmo, dd] = ymd.split('-').map(Number);
  const n = getCairoNowParts();

  if (n.y > dy) return true;
  if (n.y < dy) return false;
  if (n.mo > dmo) return true;
  if (n.mo < dmo) return false;
  if (n.d > dd) return true;
  if (n.d < dd) return false;

  // Same Cairo calendar day
  const parsed = deadlineTimeStr ? parseDeadlineTime(String(deadlineTimeStr)) : null;
  if (!parsed) {
    // Date-only: active through end of that Cairo day
    return false;
  }
  const h24 = hour12To24(parsed.hour12, parsed.period);
  if (h24 === null) return false;
  const deadlineSec = h24 * 3600 + parsed.minute * 60;
  const nowSec = n.h * 3600 + n.min * 60 + n.s;
  return nowSec > deadlineSec;
}

/** True if deadline is still in the future in Africa/Cairo (admin create/edit validation). */
export function isDeadlineStrictlyInFutureEgypt(deadlineDateYmd, deadlineTimeStr) {
  const ymd = normalizeDeadlineDateYmd(deadlineDateYmd);
  if (!ymd) return false;
  // Same Cairo wall-clock semantics as isDeadlinePassedEgypt
  return !isDeadlinePassedEgypt(ymd, deadlineTimeStr);
}

/**
 * Display: "13/05/2026" or "13/05/2026 at 05:30 PM" (Egypt civil date + optional Cairo time).
 */
export function formatDeadlineDisplayEgypt(deadline_date, deadline_time) {
  const ymd = normalizeDeadlineDateYmd(deadline_date);
  if (!ymd) return '';
  const [y, mo, d] = ymd.split('-');
  const datePart = `${d}/${mo}/${y}`;
  const timePart = canonicalizeDeadlineTime(deadline_time);
  if (timePart) return `${datePart} at ${timePart}`;
  return datePart;
}

/** Card line: "With deadline date : 13/05/2026 at 05:30 PM" */
export function formatDeadlineCardLabel(deadline_date, deadline_time) {
  const display = formatDeadlineDisplayEgypt(deadline_date, deadline_time);
  if (!display) return '';
  return `With deadline date : ${display}`;
}

/** Server/client: normalize body field to canonical "05:30 PM" or null */
export function normalizeDeadlineTimeField(deadline_type, raw) {
  if (deadline_type !== 'with_deadline') return null;
  if (raw == null || raw === '') return null;
  return canonicalizeDeadlineTime(raw);
}

/** YYYY-MM-DD for "today" in Africa/Cairo (for date input min, etc.) */
export function getEgyptYmdToday() {
  return toEgyptYmdFromInstant(new Date()) || new Date().toISOString().split('T')[0];
}
