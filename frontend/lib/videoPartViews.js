/**
 * Per-video-part view limits within one recorded session / homework video document.
 * Each part (video_ID_1, video_ID_2, …) gets its own view allowance.
 */

export function makeVideoPartKey(videoId, videoIndex) {
  const id = String(videoId ?? '').trim();
  if (id) return id;
  if (videoIndex != null && videoIndex !== '') {
    return `part_${videoIndex}`;
  }
  return 'part_1';
}

export function normalizePartViews(partViews) {
  if (!partViews || typeof partViews !== 'object' || Array.isArray(partViews)) {
    return {};
  }
  return partViews;
}

export function getPartViewsUsed(entry, partKey) {
  const views = normalizePartViews(entry?.part_views);
  return Number(views[partKey]) || 0;
}

export function getViewsRemainingForPart(entry, limitPerVideo, partKey) {
  const limit = Number(limitPerVideo);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  const used = getPartViewsUsed(entry, partKey);
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
