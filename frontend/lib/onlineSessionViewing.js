import {
  toEgyptYmd,
  getEgyptYmdToday,
  addDaysEgyptYmd,
  compareEgyptYmd,
} from './egyptDateTime';

export const ONLINE_SESSION_PAYMENT_STATES = ['paid', 'free', 'free_if_attended_in_center'];

export const FREE_ONLINE_SESSION_PAYMENT_STATES = ['free', 'free_if_attended_in_center'];

export const VIEWING_LIMIT_TYPES = ['number_of_views', 'number_of_days'];

export function needsViewingSettings(paymentState) {
  return FREE_ONLINE_SESSION_PAYMENT_STATES.includes(paymentState);
}

/**
 * Unlocks "Free if attended in center" when:
 * - lessons[lesson].attended === true
 * - lessons[lesson].lastAttendanceCenter is set and is NOT "online" / "Online" (any other center name)
 */
export function attendedInCenter(lessonData) {
  if (!lessonData || typeof lessonData !== 'object') return false;

  const attended =
    lessonData.attended === true ||
    lessonData.attended === 'true' ||
    lessonData.attended === 1;

  if (!attended) return false;

  let center = lessonData.lastAttendanceCenter;
  if (center == null || (typeof center === 'string' && center.trim() === '')) {
    // Fallback: parse from "DD/MM/YYYY in Center Name"
    const la = lessonData.lastAttendance;
    if (typeof la === 'string') {
      const m = la.match(/\bin\s+(.+)\s*$/i);
      if (m?.[1]) center = m[1].trim();
    }
  }

  if (center == null || typeof center !== 'string') return false;
  const normalized = center.trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== 'online';
}

/**
 * Parse an Egypt-formatted stored date into YYYY-MM-DD.
 * Supports "DD/MM/YYYY", "DD-MM-YYYY", "DD/MM/YYYY at 05:30 PM",
 * "DD/MM/YYYY in Center Name", ISO strings and Date instances.
 */
export function parseEgyptDateLikeToYmd(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return toEgyptYmd(value);
  const s = String(value).trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const dd = String(dmy[1]).padStart(2, '0');
    const mm = String(dmy[2]).padStart(2, '0');
    return `${dmy[3]}-${mm}-${dd}`;
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    // Bare calendar date is already an Egypt civil day; timestamps need conversion.
    if (s.length <= 10) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return toEgyptYmd(new Date(s));
  }

  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return toEgyptYmd(new Date(ms));
}

/**
 * Parse student lesson lastAttendance into Egypt YYYY-MM-DD.
 * Supports "DD/MM/YYYY", "DD-MM-YYYY", and "DD/MM/YYYY in Center Name".
 */
export function parseLastAttendanceYmd(lessonData) {
  if (!lessonData || typeof lessonData !== 'object') return null;
  return parseEgyptDateLikeToYmd(lessonData.lastAttendance);
}

/**
 * Egypt day the student attended this lesson in a center.
 * `attendanceDate` is stored as "DD/MM/YYYY"; `lastAttendance` is the fallback.
 */
export function getAttendanceStartYmd(lessonData) {
  if (!lessonData || typeof lessonData !== 'object') return null;
  return (
    parseEgyptDateLikeToYmd(lessonData.attendanceDate) ||
    parseLastAttendanceYmd(lessonData)
  );
}

/**
 * Start day of a free "number_of_days" window (Egypt civil day).
 * - free_if_attended_in_center → the center attendance day
 * - free → the day the student first opened the video
 */
export function getFreeDaysStartYmd(session, studentEntry, lessonData = null) {
  if (session?.payment_state === 'free_if_attended_in_center') {
    const attendedYmd = getAttendanceStartYmd(lessonData);
    if (attendedYmd) return attendedYmd;
  }
  const startedAt = studentEntry?.first_opened_at || studentEntry?.first_viewed_at;
  if (!startedAt) return null;
  return toEgyptYmd(new Date(startedAt));
}

/**
 * Normalize viewing settings for DB save. Returns { error } or field values.
 */
export function normalizeViewingSettingsForSave(payment_state, viewing_limit_type, viewing_limit_value) {
  if (!ONLINE_SESSION_PAYMENT_STATES.includes(payment_state)) {
    return {
      error: 'Video Payment State is required and must be "paid", "free", or "free_if_attended_in_center"',
    };
  }

  if (!needsViewingSettings(payment_state)) {
    return {
      viewing_limit_type: null,
      viewing_limit_value: null,
    };
  }

  // An empty viewing setting means unlimited free access.
  if (
    (viewing_limit_type === '' || viewing_limit_type === null || viewing_limit_type === undefined) &&
    (viewing_limit_value === '' || viewing_limit_value === null || viewing_limit_value === undefined)
  ) {
    return {
      viewing_limit_type: null,
      viewing_limit_value: null,
    };
  }

  if (!VIEWING_LIMIT_TYPES.includes(viewing_limit_type)) {
    return {
      error: 'Viewing Settings type is required and must be "number_of_views" or "number_of_days"',
    };
  }

  const num = Number(viewing_limit_value);
  if (
    viewing_limit_value === '' ||
    viewing_limit_value === null ||
    viewing_limit_value === undefined ||
    Number.isNaN(num) ||
    num < 0 ||
    !Number.isFinite(num)
  ) {
    return { error: 'Viewing Settings value must be a number greater than or equal to 0' };
  }

  return {
    viewing_limit_type,
    viewing_limit_value: Math.floor(num),
  };
}

/**
 * Remaining free views against the *current* session limit (not a stale stored remaining).
 * Admin increasing the limit unlocks leftover views for students who already used some.
 */
