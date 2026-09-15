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
  resolvePartViewKeys,
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

    const { vvc_id, session_id, video_part_key, video_id, video_index } = req.body;

    if (!vvc_id) {
      return res.status(400).json({
        success: false,
        error: 'VVC ID is required',
      });
    }

    const studentId = parseInt(user.assistant_id || user.id);
    // Prefer playlist index so each video slot has its own counter
    const partKey = makeVideoPartKey(
      video_part_key && String(video_part_key).startsWith('part_')
        ? video_part_key
        : video_id || video_part_key,
      video_index
    );
    const legacyKeys = resolvePartViewKeys(video_id || video_part_key, video_index);

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const vvcRecord = await db.collection('VVC').findOne({ _id: new ObjectId(vvc_id) });
    if (!vvcRecord) {
      return res.status(404).json({
        success: false,
        error: 'VVC record not found',
      });
    }

    const codeSettings = vvcRecord.code_settings || 'number_of_views';
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
    const onlineSessions = Array.isArray(student.online_sessions) ? [...student.online_sessions] : [];
    const entryIdx = sessionIdStr
      ? onlineSessions.findIndex((s) => {
          const vid = typeof s.video_id === 'string' ? s.video_id : s.video_id?.toString();
          return vid === sessionIdStr && String(s.vvc_id) === String(vvc_id);
        })
      : -1;

    const entry = entryIdx >= 0 ? onlineSessions[entryIdx] : null;
    const limitPerVideo = resolveViewsPerVideoLimit(entry, vvcRecord.number_of_views);
    const usedBefore = getPartViewsUsed(entry, legacyKeys);
    const remainingBefore = Math.max(0, limitPerVideo - usedBefore);

    if (remainingBefore <= 0) {
      return res.status(200).json(
        codeErrorPayload('vvc', CODE_ERROR.NO_VIEWS_REMAINING, {
          code_settings: 'number_of_views',
          video_part_key: partKey,
        })
      );
    }

    const partViews = normalizePartViews(entry?.part_views);
    // Migrate: clear legacy keys for this slot so only primary part_N remains
    for (const k of legacyKeys) {
      if (k !== partKey && Object.prototype.hasOwnProperty.call(partViews, k)) {
        delete partViews[k];
      }
    }
    partViews[partKey] = usedBefore + 1;
    const remainingAfter = Math.max(0, limitPerVideo - partViews[partKey]);

    let updatedEntry = entry;
    if (entryIdx >= 0) {
      updatedEntry = {
        ...entry,
        views_per_video_limit: limitPerVideo,
        part_views: partViews,
      };
      onlineSessions[entryIdx] = updatedEntry;
      await db.collection('students').updateOne(
        { id: studentId },
        { $set: { online_sessions: onlineSessions } }
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Views decremented successfully',
      // Remaining for THIS video part only — do not treat as session-wide
      number_of_views: remainingAfter,
      views_remaining_for_part: remainingAfter,
      video_part_key: partKey,
      views_per_video_limit: limitPerVideo,
      entry: updatedEntry,
    });
  } catch (error) {
    console.error('❌ Error in VVC decrement views API:', error);
    return res.status(500).json(codeErrorPayload('vvc', CODE_ERROR.INTERNAL_ERROR));
  } finally {
    if (client) await client.close();
  }
}
