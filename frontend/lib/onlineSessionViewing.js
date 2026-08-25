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
export function getFreeViewsRemaining(session, studentEntry) {
  const limit = Number(session?.viewing_limit_value);
  if (Number.isNaN(limit) || limit <= 0) return 0;
  const used = Number(studentEntry?.views_used ?? 0);
  if (Number.isNaN(used) || used < 0) return limit;
  return Math.max(0, limit - used);
}

/**
 * Whether free-session viewing access is still valid given session config + student entry.
 * Always uses the *current* session viewing_limit_value / type (so admin increases reopen access).
 * Days countdown starts from student first open (first_opened_at) using Africa/Cairo calendar days.
 * Views expire when views_used reaches the configured limit.
 * When invalid/expired, session should fall back to paid (require VVC).
 */
export function isFreeViewingAccessValid(session, studentEntry) {
  const type = session?.viewing_limit_type;
  const limit = Number(session?.viewing_limit_value);
  if (!VIEWING_LIMIT_TYPES.includes(type) || Number.isNaN(limit) || limit < 0) {
    // Legacy free sessions without settings stay unlocked
    return true;
  }

  if (type === 'number_of_views') {
    if (limit <= 0) return false;
    // Not opened yet — still free to start
    if (!studentEntry || !studentEntry.first_opened_at) {
      return true;
    }
    return getFreeViewsRemaining(session, studentEntry) > 0;
  }

  if (type === 'number_of_days') {
    if (limit <= 0) return false;
    const startedAt = studentEntry?.first_opened_at || studentEntry?.first_viewed_at;
    if (!startedAt) {
      return true; // first open not started — countdown starts on open
    }
    const firstYmd = toEgyptYmd(startedAt);
    if (!firstYmd) return true;
    const expiresYmd = addDaysEgyptYmd(firstYmd, limit);
    const todayYmd = getEgyptYmdToday();
    if (!expiresYmd || !todayYmd) return true;
    return compareEgyptYmd(todayYmd, expiresYmd) < 0;
  }

  return true;
}

/**
 * Recompute entry fields from current session settings.
 * Clears free_access_expired when the student is again under the new views/days limit.
 */
export function syncFreeViewingEntryWithSession(session, entry) {
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
    const remaining = Math.max(0, limit - used);
    next.views_used = used;
    next.views_remaining = remaining;
    next.free_access_expired = remaining <= 0;
    if (remaining > 0) {
      delete next.expired_at;
    } else if (!next.expired_at) {
      next.expired_at = new Date().toISOString();
    }
  } else if (type === 'number_of_days' && Number.isFinite(limit)) {
    const stillValid = isFreeViewingAccessValid(session, entry);
    next.free_access_expired = !stillValid;
    if (stillValid) {
      delete next.expired_at;
    } else if (!next.expired_at) {
      next.expired_at = new Date().toISOString();
    }
  }

  return next;
}

/** True when free viewing period ended and student must use VVC (paid path). */
export function isFreeViewingExpired(session, studentEntry) {
  if (!needsViewingSettings(session?.payment_state)) return false;
  if (!VIEWING_LIMIT_TYPES.includes(session?.viewing_limit_type)) return false;
  const limit = Number(session?.viewing_limit_value);
  if (!Number.isNaN(limit) && limit <= 0) return true;
  const started = studentEntry?.first_opened_at || studentEntry?.first_viewed_at;
  if (!started) return false;
  return !isFreeViewingAccessValid(session, studentEntry);
}
