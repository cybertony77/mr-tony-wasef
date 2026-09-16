/**
 * Single source of truth for "can this student open this playlist slot right now?".
 *
 * Both the button appearance (grey + lock.svg vs green + unlock.svg) and the click
 * handler read this, so the two can never disagree.
 *
 * Access can be granted by three independent grants, checked in this order:
 *   1. free      — session payment_state is free / free_if_attended_in_center
 *   2. credit    — a payment-system session credit was spent on this slot
 *   3. code      — a VVC / VHC unlock
 *
 * Free is preferred while it lasts so a code the student already redeemed is not
 * burned early. Views are always counted per playlist slot: a session with three
 * videos and a limit of three views gives each video its own three views.
 */

import {
  attendedInCenter,
  getFreeDaysStartYmd,
  getFreeViewsRemaining,
} from './onlineSessionViewing';
import {
  getPartViewsUsed,
  isSessionCreditPartUnlocked,
  makeVideoPartKey,
  resolvePartViewKeys,
  resolveViewsPerVideoLimit,
} from './videoPartViews';
import {
  toEgyptYmd,
  getEgyptYmdToday,
  addDaysEgyptYmd,
  compareEgyptYmd,
} from './egyptDateTime';
import { isDeadlinePassedEgypt, normalizeDeadlineDateYmd } from './deadlineTimeEgypt';

export const FREE_PAYMENT_STATES = [
  'free',
  'free_if_attended_in_center',
  'free_if_attended',
  'free_if_homework_done',
];

/** Why a slot is locked. */
export const LOCK_REASON = {
  NO_VIEWS: 'no_views',
  DAYS_EXPIRED: 'days_expired',
  DEADLINE_PASSED: 'deadline_passed',
  NOT_ATTENDED: 'not_attended',
  NEEDS_CODE: 'needs_code',
};

export function isFreePaymentState(paymentState) {
  return FREE_PAYMENT_STATES.includes(String(paymentState || ''));
}

/** True when bracket text means access is exhausted / expired (render in red). */
export function isAccessBracketWarning(label) {
  if (!label) return false;
  const t = String(label).toLowerCase();
  return (
    t.endsWith('no views left') ||
    t.endsWith('no days left') ||
    t.endsWith('deadline passed')
  );
}

export function formatViewsLeft(remaining) {
  if (remaining == null) return null;
  const n = Number(remaining);
  if (!Number.isFinite(n) || n <= 0) return 'no views left';
  return n === 1 ? '1 view left' : `${n} views left`;
}

export function formatDaysLeft(remaining) {
  if (remaining == null) return null;
  const n = Number(remaining);
  if (!Number.isFinite(n) || n <= 0) return 'no days left';
  return n === 1 ? '1 day left' : `${n} days left`;
}

function diffDaysYmd(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return null;
  const [y1, m1, d1] = fromYmd.split('-').map(Number);
  const [y2, m2, d2] = toYmd.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * Calendar days still usable in an N-day window that started on `startYmd`
 * (today counts). `null` when the window has not started yet.
 */
export function daysLeftInWindow(startYmd, numberOfDays) {
  const days = Number(numberOfDays);
  if (!Number.isFinite(days) || days <= 0) return 0;
  if (!startYmd) return null;
  const expiresYmd = addDaysEgyptYmd(startYmd, days); // exclusive end
  const todayYmd = getEgyptYmdToday();
  if (!expiresYmd || !todayYmd) return null;
  const left = diffDaysYmd(todayYmd, expiresYmd);
  return left == null ? null : Math.max(0, left);
}

/** Calendar days still usable up to and including a deadline day. */
export function daysLeftUntilDeadline(deadlineDate, deadlineTime = null) {
  const ymd = normalizeDeadlineDateYmd(deadlineDate);
  if (!ymd) return null;
  if (isDeadlinePassedEgypt(ymd, deadlineTime)) return 0;
  const todayYmd = getEgyptYmdToday();
  const left = diffDaysYmd(todayYmd, ymd);
  return left == null ? null : Math.max(1, left + 1);
}

function toYmd(value) {
  if (!value) return null;
  return toEgyptYmd(value instanceof Date ? value : new Date(value));
}

function grant(kind, valid, label, reason = null, extra = {}) {
  return { kind, valid, label, reason: valid ? null : reason, ...extra };
}

function findSessionEntries(studentEntries, sessionId) {
  const sid = String(sessionId ?? '');
  const list = Array.isArray(studentEntries) ? studentEntries : [];
  const mine = list.filter((entry) => {
    if (!entry) return false;
    const vid =
      typeof entry.video_id === 'string' ? entry.video_id : entry.video_id?.toString();
    return vid === sid;
  });
  return {
    freeEntry: mine.find((e) => e.free_viewing === true) || null,
    creditEntry: mine.find((e) => e.paid_with_session) || null,
    codeEntry: mine.find((e) => e.vvc_id || e.vhc_id) || null,
  };
}

/** Highest usage recorded for a slot across the student record and the local unlock map. */
function partViewsUsed(entry, unlockedInfo, keys) {
  return Math.max(
    getPartViewsUsed(entry, keys),
    getPartViewsUsed({ part_views: unlockedInfo?.part_views }, keys)
  );
}

function partStartedAt(codeEntry, unlockedInfo, keys) {
  const maps = [codeEntry?.part_access_started_at, unlockedInfo?.part_access_started_at];
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    for (const key of keys) {
      if (map[key]) return map[key];
    }
  }
  return null;
}

