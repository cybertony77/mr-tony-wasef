/**
 * Shared helpers for question / overall explanation videos
 * (homework, quiz, online mock exam).
 */

import { extractZoomMeetingId } from './zoomUtils';

export function createEmptyExplanationVideoForm() {
  return {
    video_name: '',
    youtube_url: '',
    zoom_meeting_id: '',
    google_meet_id: '',
    r2_key: '',
    r2_file_name: '',
    video_source: 'youtube',
    upload_status: 'idle',
    upload_progress: 0,
    upload_file_name: '',
  };
}

export function explanationVideoHasContent(video) {
  if (!video || typeof video !== 'object') return false;
  if (video.video_type && video.video_id) return true;
  if (String(video.r2_key || '').trim()) return true;
  if (String(video.youtube_url || '').trim()) return true;
  if (String(video.zoom_meeting_id || '').trim()) return true;
  if (String(video.google_meet_id || '').trim()) return true;
  return false;
}

/** DB / API shape → form VideoInput shape */
export function explanationVideoFromDb(stored) {
  const empty = createEmptyExplanationVideoForm();
  if (!stored || typeof stored !== 'object') return empty;

  // Already form-shaped
  if (
    stored.youtube_url ||
    stored.r2_key ||
    stored.zoom_meeting_id ||
    stored.google_meet_id ||
    stored.video_source
  ) {
    return {
      ...empty,
      ...stored,
      video_name: stored.video_name || '',
      youtube_url: stored.youtube_url || '',
      zoom_meeting_id: stored.zoom_meeting_id || '',
      google_meet_id: stored.google_meet_id || '',
      r2_key: stored.r2_key || '',
      r2_file_name: stored.r2_file_name || stored.upload_file_name || '',
      video_source: stored.video_source || 'youtube',
      upload_status: stored.r2_key ? 'done' : 'idle',
      upload_file_name: stored.r2_file_name || stored.upload_file_name || '',
    };
  }

  const type = String(stored.video_type || '').toLowerCase();
  const id = String(stored.video_id || '').trim();
  if (!type || !id) return empty;

  if (type === 'r2') {
    return {
      ...empty,
      video_source: 'r2',
      r2_key: id,
      r2_file_name: stored.video_name || '',
      upload_file_name: stored.video_name || '',
      upload_status: 'done',
      video_name: stored.video_name || '',
    };
  }
  if (type === 'youtube') {
    const url = id.includes('http') ? id : `https://www.youtube.com/watch?v=${id}`;
    return {
      ...empty,
      video_source: 'youtube',
      youtube_url: url,
      video_name: stored.video_name || '',
    };
  }
  if (type === 'zoom') {
    return {
      ...empty,
      video_source: 'zoom',
      zoom_meeting_id: id,
      video_name: stored.video_name || '',
    };
  }
  if (type === 'google_meet') {
    return {
      ...empty,
      video_source: 'google_meet',
      google_meet_id: id,
      video_name: stored.video_name || '',
    };
  }
  return empty;
}

function extractYouTubeId(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const match = raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/
  );
  if (match?.[1]) return match[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  return '';
}

/** Form VideoInput shape → DB shape (or null if empty) */
export function serializeExplanationVideoForDb(formVideo) {
  if (!formVideo || typeof formVideo !== 'object') return null;

  // Already DB-shaped
  if (formVideo.video_type && formVideo.video_id) {
    return {
      video_type: String(formVideo.video_type).toLowerCase(),
      video_id: String(formVideo.video_id).trim(),
      video_name: formVideo.video_name ? String(formVideo.video_name).trim() : null,
    };
  }

  const name =
    formVideo.video_name && String(formVideo.video_name).trim()
      ? String(formVideo.video_name).trim()
      : null;

  if (formVideo.r2_key && String(formVideo.r2_key).trim()) {
    return {
      video_type: 'r2',
      video_id: String(formVideo.r2_key).trim(),
      video_name: name || (formVideo.r2_file_name ? String(formVideo.r2_file_name).trim() : null),
    };
  }

  if (formVideo.youtube_url && String(formVideo.youtube_url).trim()) {
    const ytId = extractYouTubeId(formVideo.youtube_url);
    if (!ytId) return null;
    return { video_type: 'youtube', video_id: ytId, video_name: name };
  }

  if (formVideo.zoom_meeting_id && String(formVideo.zoom_meeting_id).trim()) {
    const meetingId = extractZoomMeetingId(formVideo.zoom_meeting_id);
    if (!meetingId) return null;
    return { video_type: 'zoom', video_id: meetingId, video_name: name };
  }

  if (formVideo.google_meet_id && String(formVideo.google_meet_id).trim()) {
    return {
      video_type: 'google_meet',
      video_id: String(formVideo.google_meet_id).trim(),
      video_name: name,
    };
  }

  return null;
}

/** Normalize stored DB video for player / display */
export function normalizeStoredExplanationVideo(stored) {
  if (!stored || typeof stored !== 'object') return null;
  if (stored.video_type && stored.video_id) {
    return {
      video_type: String(stored.video_type).toLowerCase(),
      video_id: String(stored.video_id).trim(),
      video_name: stored.video_name ? String(stored.video_name).trim() : null,
    };
  }
  return serializeExplanationVideoForDb(stored);
}

export const EXPLANATION_VIDEO_MAX_MB = 50;
export const EXPLANATION_VIDEO_MAX_BYTES = EXPLANATION_VIDEO_MAX_MB * 1024 * 1024;
