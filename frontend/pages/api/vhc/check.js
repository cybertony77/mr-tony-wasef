import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';
import {
  isCodeNumberOfDaysValid,
  computeAccessDeadlineDate,
} from '../../../lib/codeNumberOfDays';
import { isDeadlinePassedEgypt } from '../../../lib/deadlineTimeEgypt';
import { CODE_ERROR, codeErrorPayload } from '../../../lib/verificationCodeMessages';
import { recordPaymentSessionChange } from '../../../lib/paymentHistoryServer';

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, '');
          envVars[key] = value;
        }
      }
    });

    return envVars;
  } catch (error) {
    console.log('⚠️  Could not read env.config, using process.env as fallback');
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI;
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME;
const PAYMENT_SYSTEM_ENABLED =
  envConfig.SYSTEM_PAYMENT_SYSTEM === 'true' || process.env.SYSTEM_PAYMENT_SYSTEM === 'true';

function normalizeLessonName(value) {
  return String(value || '')
    .trim()
    .replace(/^\d+\s*[\.\-:)]\s*/, '')
    .toLowerCase();
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');

  return `${day}/${month}/${year} at ${hoursStr}:${minutes} ${ampm}`;
}

function sameId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

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

    const { VHC, session_id, lesson } = req.body;

    if (!VHC || VHC.length !== 9) {
      return res.status(400).json(codeErrorPayload('vhc', CODE_ERROR.INVALID_LENGTH));
    }

    if (!session_id) {
      return res.status(400).json(codeErrorPayload('vhc', CODE_ERROR.SESSION_ID_REQUIRED));
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const studentId = parseInt(user.assistant_id || user.id, 10);

    const vhcRecord = await db.collection('VHC').findOne({
      VHC: { $regex: new RegExp(`^${VHC}$`, 'i') },
    });

    if (!vhcRecord) {
      return res.status(200).json(codeErrorPayload('vhc', CODE_ERROR.WRONG_CODE));
    }

    if (vhcRecord.code_state === 'Deactivated') {
      return res.status(200).json(codeErrorPayload('vhc', CODE_ERROR.DEACTIVATED));
    }

    const codeSettings = vhcRecord.code_settings || 'number_of_views';
    const codeLesson = vhcRecord.code_lesson || 'All';
    const codeIdStr = vhcRecord._id.toString();
    const sessionIdStr = String(session_id);

    // One account only (all code settings, including deadline_date)
    if (vhcRecord.viewed_by_who != null && Number(vhcRecord.viewed_by_who) !== studentId) {
      return res.status(200).json(
        codeErrorPayload('vhc', CODE_ERROR.USED_BY_ANOTHER, { code_settings: codeSettings })
      );
    }

    const student = await db.collection('students').findOne({ id: studentId });
    if (!student) {
      return res.status(404).json(codeErrorPayload('vhc', CODE_ERROR.NOT_FOUND));
    }

    const homeworksVideos = student.homeworks_videos || [];

    let boundSessionId =
      vhcRecord.opened_session_id != null ? String(vhcRecord.opened_session_id) : null;
    if (!boundSessionId) {
      const priorWithCode = homeworksVideos.find((s) => s && sameId(s.vhc_id, codeIdStr));
      if (priorWithCode?.video_id) {
        boundSessionId = String(priorWithCode.video_id);
      }
    }

    if (vhcRecord.viewed_by_who == null) {
      const usedByOther = await db.collection('students').findOne(
        {
          id: { $ne: studentId },
          'homeworks_videos.vhc_id': codeIdStr,
        },
        { projection: { id: 1 } }
      );
      if (usedByOther) {
        return res.status(200).json(
          codeErrorPayload('vhc', CODE_ERROR.USED_BY_ANOTHER, { code_settings: codeSettings })
        );
      }
    }

    if (boundSessionId && boundSessionId !== sessionIdStr) {
      return res.status(200).json(
        codeErrorPayload('vhc', CODE_ERROR.USED_ON_ANOTHER_SESSION, {
          code_settings: codeSettings,
        })
      );
    }

    const isFirstOpenForCode = !boundSessionId;

    // Lesson restriction only on first open. After bind, keep the already-opened video
    // even if admin later changes code_lesson (All → specific, or X → Y).
    if (isFirstOpenForCode && codeLesson !== 'All') {
      let sessionLesson = lesson || '';
      try {
        const hwSession = await db.collection('homeworks_videos').findOne({
          _id: new ObjectId(session_id),
        });
        if (hwSession?.lesson) sessionLesson = hwSession.lesson;
      } catch {
        // keep body lesson
      }
      if (
        !sessionLesson ||
        normalizeLessonName(codeLesson) !== normalizeLessonName(sessionLesson)
      ) {
        return res.status(200).json(
          codeErrorPayload('vhc', CODE_ERROR.WRONG_LESSON, { code_settings: codeSettings })
        );
      }
    }

    if (codeSettings === 'deadline_date') {
      if (vhcRecord.deadline_date) {
        if (isDeadlinePassedEgypt(vhcRecord.deadline_date, null)) {
          return res.status(200).json(
            codeErrorPayload('vhc', CODE_ERROR.DEADLINE_EXPIRED, {
              code_settings: 'deadline_date',
              deadline_date: vhcRecord.deadline_date,
            })
          );
        }
      }
    } else if (codeSettings === 'number_of_days') {
      if (!isCodeNumberOfDaysValid(vhcRecord.access_started_at, vhcRecord.number_of_days)) {
        return res.status(200).json(
          codeErrorPayload('vhc', CODE_ERROR.DAYS_EXPIRED, {
            code_settings: 'number_of_days',
          })
        );
      }
    } else if (vhcRecord.number_of_views === null || vhcRecord.number_of_views <= 0) {
      return res.status(200).json(
        codeErrorPayload('vhc', CODE_ERROR.NO_VIEWS_REMAINING, {
          code_settings: 'number_of_views',
        })
      );
    }

    const session = await db.collection('homeworks_videos').findOne({
      _id: new ObjectId(session_id),
    });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Homework video session not found',
        valid: false,
      });
    }

    const updateData = {
      viewed: true,
      viewed_by_who: studentId,
    };
    if (!vhcRecord.opened_session_id) {
      updateData.opened_session_id = sessionIdStr;
    }
    if (codeSettings === 'number_of_days' && !vhcRecord.access_started_at) {
      updateData.access_started_at = new Date().toISOString();
    }

    const updateResult = await db.collection('VHC').updateOne(
      {
        _id: vhcRecord._id,
        $and: [
          {
            $or: [
              { viewed_by_who: null },
              { viewed_by_who: { $exists: false } },
              { viewed_by_who: studentId },
            ],
          },
          {
            $or: [
              { opened_session_id: null },
              { opened_session_id: { $exists: false } },
              { opened_session_id: sessionIdStr },
            ],
          },
        ],
      },
      { $set: updateData }
    );

    if (updateResult.matchedCount === 0) {
      const latest = await db.collection('VHC').findOne({ _id: vhcRecord._id });
      if (latest?.viewed_by_who != null && Number(latest.viewed_by_who) !== studentId) {
        return res.status(200).json(
          codeErrorPayload('vhc', CODE_ERROR.USED_BY_ANOTHER, { code_settings: codeSettings })
        );
      }
      if (latest?.opened_session_id && String(latest.opened_session_id) !== sessionIdStr) {
        return res.status(200).json(
          codeErrorPayload('vhc', CODE_ERROR.USED_ON_ANOTHER_SESSION, {
            code_settings: codeSettings,
          })
        );
      }
      return res.status(500).json(codeErrorPayload('vhc', CODE_ERROR.INTERNAL_ERROR));
    }

    const week = session.week;
    if (week !== null && week !== undefined) {
      const weeks = student.weeks || [];
      const weekIndex = weeks.findIndex((w) => w && w.week === week);

      if (weekIndex !== -1) {
        await db.collection('students').updateOne(
          { id: studentId, 'weeks.week': week },
          {
            $set: {
              'weeks.$.view_homework_video': true,
            },
          }
        );
      } else {
        const newWeek = {
          week: week,
          attended: false,
          hwDone: false,
          view_homework_video: true,
          quizDegree: null,
          comment: null,
          message_state: false,
        };
        await db.collection('students').updateOne(
          { id: studentId },
          { $push: { weeks: newWeek } }
        );
      }
    }

    const existingSessionIndex = homeworksVideos.findIndex((s) =>
      sameId(s.video_id, session_id)
    );
    const isNewStudentUnlock = existingSessionIndex === -1;

    const newSessionEntry = {
      video_id: sessionIdStr,
      vhc_id: codeIdStr,
      date: formatDate(new Date()),
      ...(codeSettings === 'number_of_views'
        ? {
            views_per_video_limit: Number(vhcRecord.number_of_views) || 0,
            part_views: {},
          }
        : {}),
    };

    if (existingSessionIndex !== -1) {
      const previous = homeworksVideos[existingSessionIndex] || {};
      homeworksVideos[existingSessionIndex] = {
        ...newSessionEntry,
        ...(codeSettings === 'number_of_views' && sameId(previous.vhc_id, codeIdStr)
          ? {
              views_per_video_limit:
                previous.views_per_video_limit ?? newSessionEntry.views_per_video_limit,
              part_views: previous.part_views || {},
            }
          : {}),
      };
      await db.collection('students').updateOne(
        { id: studentId },
        { $set: { homeworks_videos: homeworksVideos } }
      );
    } else {
      await db.collection('students').updateOne(
        { id: studentId },
        { $push: { homeworks_videos: newSessionEntry } }
      );
    }

    if (PAYMENT_SYSTEM_ENABLED && isNewStudentUnlock && session.payment_state === 'paid') {
      try {
        const currentSessions = student.payment?.numberOfSessions || 0;
        if (currentSessions > 0) {
          await recordPaymentSessionChange(db, studentId, {
            delta: -1,
            type: 'vhc_unlock',
            reason: `VHC unlock for homework video (${session.lesson || 'lesson'})`,
            lesson: session.lesson || lesson || null,
            by: 'student',
          });
        }
      } catch (sessionErr) {
        console.error('⚠️ Failed to deduct numberOfSessions:', sessionErr);
      }
    }

    const updatedVhc = await db.collection('VHC').findOne({ _id: vhcRecord._id });
    const accessStartedAt = updatedVhc.access_started_at || null;
    const numberOfDays = updatedVhc.number_of_days ?? null;
    const computedDeadline =
      codeSettings === 'number_of_days'
        ? computeAccessDeadlineDate(accessStartedAt, numberOfDays)
        : updatedVhc.deadline_date || null;

    return res.status(200).json({
      success: true,
      valid: true,
      message: 'VHC validated successfully',
      vhc_id: codeIdStr,
      code_settings: codeSettings,
      number_of_views: updatedVhc.number_of_views || null,
      number_of_days: numberOfDays,
      access_started_at: accessStartedAt,
      deadline_date: computedDeadline,
      code_lesson: codeLesson,
      opened_session_id: updatedVhc.opened_session_id || sessionIdStr,
    });
  } catch (error) {
    console.error('❌ Error in VHC check API:', error);
    return res.status(500).json(codeErrorPayload('vhc', CODE_ERROR.INTERNAL_ERROR));
  } finally {
    if (client) {
      await client.close();
    }
  }
}
