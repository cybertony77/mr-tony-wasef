/**
 * Shared helpers for multi-video session / homework player titles.
 * Format: "Lesson 1 • Video 2" or "Lesson 1 • first video" when a custom name exists.
 */

export function countSessionVideos(session) {
  if (!session) return 0;
  let n = 0;
  let i = 1;
  while (session[`video_ID_${i}`]) {
    n += 1;
    i += 1;
  }
  return n;
}

/**
 * @param {object} session - online_sessions / homeworks_videos document
 * @param {number|string|null} videoIndex - 1-based part index
 * @param {{ preferSessionName?: boolean }} opts
 *   preferSessionName: use session.name as left side (manage UI) instead of lesson
 */
export function buildPlayerTitle(session, videoIndex, opts = {}) {
  const lesson = String(session?.lesson || '').trim();
  const sessionName = String(session?.name || '').trim();
  const left = opts.preferSessionName
    ? sessionName || lesson
    : lesson || sessionName;
  const customName = String(session?.[`video_name_${videoIndex}`] || '').trim();
  const partLabel = customName || (videoIndex != null && videoIndex !== '' ? `Video ${videoIndex}` : '');
  const multi = countSessionVideos(session) > 1;

  if (multi && left && partLabel) return `${left} • ${partLabel}`;
  if (multi && partLabel) return partLabel;
  if (lesson && sessionName && lesson !== sessionName) {
    return opts.preferSessionName ? `${sessionName} • ${lesson}` : `${lesson} • ${sessionName}`;
  }
  return sessionName || lesson || partLabel || 'Video';
}

/** Label for a video button in a multi-video list (manage or student). */
export function buildVideoButtonLabel(session, videoIndex) {
  const customName = String(session?.[`video_name_${videoIndex}`] || '').trim();
  const partLabel = customName || `Video ${videoIndex}`;
  const sessionName = String(session?.name || '').trim();
  const lesson = String(session?.lesson || '').trim();
  const left = sessionName || lesson;
  if (countSessionVideos(session) > 1 && left) {
    return `${left} • ${partLabel}`;
  }
  return partLabel;
}

export function withSelectedVideoMeta(session, { videoId, videoIndex, videoType, extra = {}, preferSessionName = false }) {
  return {
    ...session,
    video_ID: videoId,
    video_type: videoType || session[`video_type_${videoIndex}`] || 'youtube',
    video_index: videoIndex,
    video_part_name: session[`video_name_${videoIndex}`] || null,
    player_title: buildPlayerTitle(session, videoIndex, { preferSessionName }),
    ...extra,
  };
}
