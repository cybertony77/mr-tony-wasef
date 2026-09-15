import { getFreeViewsRemaining } from './onlineSessionViewing';
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
import { isCodeNumberOfDaysValid } from './codeNumberOfDays';
import { isDeadlinePassedEgypt } from './deadlineTimeEgypt';

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
  if (compareEgyptYmd(todayYmd, expiresYmd) >= 0) return 'no days left';
  const [y1, m1, d1] = todayYmd.split('-').map(Number);
  const [y2, m2, d2] = expiresYmd.split('-').map(Number);
  const left = Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000
  );
  if (left <= 0) return 'no days left';
  if (left === 1) return '1 day left';
  return `${left} days left`;
}

function formatDeadlineInfo(deadlineDate) {
  if (!deadlineDate) return null;
  if (isDeadlinePassedEgypt(deadlineDate, null)) return 'deadline passed';
  const ymd = toEgyptYmd(deadlineDate) || String(deadlineDate).slice(0, 10);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return `open till ${deadlineDate}`;
  const [y, m, d] = ymd.split('-');
  return `open till ${m}/${d}/${y}`;
}

function getCodeEntry(onlineEntry, hwEntry) {
  if (onlineEntry?.vvc_id) return onlineEntry;
  if (hwEntry?.vhc_id) return hwEntry;
  return null;
}

function getPartUsedAcrossSources(entry, unlockedInfo, videoId, videoIndex) {
  const keys = resolvePartViewKeys(videoId, videoIndex);
  const fromEntry = getPartViewsUsed(entry, keys);
  const fromInfo = getPartViewsUsed({ part_views: unlockedInfo?.part_views }, keys);
  return Math.max(fromEntry, fromInfo);
}

/** True when bracket text means access is exhausted / expired (render in red). */
export function isAccessBracketWarning(label) {
  if (!label) return false;
  const t = String(label).toLowerCase();
  return (
    t === 'no views left' ||
    t === 'no days left' ||
    t === 'deadline passed' ||
    t === 'expired' ||
    t.endsWith('no views left') ||
    t.endsWith('no days left') ||
    t.endsWith('deadline passed')
  );
}

/**
 * Remaining views for one video part (free / VVC / VHC / session-deduct unlock).
 * Each playlist slot has its own counter — watching video 1 must not reduce video 2/3.
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
  const info = unlockedInfo || null;
  const codeEntry = getCodeEntry(onlineEntry, hwEntry);

  // Session-credit unlock (1 credit → 1 part)
  if (onlineEntry?.paid_with_session || hwEntry?.paid_with_session) {
    const entry = onlineEntry?.paid_with_session ? onlineEntry : hwEntry;
    if (!isSessionCreditPartUnlocked(entry, partKey, videoId, videoIndex)) {
      return 0;
    }
    const limit = resolveViewsPerVideoLimit(entry, 1);
    const used = getPartUsedAcrossSources(entry, info, videoId, videoIndex);
    return Math.max(0, limit - used);
  }

  // VVC / VHC number_of_views — check BEFORE free payment_state
  const isViewsCode =
    info?.code_settings === 'number_of_views' ||
    (codeEntry &&
      (codeEntry.views_per_video_limit != null ||
        (codeEntry.part_views && typeof codeEntry.part_views === 'object')));

  if (isViewsCode && (info?.code_settings === 'number_of_views' || codeEntry)) {
    const entry = codeEntry;
    const limit = resolveViewsPerVideoLimit(
      entry,
      info?.views_per_video_limit ?? info?.number_of_views
    );
    if (limit <= 0 && info?.code_settings === 'number_of_views') {
      const fb = Number(info?.views_per_video_limit ?? info?.number_of_views);
      const effective = Number.isFinite(fb) && fb > 0 ? fb : 0;
      const used = getPartUsedAcrossSources(entry, info, videoId, videoIndex);
      return Math.max(0, effective - used);
    }
    const used = getPartUsedAcrossSources(entry, info, videoId, videoIndex);
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
      return getFreeViewsRemaining(
        session,
        freeEntry,
        resolvePartViewKeys(videoId, videoIndex)
      );
    }
    return null;
  }

  return null;
}

export function formatViewsRemainingLabel(remaining) {
  return formatViewsInfo(remaining);
}

/**
 * Days left for one video part.
 * Prefer per-part first-open when present; else session/code-level start.
 */
