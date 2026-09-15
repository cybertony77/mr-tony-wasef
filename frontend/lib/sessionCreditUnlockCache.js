import { studentKeys } from './api/students';
import { makeVideoPartKey } from './videoPartViews';

/** React Query keys may use string or number student ids — patch both. */
function studentDetailKeys(studentId) {
  if (studentId == null || studentId === '') return [];
  const keys = [String(studentId)];
  const asNum = Number(studentId);
  if (Number.isFinite(asNum)) keys.push(asNum);
  return [...new Set(keys)];
}

/**
 * Optimistically mark a video part as unlocked via 1 session credit.
 * Updates every matching student detail cache key so the video button
 * turns green without a full page refresh.
 */
export function applySessionCreditUnlockToCache(
  queryClient,
  studentId,
  {
    arrayField,
    sessionId,
    videoId,
    videoIndex,
    numberOfSessions,
  }
) {
  if (!queryClient || studentId == null || !sessionId || !arrayField) return;

  const partKey = makeVideoPartKey(videoId, videoIndex);
  const updater = (old) => {
    if (!old) return old;
    const list = Array.isArray(old[arrayField]) ? [...old[arrayField]] : [];
    const entry = {
      video_id: String(sessionId),
      paid_with_session: true,
      views_per_video_limit: 1,
      part_views: { [partKey]: 0 },
      session_unlock_part: partKey,
      date: new Date().toISOString(),
    };
    const idx = list.findIndex((s) => String(s.video_id) === String(sessionId));
    if (idx !== -1) {
      const prev = list[idx] || {};
      list[idx] = {
        ...prev,
        ...entry,
        // Fresh credit always starts at 0 used for this part
        part_views: {
          ...(prev.part_views && typeof prev.part_views === 'object' ? prev.part_views : {}),
          [partKey]: 0,
        },
      };
    } else {
      list.push(entry);
    }

    const payment = {
      ...(old.payment && typeof old.payment === 'object' ? old.payment : {}),
    };
    if (numberOfSessions != null && Number.isFinite(Number(numberOfSessions))) {
      payment.numberOfSessions = Math.max(0, Number(numberOfSessions));
    } else {
      payment.numberOfSessions = Math.max(
        0,
        (Number(old.payment?.numberOfSessions) || 0) - 1
      );
    }

    return { ...old, [arrayField]: list, payment };
  };

  for (const id of studentDetailKeys(studentId)) {
    queryClient.setQueryData(studentKeys.detail(id), updater);
  }
}

/** Patch a session-unlock / free / VVC entry back into the student cache. */
export function applyStudentArrayEntryToCache(
  queryClient,
  studentId,
  { arrayField, sessionId, entry, matchFn }
) {
  if (!queryClient || studentId == null || !sessionId || !arrayField || !entry) return;

  const updater = (old) => {
    if (!old) return old;
    const list = Array.isArray(old[arrayField]) ? [...old[arrayField]] : [];
    const idx = list.findIndex((s) => {
      if (typeof matchFn === 'function') return matchFn(s);
      return String(s.video_id) === String(sessionId);
    });
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    return { ...old, [arrayField]: list };
  };

  for (const id of studentDetailKeys(studentId)) {
    queryClient.setQueryData(studentKeys.detail(id), updater);
  }
}

export function invalidateStudentDetailCaches(queryClient, studentId) {
  if (!queryClient || studentId == null) return;
  for (const id of studentDetailKeys(studentId)) {
    queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
  }
}

export async function cancelStudentDetailFetches(queryClient, studentId) {
  if (!queryClient || studentId == null) return;
  await Promise.all(
    studentDetailKeys(studentId).map((id) =>
      queryClient.cancelQueries({ queryKey: studentKeys.detail(id) })
    )
  );
}