/** VVC / VHC grant. Settings come from the live code, falling back to the student record. */
function buildCodeGrant({ codeEntry, unlockedInfo, keys }) {
  const info = unlockedInfo || null;
  const hasInfo = !!(info && (info.vvc_id || info.vhc_id || info.code_settings));
  if (!codeEntry && !hasInfo) return null;

  const settings =
    info?.code_settings ||
    codeEntry?.code_settings ||
    (codeEntry?.number_of_days != null
      ? 'number_of_days'
      : codeEntry?.deadline_date
        ? 'deadline_date'
        : 'number_of_views');

  if (settings === 'deadline_date') {
    const deadline = info?.deadline_date ?? codeEntry?.deadline_date ?? null;
    if (!deadline) return grant('code', true, null);
    const left = daysLeftUntilDeadline(deadline);
    if (isDeadlinePassedEgypt(deadline, null)) {
      return grant('code', false, 'deadline passed', LOCK_REASON.DEADLINE_PASSED);
    }
    return grant('code', true, formatDaysLeft(left));
  }

  if (settings === 'number_of_days') {
    const days = Number(info?.number_of_days ?? codeEntry?.number_of_days);
    const startedAt =
      partStartedAt(codeEntry, info, keys) ||
      info?.access_started_at ||
      codeEntry?.access_started_at ||
      null;
    if (!Number.isFinite(days) || days <= 0) {
      return grant('code', false, 'no days left', LOCK_REASON.DAYS_EXPIRED);
    }
    const startYmd = toYmd(startedAt);
    // Not started yet → full window still ahead
    if (!startYmd) return grant('code', true, formatDaysLeft(days));
    const left = daysLeftInWindow(startYmd, days);
    if (!left || left <= 0) {
      return grant('code', false, 'no days left', LOCK_REASON.DAYS_EXPIRED);
    }
    return grant('code', true, formatDaysLeft(left));
  }

  // number_of_views — per playlist slot
  const limit = resolveViewsPerVideoLimit(
    codeEntry,
    info?.views_per_video_limit ?? info?.number_of_views
  );
  if (limit <= 0) {
    return grant('code', false, 'no views left', LOCK_REASON.NO_VIEWS, { remaining: 0 });
  }
  const remaining = Math.max(0, limit - partViewsUsed(codeEntry, info, keys));
  return grant(
    'code',
    remaining > 0,
    formatViewsLeft(remaining),
    LOCK_REASON.NO_VIEWS,
    { remaining }
  );
}

/** Payment-system session credit: one credit unlocks one playlist slot. */
function buildCreditGrant({ creditEntry, unlockedInfo, videoId, videoIndex, keys }) {
  if (!creditEntry) return null;
  const partKey = makeVideoPartKey(videoId, videoIndex);
  if (!isSessionCreditPartUnlocked(creditEntry, partKey, videoId, videoIndex)) return null;
  const limit = resolveViewsPerVideoLimit(creditEntry, 1);
  const remaining = Math.max(0, limit - partViewsUsed(creditEntry, unlockedInfo, keys));
  return grant(
    'credit',
    remaining > 0,
    formatViewsLeft(remaining),
    LOCK_REASON.NO_VIEWS,
    { remaining }
  );
}

/**
 * Free / free-if-attended grant.
 * Returns `null` when the session is not free at all, or when
 * free_if_attended_in_center has no qualifying center attendance.
 */
