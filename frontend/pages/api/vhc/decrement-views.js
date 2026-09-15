import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';
import { CODE_ERROR, codeErrorPayload } from '../../../lib/verificationCodeMessages';
import {
  getPartViewsUsed,
  getViewsRemainingForPart,
  makeVideoPartKey,
  normalizePartViews,
  resolveViewsPerVideoLimit,
} from '../../../lib/videoPartViews';

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index === -1) return;
      const key = trimmed.substring(0, index).trim();
      let value = trimmed.substring(index + 1).trim();
      value = value.replace(/^"|"$/g, '');
      envVars[key] = value;
    });
    return envVars;
  } catch {
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI;
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (!['student', 'admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { vhc_id, session_id, video_part_key, video_id, video_index } = req.body;

    if (!vhc_id) {
      return res.status(400).json({
        success: false,
        error: 'VHC ID is required',
      });
    }

    const studentId = parseInt(user.assistant_id || user.id);
    const partKey = makeVideoPartKey(video_part_key || video_id, video_index);

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const vhcRecord = await db.collection('VHC').findOne({ _id: new ObjectId(vhc_id) });
    if (!vhcRecord) {
      return res.status(404).json({
        success: false,
        error: 'VHC record not found',
      });
    }

    const codeSettings = vhcRecord.code_settings || 'number_of_views';
    if (codeSettings !== 'number_of_views') {
      return res.status(200).json({
        success: true,
        message: 'No decrement needed for this code type',
      });
    }

    const student = await db.collection('students').findOne({ id: studentId });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const sessionIdStr = session_id ? String(session_id) : null;
    const homeworksVideos = Array.isArray(student.homeworks_videos)
      ? [...student.homeworks_videos]
      : [];
    const entryIdx = sessionIdStr
      ? homeworksVideos.findIndex((s) => {
          const vid = typeof s.video_id === 'string' ? s.video_id : s.video_id?.toString();
          return vid === sessionIdStr && String(s.vhc_id) === String(vhc_id);
        })
      : -1;

    const entry = entryIdx >= 0 ? homeworksVideos[entryIdx] : null;
    const limitPerVideo = resolveViewsPerVideoLimit(entry, vhcRecord.number_of_views);
    const usedBefore = getPartViewsUsed(entry, partKey);
    const remainingBefore = getViewsRemainingForPart(entry, limitPerVideo, partKey);

    if (remainingBefore <= 0) {
      return res.status(200).json(
        codeErrorPayload('vhc', CODE_ERROR.NO_VIEWS_REMAINING, {
          code_settings: 'number_of_views',
          video_part_key: partKey,
        })
      );
    }

    const partViews = normalizePartViews(entry?.part_views);
    partViews[partKey] = usedBefore + 1;
    const remainingAfter = Math.max(0, limitPerVideo - partViews[partKey]);

    if (entryIdx >= 0) {
      homeworksVideos[entryIdx] = {
        ...entry,
        views_per_video_limit: limitPerVideo,
        part_views: partViews,
      };
      await db.collection('students').updateOne(
        { id: studentId },
        { $set: { homeworks_videos: homeworksVideos } }
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Views decremented successfully',
      number_of_views: remainingAfter,
      views_remaining_for_part: remainingAfter,
      video_part_key: partKey,
      views_per_video_limit: limitPerVideo,
    });
  } catch (error) {
    console.error('❌ Error in VHC decrement views API:', error);
    return res.status(500).json(codeErrorPayload('vhc', CODE_ERROR.INTERNAL_ERROR));
  } finally {
    if (client) await client.close();
  }
}
