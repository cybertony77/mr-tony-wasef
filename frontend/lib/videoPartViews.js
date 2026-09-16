/**
 * Per-video-part view limits within one recorded session / homework video document.
 * Each playlist slot (video_ID_1, video_ID_2, …) gets its own view allowance.
 *
 * Primary key is always `part_${index}` so duplicate source IDs still get separate counters.
 * Legacy keys (raw youtube/zoom/r2 ids) are still read for older student records.
 */

export function makeVideoPartKey(videoId, videoIndex) {
  if (videoIndex != null && videoIndex !== '') {
    const n = Number(videoIndex);
    if (Number.isFinite(n) && n >= 1) return `part_${n}`;
    return `part_${String(videoIndex).trim()}`;
  }
  const id = String(videoId ?? '').trim();
  if (id) return id;
  return 'part_1';
}

/** All keys that may store usage for this playlist slot (primary + legacy). */
export function resolvePartViewKeys(videoId, videoIndex) {
  const keys = [];
  const primary = makeVideoPartKey(videoId, videoIndex);
  if (primary) keys.push(primary);
  const id = String(videoId ?? '').trim();
  if (id && !keys.includes(id)) keys.push(id);
  if (videoIndex != null && videoIndex !== '') {
    const idxKey = `part_${videoIndex}`;
    if (!keys.includes(idxKey)) keys.push(idxKey);
  }
  return keys;
}

export function normalizePartViews(partViews) {
  if (!partViews || typeof partViews !== 'object' || Array.isArray(partViews)) {
    return {};
  }
  return partViews;
}

/**
 * @param {object|null} entry
 * @param {string|string[]} partKeyOrKeys
 */
export function getPartViewsUsed(entry, partKeyOrKeys) {
  const views = normalizePartViews(entry?.part_views);
  const keys = Array.isArray(partKeyOrKeys) ? partKeyOrKeys : [partKeyOrKeys];
  for (const k of keys) {
    if (k != null && k !== '' && Object.prototype.hasOwnProperty.call(views, k)) {
      const n = Number(views[k]);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  return 0;
}

export function getViewsRemainingForPart(entry, limitPerVideo, partKeyOrKeys) {
  const limit = Number(limitPerVideo);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  const used = getPartViewsUsed(entry, partKeyOrKeys);
  return Math.max(0, limit - used);
}

export function resolveViewsPerVideoLimit(entry, fallbackLimit) {
  const fromEntry = entry?.views_per_video_limit;
  if (fromEntry != null && fromEntry !== '') {
    const n = Number(fromEntry);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const fb = Number(fallbackLimit);
  if (Number.isFinite(fb) && fb >= 0) return fb;
  return 0;
}

/** True when this part was granted via session-credit unlock (1 credit → 1 part). */
export function isSessionCreditPartUnlocked(entry, partKey, videoId = null, videoIndex = null) {
  if (!entry?.paid_with_session) return false;
  const views = normalizePartViews(entry.part_views);
  // Only the requested slot's keys count — never the slot the credit was spent on.
  const keys = [partKey, ...resolvePartViewKeys(videoId, videoIndex)].filter(Boolean);
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(views, k)) return true;
    if (entry.session_unlock_part != null && String(entry.session_unlock_part) === String(k)) {
      return true;
    }
  }
  return false;
}