function buildFreeGrant({
  session,
  freeEntry,
  lessonData,
  attendedInCenterFallback,
  freeAccessAllowed,
  keys,
}) {
  const paymentState = String(session?.payment_state || '');
  if (!isFreePaymentState(paymentState)) return null;

  // Homework videos gate on hwDone / attended, resolved by the caller.
  if (freeAccessAllowed === false) return null;
  if (freeAccessAllowed == null && paymentState === 'free_if_attended_in_center') {
    let attended = attendedInCenter(lessonData);
    // API-provided flag while the student lesson map is still loading
    if (!attended && lessonData == null && attendedInCenterFallback === true) {
      attended = true;
    }
    if (!attended) return null;
  }

  const type = session?.viewing_limit_type;
  const limit = Number(session?.viewing_limit_value);

  if (type === 'number_of_views' && Number.isFinite(limit)) {
    if (limit <= 0) {
      return grant('free', false, 'no views left', LOCK_REASON.NO_VIEWS, { remaining: 0 });
    }
    const remaining = getFreeViewsRemaining(session, freeEntry, keys);
    return grant(
      'free',
      remaining > 0,
      formatViewsLeft(remaining),
      LOCK_REASON.NO_VIEWS,
      { remaining }
    );
  }

  if (type === 'number_of_days' && Number.isFinite(limit)) {
    if (limit <= 0) {
      return grant('free', false, 'no days left', LOCK_REASON.DAYS_EXPIRED);
    }
    const startYmd = getFreeDaysStartYmd(session, freeEntry, lessonData);
    if (!startYmd) return grant('free', true, formatDaysLeft(limit));
    const left = daysLeftInWindow(startYmd, limit);
    if (!left || left <= 0) {
      return grant('free', false, 'no days left', LOCK_REASON.DAYS_EXPIRED);
    }
    return grant('free', true, formatDaysLeft(left));
  }

  // No viewing settings → unlimited free access
  return grant('free', true, 'free');
}

/**
 * Resolve everything the UI needs for one playlist slot.
 *
 * @returns {{
 *   unlocked: boolean,
 *   source: 'free'|'credit'|'code'|null,
 *   label: string|null,
 *   labelIsWarning: boolean,
 *   reason: string|null,
 *   viewsRemaining: number|null,
 *   partKey: string,
 * }}
 */
export function getVideoPartAccessState({
  session,
  sessionId,
  videoId,
  videoIndex,
  studentEntries = [],
  lessonData = null,
  unlockedInfo = null,
  attendedInCenterFallback = false,
  freeAccessAllowed = null,
}) {
  const sid = String(sessionId ?? session?._id ?? '');
  const keys = resolvePartViewKeys(videoId, videoIndex);
  const { freeEntry, creditEntry, codeEntry } = findSessionEntries(studentEntries, sid);

  const freeGrant = buildFreeGrant({
    session,
    freeEntry,
    lessonData,
    attendedInCenterFallback,
    freeAccessAllowed,
    keys,
  });
  const creditGrant = buildCreditGrant({
    creditEntry,
    unlockedInfo,
    videoId,
    videoIndex,
    keys,
  });
  const codeGrant = buildCodeGrant({ codeEntry, unlockedInfo, keys });

  // Prefer free access while it lasts, then a spent credit, then a redeemed code.
  const active = [freeGrant, creditGrant, codeGrant].find((g) => g && g.valid) || null;
  // When everything is exhausted, report the grant the student most recently relied on.
  const fallback = [codeGrant, creditGrant, freeGrant].find(Boolean) || null;
  const chosen = active || fallback;

  const isFree = isFreePaymentState(session?.payment_state);
  let label = chosen?.label ?? null;
  // Mark free access as free, without hiding an exhausted-access warning.
  if (isFree && chosen === freeGrant && label && label !== 'free' && chosen.valid) {
    label = `free · ${label}`;
  }

  let reason = null;
  if (!active) {
    reason =
      fallback?.reason ||
      (isFree && !freeGrant ? LOCK_REASON.NOT_ATTENDED : LOCK_REASON.NEEDS_CODE);
  }

  return {
    unlocked: !!active,
    source: active?.kind ?? null,
    label,
    labelIsWarning: !active && !!label,
    reason,
    viewsRemaining: chosen?.remaining ?? null,
    partKey: makeVideoPartKey(videoId, videoIndex),
    grants: { free: freeGrant, credit: creditGrant, code: codeGrant },
  };
}