export function getVideoPartDaysLeftLabel({
  session,
  sessionId,
  videoId,
  videoIndex,
  studentOnlineEntries = [],
  studentHomeworkEntries = [],
  unlockedInfo = null,
}) {
  const info = unlockedInfo || null;
  const sid = String(sessionId);
  const onlineEntry = findStudentSessionEntry(studentOnlineEntries, sid);
  const hwEntry = findStudentSessionEntry(studentHomeworkEntries, sid);
  const codeEntry = getCodeEntry(onlineEntry, hwEntry);
  const keys = resolvePartViewKeys(videoId, videoIndex);

  const partStarts =
    (codeEntry?.part_access_started_at &&
      typeof codeEntry.part_access_started_at === 'object' &&
      codeEntry.part_access_started_at) ||
    (info?.part_access_started_at &&
      typeof info.part_access_started_at === 'object' &&
      info.part_access_started_at) ||
    null;

  let partStartedAt = null;
  if (partStarts) {
    for (const k of keys) {
      if (partStarts[k]) {
        partStartedAt = partStarts[k];
        break;
      }
    }
  }

  if (info?.code_settings === 'number_of_days') {
    const days = info.number_of_days;
    const startedAt = partStartedAt || info.access_started_at;
    if (startedAt && !isCodeNumberOfDaysValid(startedAt, days)) {
      return 'no days left';
    }
    return formatDaysLeftFromStart(startedAt, days);
  }

  const paymentState = String(session?.payment_state || '');
  const isFreePayment =
    paymentState === 'free' ||
    paymentState === 'free_if_attended_in_center' ||
    paymentState === 'free_if_attended' ||
    paymentState === 'free_if_homework_done';

  if (isFreePayment && session?.viewing_limit_type === 'number_of_days') {
    const freeEntry = findStudentSessionEntry(studentOnlineEntries, sid, {
      free_viewing: true,
    });
    const startedAt =
      partStartedAt || freeEntry?.first_opened_at || freeEntry?.first_viewed_at;
    return formatDaysLeftFromStart(startedAt, session.viewing_limit_value);
  }

  return null;
}

/**
 * Whether this part can still be played given unlock + views/days/deadline.
 */
export function isVideoPartAccessPlayable({
  session,
  sessionId,
  videoId,
  videoIndex,
  studentOnlineEntries = [],
  studentHomeworkEntries = [],
  unlockedInfo = null,
  sessionUnlocked = false,
}) {
  if (!sessionUnlocked) return false;

  const info = unlockedInfo || null;

  if (info?.code_settings === 'number_of_days') {
    if (
      info.access_started_at != null &&
      info.number_of_days != null &&
      !isCodeNumberOfDaysValid(info.access_started_at, info.number_of_days)
    ) {
      return false;
    }
  }
  if (info?.code_settings === 'deadline_date' && info.deadline_date) {
    if (isDeadlinePassedEgypt(info.deadline_date, null)) return false;
  }

  const remaining = getVideoPartViewsRemaining({
    session,
    sessionId,
    videoId,
    videoIndex,
    studentOnlineEntries,
    studentHomeworkEntries,
    unlockedInfo,
  });
  if (remaining === null) return true;
  return remaining > 0;
}

/**
 * Bracket text for video buttons.
 * Free videos show "free" (plus views/days/deadline when limited).
 * Paid unlocks show access info only (no "paid" tag).
 * Exhausted access still shows e.g. "no views left" / "no days left" / "deadline passed".
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
  hasSessionAccess = false,
}) {
  // Truly locked (never unlocked) → no bracket
  // Unlocked session but this part exhausted → still show warning label
  if (!isUnlocked && !hasSessionAccess) return null;

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
    if (isAccessBracketWarning(infoText)) return infoText;
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
    if (remaining == null) return null;
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
      return getVideoPartDaysLeftLabel({
        session,
        sessionId,
        videoId,
        videoIndex,
        studentOnlineEntries,
        studentHomeworkEntries,
        unlockedInfo,
      });
    }
    if (info.code_settings === 'deadline_date' && info.deadline_date) {
      return formatDeadlineInfo(info.deadline_date);
    }
  }

  // Code unlock on student record without local Map (multi-video / lag)
  const codeEntry = getCodeEntry(onlineEntry, hwEntry);
  if (codeEntry && (codeEntry.views_per_video_limit != null || codeEntry.part_views)) {
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

  // Free / free-if-* viewing
  if (isFreePayment) {
    const freeEntry = findStudentSessionEntry(studentOnlineEntries, sid, {
      free_viewing: true,
    });
    if (session?.viewing_limit_type === 'number_of_views') {
      const remaining = getFreeViewsRemaining(
        session,
        freeEntry,
        resolvePartViewKeys(videoId, videoIndex)
      );
      return withFreePrefix(formatViewsInfo(remaining));
    }
    if (session?.viewing_limit_type === 'number_of_days') {
      const daysLabel = getVideoPartDaysLeftLabel({
        session,
        sessionId,
        videoId,
        videoIndex,
        studentOnlineEntries,
        studentHomeworkEntries,
        unlockedInfo,
      });
      return withFreePrefix(daysLabel);
    }
    // Unlimited free
    return isUnlocked ? 'free' : null;
  }

  return null;
}