export function getFreeViewsRemaining(session, studentEntry, videoPartKey = null) {
  const limit = Number(session?.viewing_limit_value);
  if (Number.isNaN(limit) || limit <= 0) return 0;

  if (videoPartKey && studentEntry?.part_views && typeof studentEntry.part_views === 'object') {
    const views = studentEntry.part_views;
    const keys = Array.isArray(videoPartKey) ? videoPartKey : [videoPartKey];
    for (const k of keys) {
      if (k != null && Object.prototype.hasOwnProperty.call(views, k)) {
        const used = Number(views[k]) || 0;
        return Math.max(0, limit - used);
      }
    }
    // No usage recorded for this part yet → full limit
    return limit;
  }

  const used = Number(studentEntry?.views_used ?? 0);
  if (Number.isNaN(used) || used < 0) return limit;
  return Math.max(0, limit - used);
}

/**
 * Whether free-session viewing access is still valid given session config + student entry.
 * Always uses the *current* session viewing_limit_value / type (so admin increases reopen access).
 *
 * number_of_days:
 * - free → window starts when the student first opens the video (Africa/Cairo).
 * - free_if_attended_in_center → window starts on the center attendance day.
 * - N Cairo calendar days: start 08/11 + 10 days → open through 17/11.
 *
 * number_of_views:
 * - Counted per playlist slot (videoPartKey); each video gets the full limit.
 *
 * When invalid/expired, session should fall back to paid (require VVC).
 */
export function isFreeViewingAccessValid(session, studentEntry, lessonData = null, videoPartKey = null) {
  const type = session?.viewing_limit_type;
  const limit = Number(session?.viewing_limit_value);
  if (!VIEWING_LIMIT_TYPES.includes(type) || Number.isNaN(limit) || limit < 0) {
    // Legacy free sessions without settings stay unlocked
    return true;
  }

  if (type === 'number_of_views') {
    if (limit <= 0) return false;
    if (!studentEntry || !studentEntry.first_opened_at) {
      return true;
    }
    if (videoPartKey) {
      return getFreeViewsRemaining(session, studentEntry, videoPartKey) > 0;
    }
    return getFreeViewsRemaining(session, studentEntry) > 0;
  }

  if (type === 'number_of_days') {
    if (limit <= 0) return false;
    const startedYmd = getFreeDaysStartYmd(session, studentEntry, lessonData);
    // Window has not started yet (never opened / no attendance recorded)
    if (!startedYmd) return true;
    // Egypt/Cairo civil days — same window as VVC/VHC: N days starting first open
    // (valid while today < firstYmd + N). Example: open 08/11 with 10 days → through 17/11.
    const expiresYmd = addDaysEgyptYmd(startedYmd, limit);
    const todayYmd = getEgyptYmdToday();
    if (!expiresYmd || !todayYmd) return false;
    return compareEgyptYmd(todayYmd, expiresYmd) < 0;
  }

  return true;
}

/**
 * Recompute entry fields from current session settings.
 * Clears free_access_expired when the student is again under the new views/days limit.
 */
export function syncFreeViewingEntryWithSession(session, entry, lessonData = null) {
  if (!entry || typeof entry !== 'object') return entry;
  const type = session?.viewing_limit_type;
  const limit = Number(session?.viewing_limit_value);
  const next = {
    ...entry,
    viewing_limit_type: type || entry.viewing_limit_type || null,
    viewing_limit_value: Number.isFinite(limit) ? limit : entry.viewing_limit_value,
  };

  if (type === 'number_of_views' && Number.isFinite(limit)) {
    const used = Number(entry.views_used ?? 0) || 0;
    next.views_used = used;
    // Per-part counters are authoritative: the session stays open while any
    // playlist slot still has views, even when the session total is high.
    const partUsed = Object.values(
      entry.part_views && typeof entry.part_views === 'object' ? entry.part_views : {}
    ).map((v) => Number(v) || 0);
    const lowestUsed = partUsed.length > 0 ? Math.min(...partUsed) : used;
    const remaining = Math.max(0, limit - lowestUsed);
    next.views_remaining = Math.max(0, limit - used);
    next.free_access_expired = remaining <= 0;
    if (remaining > 0) {
      delete next.expired_at;
    } else if (!next.expired_at) {
      next.expired_at = new Date().toISOString();
    }
  } else if (type === 'number_of_days' && Number.isFinite(limit)) {
    const stillValid = isFreeViewingAccessValid(session, entry, lessonData);
    next.free_access_expired = !stillValid;
    if (stillValid) {
      delete next.expired_at;
    } else if (!next.expired_at) {
      next.expired_at = new Date().toISOString();
    }
  }

  return next;
}

/**
 * True when free viewing period ended and student must use VVC (paid path).
 * For number_of_days: from the attendance day (free_if_attended_in_center)
 * or the student's first video open (free).
 */
export function isFreeViewingExpired(session, studentEntry, lessonData = null, videoPartKey = null) {
  if (!needsViewingSettings(session?.payment_state)) return false;
  if (!VIEWING_LIMIT_TYPES.includes(session?.viewing_limit_type)) return false;
  const limit = Number(session?.viewing_limit_value);
  if (!Number.isNaN(limit) && limit <= 0) return true;

  if (session?.viewing_limit_type === 'number_of_days') {
    if (!getFreeDaysStartYmd(session, studentEntry, lessonData)) return false;
    return !isFreeViewingAccessValid(session, studentEntry, lessonData);
  }

  if (videoPartKey) {
    if (!studentEntry?.first_opened_at) return false;
    return !isFreeViewingAccessValid(session, studentEntry, lessonData, videoPartKey);
  }

  const started = studentEntry?.first_opened_at || studentEntry?.first_viewed_at;
  if (!started) return false;
  return !isFreeViewingAccessValid(session, studentEntry, lessonData);
}
