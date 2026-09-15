import { getFreeViewsRemaining } from './onlineSessionViewing';
import {
  getPartViewsUsed,
  makeVideoPartKey,
  resolveViewsPerVideoLimit,
} from './videoPartViews';
import {
  toEgyptYmd,
  getEgyptYmdToday,
  addDaysEgyptYmd,
  compareEgyptYmd,
} from './egyptDateTime';
import { isCodeNumberOfDaysValid } from './codeNumberOfDays';

function findStudentSessionEntry(list, sessionId, opts = {}) {
  if (!Array.isArray(list) || !sessionId) return null;
  return (
    list.find((s) => {
      const vid = typeof s.video_id === 'string' ? s.video_id : s.video_id?.toString();
      if (vid !== String(sessionId)) return false;
      if (opts.free_viewing) return s.free_viewing === true;
      if (opts.vvc_id) return !!s.vvc_id;
      if (opts.vhc_id) return !!s.vhc_id;
      return true;
    }) || null
  );
}

function formatViewsInfo(remaining) {
  if (remaining == null) return null;
  if (remaining <= 0) return 'no views left';
  if (remaining === 1) return '1 view left';
  return `${remaining} views left`;
}

function formatDaysLeftFromStart(startedAt, numberOfDays) {
  const days = Number(numberOfDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  if (!startedAt) return `${days} day${days === 1 ? '' : 's'} access`;
  const firstYmd = toEgyptYmd(startedAt);
  const todayYmd = getEgyptYmdToday();
  if (!firstYmd || !todayYmd) return `${days} day${days === 1 ? '' : 's'} access`;
  const expiresYmd = addDaysEgyptYmd(firstYmd, days); // exclusive end
  if (!expiresYmd) return null;
  if (compareEgyptYmd(todayYmd, expiresYmd) >= 0) return 'expired';
  const [y1, m1, d1] = todayYmd.split('-').map(Number);
  const [y2, m2, d2] = expiresYmd.split('-').map(Number);
  const left = Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000
  );
  if (left <= 0) return 'expired';
  if (left === 1) return '1 day left';
  return `${left} days left`;
}

function formatDeadlineInfo(deadlineDate) {
  if (!deadlineDate) return null;
  const ymd = toEgyptYmd(deadlineDate) || String(deadlineDate).slice(0, 10);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return `open till ${deadlineDate}`;
  const [y, m, d] = ymd.split('-');
  return `open till ${m}/${d}/${y}`;
}

/**
 * Remaining views for one video part (free / VVC / VHC / session-deduct unlock).
 */
export function getVideoPartViewsRemaining({
  session,
  sessionId,
  videoId,
  videoIndex,
  studentOnlineEntries = [],
  studentHomeworkEntries = [],
  unlockedInfo = null,
}) {
  const partKey = makeVideoPartKey(videoId, videoIndex);
  const sid = String(sessionId);

  const onlineEntry = findStudentSessionEntry(studentOnlineEntries, sid);
  const hwEntry = findStudentSessionEntry(studentHomeworkEntries, sid);

  if (onlineEntry?.paid_with_session || hwEntry?.paid_with_session) {
    const entry = onlineEntry?.paid_with_session ? onlineEntry : hwEntry;
    const limit = resolveViewsPerVideoLimit(entry, 1);
    const used = getPartViewsUsed(entry, partKey);
    return Math.max(0, limit - used);
  }

  if (
    session?.payment_state === 'free' ||
    session?.payment_state === 'free_if_attended_in_center'
  ) {
    const freeEntry = findStudentSessionEntry(studentOnlineEntries, sid, {
      free_viewing: true,
    });
    if (session?.viewing_limit_type === 'number_of_views') {
      return getFreeViewsRemaining(session, freeEntry, partKey);
    }
    return null;
  }

  const info = unlockedInfo || null;
  if (info?.code_settings === 'number_of_views') {
    const entry = onlineEntry?.vvc_id ? onlineEntry : hwEntry;
    const limit = resolveViewsPerVideoLimit(
      entry,
      info.views_per_video_limit ?? info.number_of_views
    );
    const used = getPartViewsUsed(entry, partKey);
    return Math.max(0, limit - used);
  }

  return null;
}

export function formatViewsRemainingLabel(remaining) {
  return formatViewsInfo(remaining);
}

/**
 * Bracket text for video buttons.
 * Free videos show "free" (plus views/days/deadline when limited).
 * Paid unlocks show access info only (no "paid" tag).
 * Examples: "free", "free · 2 views left", "5 days left", "open till 05/13/2026"
 */
export function getVideoAccessBracketLabel({
  session,
  sessionId,
  videoId,
  videoIndex,
  studentOnlineEntries = [],
  studentHomeworkEntries = [],
  unlockedInfo = null,
  isUnlocked = false,
}) {
  if (!isUnlocked) return null;

  const sid = String(sessionId);
  const onlineEntry = findStudentSessionEntry(studentOnlineEntries, sid);
  const hwEntry = findStudentSessionEntry(studentHomeworkEntries, sid);
  const info = unlockedInfo || null;
  const paymentState = String(session?.payment_state || '');
  const isFreePayment =
    paymentState === 'free' ||
    paymentState === 'free_if_attended_in_center' ||
    paymentState === 'free_if_attended' ||
    paymentState === 'free_if_homework_done';

  const withFreePrefix = (infoText) => {
    if (!isFreePayment) return infoText;
    if (!infoText) return 'free';
    if (infoText === 'free') return infoText;
    return `free · ${infoText}`;
  };

  // Session-credit unlock → views remaining (not labeled free)
  if (onlineEntry?.paid_with_session || hwEntry?.paid_with_session) {
    const remaining = getVideoPartViewsRemaining({
      session,
      sessionId,
      videoId,
      videoIndex,
      studentOnlineEntries,
      studentHomeworkEntries,
      unlockedInfo,
    });
    return formatViewsInfo(remaining);
  }

  // VVC / VHC unlock info
  if (info) {
    if (info.code_settings === 'number_of_views') {
      const remaining = getVideoPartViewsRemaining({
        session,
        sessionId,
        videoId,
        videoIndex,
        studentOnlineEntries,
        studentHomeworkEntries,
        unlockedInfo,
      });
      return formatViewsInfo(remaining);
    }
    if (info.code_settings === 'number_of_days') {
      if (!isCodeNumberOfDaysValid(info.access_started_at, info.number_of_days)) {
        return 'expired';
      }
      return formatDaysLeftFromStart(info.access_started_at, info.number_of_days);
    }
    if (info.code_settings === 'deadline_date' && info.deadline_date) {
      return formatDeadlineInfo(info.deadline_date);
    }
  }

  // Free / free-if-* viewing
  if (isFreePayment) {
    const freeEntry = findStudentSessionEntry(studentOnlineEntries, sid, {
      free_viewing: true,
    });
    if (session?.viewing_limit_type === 'number_of_views') {
      const remaining = getFreeViewsRemaining(
        session,
        freeEntry,
        makeVideoPartKey(videoId, videoIndex)
      );
      return withFreePrefix(formatViewsInfo(remaining));
    }
    if (session?.viewing_limit_type === 'number_of_days') {
      const startedAt = freeEntry?.first_opened_at || freeEntry?.first_viewed_at;
      return withFreePrefix(formatDaysLeftFromStart(startedAt, session.viewing_limit_value));
    }
    // Unlimited free
    return 'free';
  }

  return null;
}
