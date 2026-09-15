import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../../lib/authMiddleware';
import {
  buildPaymentHistoryEntry,
  normalizePaymentHistory,
} from '../../../../lib/paymentHistory';
import {
  getPartViewsUsed,
  makeVideoPartKey,
  resolveViewsPerVideoLimit,
} from '../../../../lib/videoPartViews';

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
      let value = trimmed.substring(index + 1).trim();
      value = value.replace(/^"|"$/g, '');
      envVars[trimmed.substring(0, index).trim()] = value;
    });
    return envVars;
  } catch {
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI;
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME;
const PAYMENT_ENABLED =
  envConfig.SYSTEM_PAYMENT_SYSTEM === 'true' ||
  process.env.SYSTEM_PAYMENT_SYSTEM === 'true';

/**
 * Unlock one paid video part using exactly 1 session credit → exactly 1 view.
 * Atomic deduct via conditional $inc; idempotent if already unlocked for this part.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!PAYMENT_ENABLED) {
    return res.status(400).json({ error: 'Payment system is not enabled' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const studentId = parseInt(req.query.id, 10);
    const authId = parseInt(user.assistant_id || user.id, 10);
    if (!Number.isFinite(studentId) || authId !== studentId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { session_id, content_type, video_id, video_index, lesson } = req.body || {};
    if (!session_id || !content_type) {
      return res.status(400).json({ error: 'session_id and content_type are required' });
    }
    if (content_type !== 'online_session' && content_type !== 'homework_video') {
      return res.status(400).json({ error: 'Invalid content_type' });
    }

    const partKey = makeVideoPartKey(video_id, video_index);
    const arrayField =
      content_type === 'homework_video' ? 'homeworks_videos' : 'online_sessions';
    const contentCollection =
      content_type === 'homework_video' ? 'homeworks_videos' : 'online_sessions';

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const session = await db.collection(contentCollection).findOne({
      _id: new ObjectId(String(session_id)),
    });
    if (!session) {
      return res.status(400).json({ error: 'Invalid session' });
    }

    const student = await db.collection('students').findOne({ id: studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const list = Array.isArray(student[arrayField]) ? [...student[arrayField]] : [];
    const existingIdx = list.findIndex((e) => String(e.video_id) === String(session_id));
    const existing = existingIdx >= 0 ? list[existingIdx] : null;

    // Idempotent only while this part still has remaining session-credit views
    if (existing?.paid_with_session) {
      const limit = resolveViewsPerVideoLimit(existing, 1);
      const used = getPartViewsUsed(existing, partKey);
      const remaining = Math.max(0, limit - used);
      const unlockedThisPart =
        existing.session_unlock_part === partKey ||
        (existing.part_views &&
          Object.prototype.hasOwnProperty.call(existing.part_views, partKey));
      if (unlockedThisPart && remaining > 0) {
        return res.status(200).json({
          success: true,
          alreadyUnlocked: true,
          numberOfSessions: Number(student.payment?.numberOfSessions) || 0,
          views_per_video_limit: limit,
          video_part_key: partKey,
          views_remaining: remaining,
          entry: existing,
          message: 'Video already unlocked with 1 view.',
        });
      }
    }

    // Always grant a fresh view for this credit (do not inherit free/VVC used counts)
    const unlockEntry = {
      ...(existing || {}),
      video_id: String(session_id),
      paid_with_session: true,
      views_per_video_limit: 1,
      part_views: {
        ...(existing?.part_views && typeof existing.part_views === 'object'
          ? existing.part_views
          : {}),
        [partKey]: 0,
      },
      session_unlock_part: partKey,
      date: new Date().toISOString(),
    };

    const nextList = [...list];
    if (existingIdx >= 0) nextList[existingIdx] = unlockEntry;
    else nextList.push(unlockEntry);

    const lessonName = String(lesson || session.lesson || session.name || '').trim();
    const contentKind =
      content_type === 'homework_video' ? 'homework video' : 'recorded session';
    const historyReason = lessonName
      ? `Unlocked ${contentKind} for lesson “${lessonName}” with 1 view`
      : `Unlocked ${contentKind} with 1 view`;

    const historyEntry = buildPaymentHistoryEntry({
      type: 'session_deduct_unlock',
      delta: -1,
      balanceAfter: Math.max(0, (Number(student.payment?.numberOfSessions) || 0) - 1),
      reason: historyReason,
      lesson: lessonName || null,
      contentKind,
      by: 'student',
    });

    // Atomic: only succeed if student still has ≥ 1 session credit
    const deductResult = await db.collection('students').findOneAndUpdate(
      {
        id: studentId,
        'payment.numberOfSessions': { $gte: 1 },
      },
      {
        $inc: { 'payment.numberOfSessions': -1 },
        $set: {
          [arrayField]: nextList,
        },
        $push: {
          'payment.paymentHistory': {
            $each: [historyEntry],
            $position: 0,
            $slice: 200,
          },
        },
      },
      { returnDocument: 'after' }
    );

    const updated = deductResult?.value || deductResult;
    if (!updated) {
      // Re-check: maybe concurrent unlock already applied, or zero sessions
      const fresh = await db.collection('students').findOne({ id: studentId });
      const freshList = Array.isArray(fresh?.[arrayField]) ? fresh[arrayField] : [];
      const freshEntry = freshList.find((e) => String(e.video_id) === String(session_id));
      if (freshEntry?.paid_with_session) {
        const limit = resolveViewsPerVideoLimit(freshEntry, 1);
        const used = getPartViewsUsed(freshEntry, partKey);
        const remaining = Math.max(0, limit - used);
        if (remaining > 0) {
          return res.status(200).json({
            success: true,
            alreadyUnlocked: true,
            numberOfSessions: Number(fresh.payment?.numberOfSessions) || 0,
            views_per_video_limit: limit,
            video_part_key: partKey,
            views_remaining: remaining,
            entry: freshEntry,
            message: 'Video already unlocked with 1 view.',
          });
        }
      }
      return res.status(400).json({
        error: 'No session credits available. Please use a verification code or top up sessions.',
      });
    }

    // Fix history balanceAfter to match actual post-deduct balance
    const balanceAfter = Number(updated.payment?.numberOfSessions) || 0;
    const hist = normalizePaymentHistory(updated.payment);
    if (hist[0] && hist[0].type === 'session_deduct_unlock' && hist[0].balanceAfter !== balanceAfter) {
      hist[0] = { ...hist[0], balanceAfter };
      await db.collection('students').updateOne(
        { id: studentId },
        { $set: { 'payment.paymentHistory': hist.slice(0, 200) } }
      );
    }

    const savedList = Array.isArray(updated[arrayField]) ? updated[arrayField] : nextList;
    const savedEntry =
      savedList.find((e) => String(e.video_id) === String(session_id)) || unlockEntry;

    return res.status(200).json({
      success: true,
      numberOfSessions: balanceAfter,
      views_per_video_limit: 1,
      video_part_key: partKey,
      views_remaining: 1,
      entry: savedEntry,
      message: 'Video unlocked. 1 view is now available.',
    });
  } catch (e) {
    console.error('unlock-paid-content-with-session', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  } finally {
    if (client) await client.close();
  }
}
