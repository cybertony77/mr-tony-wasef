import fs from 'fs';
import path from 'path';

function resolveAppVideosPath() {
  const candidates = [
    path.join(process.cwd(), '..', 'app_videos.json'),
    path.join(process.cwd(), 'app_videos.json'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function normalizeVideo(video, index) {
  if (!video || typeof video !== 'object') return null;

  const title = String(video.video_title || '').trim();
  const role = String(video.video_role || '').trim().toLowerCase();
  const url = String(video.video_url || '').trim();

  if (!title || !role || !/^https?:\/\//i.test(url)) return null;

  return {
    id: `app-video-${index + 1}`,
    video_title: title,
    video_role: role,
    video_url: url,
  };
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const jsonPath = resolveAppVideosPath();
    if (!jsonPath) {
      return res.status(404).json({
        error: 'app_videos.json was not found',
        videos: [],
      });
    }

    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(parsed)) {
      return res.status(500).json({
        error: 'app_videos.json must contain an array',
        videos: [],
      });
    }

    const videos = parsed
      .map(normalizeVideo)
      .filter(Boolean);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ videos });
  } catch (error) {
    console.error('Error reading app_videos.json:', error);
    return res.status(500).json({
      error: 'Could not read app videos',
      videos: [],
    });
  }
}
