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

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
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
const PAYMENT_SYSTEM_ENABLED = envConfig.SYSTEM_PAYMENT_SYSTEM === 'true' || process.env.SYSTEM_PAYMENT_SYSTEM === 'true';

function normalizeLessonName(value) {
  return String(value || '')
    .trim()
    .replace(/^\d+\s*[\.\-:)]\s*/, '')
    .toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    // Verify authentication - allow students
    const user = await authMiddleware(req);
    if (!['student', 'admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { VVC, session_id, lesson } = req.body;

    if (!VVC || VVC.length !== 9) {
      return res.status(400).json(codeErrorPayload('vvc', CODE_ERROR.INVALID_LENGTH));
    }

    if (!session_id) {
      return res.status(400).json(codeErrorPayload('vvc', CODE_ERROR.SESSION_ID_REQUIRED));
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    // Get student ID (for students, it's in assistant_id) - ensure it's a number
    const studentId = parseInt(user.assistant_id || user.id);

    // Find the VVC record (case-insensitive comparison)
    const vvcRecord = await db.collection('VVC').findOne({ 
      VVC: { $regex: new RegExp(`^${VVC}$`, 'i') }
    });

    if (!vvcRecord) {
      return res.status(200).json(codeErrorPayload('vvc', CODE_ERROR.WRONG_CODE));
    }

    // Check if code is deactivated
    if (vvcRecord.code_state === 'Deactivated') {
      return res.status(200).json(codeErrorPayload('vvc', CODE_ERROR.DEACTIVATED));
    }

    // Check lesson restriction
    const codeLesson = vvcRecord.code_lesson || 'All';
    if (codeLesson !== 'All' && lesson) {
      if (normalizeLessonName(codeLesson) !== normalizeLessonName(lesson)) {
        return res.status(200).json(codeErrorPayload('vvc', CODE_ERROR.WRONG_LESSON, {
          code_settings: vvcRecord.code_settings || 'number_of_views',
        }));
      }
    }

    // Check deadline date if code_settings is 'deadline_date'
    const codeSettings = vvcRecord.code_settings || 'number_of_views'; // Default to number_of_views for backward compatibility
    if (codeSettings === 'deadline_date') {
      if (vvcRecord.deadline_date) {
        // Date-only deadline: active through end of that Africa/Cairo day
        if (isDeadlinePassedEgypt(vvcRecord.deadline_date, null)) {
          return res.status(200).json(codeErrorPayload('vvc', CODE_ERROR.DEADLINE_EXPIRED, {
            code_settings: 'deadline_date',
            deadline_date: vvcRecord.deadline_date,
          }));
        }
      }
    } else if (codeSettings === 'number_of_days') {
      if (vvcRecord.viewed_by_who !== null && vvcRecord.viewed_by_who !== studentId) {
        return res.status(200).json(codeErrorPayload('vvc', CODE_ERROR.USED_BY_ANOTHER, {
          code_settings: 'number_of_days',
        }));
      }
      if (!isCodeNumberOfDaysValid(vvcRecord.access_started_at, vvcRecord.number_of_days)) {
        return res.status(200).json(codeErrorPayload('vvc', CODE_ERROR.DAYS_EXPIRED, {
          code_settings: 'number_of_days',
        }));
      }
    } else {
      // Check if code is valid for number_of_views
      // ❌ Block if: number_of_views <= 0  OR  code already belongs to another student
      // ✅ Allow if: number_of_views > 0 AND (viewed_by_who is null OR equals current student)

      // No views remaining
      if (vvcRecord.number_of_views === null || vvcRecord.number_of_views <= 0) {
        return res.status(200).json(codeErrorPayload('vvc', CODE_ERROR.NO_VIEWS_REMAINING, {
          code_settings: 'number_of_views',
        }));
      }

      // Code is already assigned to a different student
      if (vvcRecord.viewed_by_who !== null && vvcRecord.viewed_by_who !== studentId) {
        return res.status(200).json(codeErrorPayload('vvc', CODE_ERROR.USED_BY_ANOTHER, {
          code_settings: 'number_of_views',
        }));
      }
    }

    // Format date as DD/MM/YYYY at hour:minute AM/PM
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

    // VVC is valid - update it and save to student's online_sessions
    // For deadline_date: don't set viewed/viewed_by_who, allow unlimited views
    // For number_of_views: set viewed/viewed_by_who, but don't decrement views here (decrement when video opens)
    // For number_of_days: set viewed_by_who + access_started_at on first use
    const updateData = {};
    if (codeSettings === 'number_of_views') {
      updateData.viewed = true;
      updateData.viewed_by_who = studentId;
    } else if (codeSettings === 'number_of_days') {
      updateData.viewed = true;
      updateData.viewed_by_who = studentId;
      if (!vvcRecord.access_started_at) {
        updateData.access_started_at = new Date().toISOString();
      }
    }
    // For deadline_date, we don't set viewed/viewed_by_who to allow unlimited views until deadline
    
    let updateResult = { matchedCount: 1, modifiedCount: 0 };
    if (Object.keys(updateData).length > 0) {
      updateResult = await db.collection('VVC').updateOne(
        { _id: vvcRecord._id },
        { $set: updateData }
      );
    }

    if (updateResult.matchedCount === 0) {
      return res.status(500).json(codeErrorPayload('vvc', CODE_ERROR.INTERNAL_ERROR));
    }

    // Get student
    const student = await db.collection('students').findOne({ id: studentId });
    if (!student) {
      return res.status(404).json(codeErrorPayload('vvc', CODE_ERROR.NOT_FOUND));
    }

    // Ensure online_sessions array exists
    const onlineSessions = student.online_sessions || [];
    
    // Check if this session is already in online_sessions
    const existingSessionIndex = onlineSessions.findIndex(s => s.video_id === session_id);
    
    const newSessionEntry = {
      video_id: session_id,
      vvc_id: vvcRecord._id.toString(),
      date: formatDate(new Date())
    };
    
    if (existingSessionIndex !== -1) {
      // Override existing entry with new VVC
      onlineSessions[existingSessionIndex] = newSessionEntry;
      await db.collection('students').updateOne(
        { id: studentId },
        { $set: { online_sessions: onlineSessions } }
      );
    } else {
      // Add new entry to online_sessions
      await db.collection('students').updateOne(
        { id: studentId },
        { $push: { online_sessions: newSessionEntry } }
      );
    }

    // Deduct 1 from student.payment.numberOfSessions if payment system is enabled, video is paid and sessions > 0
    if (PAYMENT_SYSTEM_ENABLED) {
      try {
        const onlineSession = await db.collection('online_sessions').findOne({ _id: new ObjectId(session_id) });
        if (onlineSession && onlineSession.payment_state === 'paid') {
          const currentSessions = student.payment?.numberOfSessions || 0;
          if (currentSessions > 0) {
            await db.collection('students').updateOne(
              { id: studentId },
              { $inc: { 'payment.numberOfSessions': -1 } }
            );
          }
        }
      } catch (sessionErr) {
        console.error('⚠️ Failed to deduct numberOfSessions:', sessionErr);
        // Don't fail the VVC check if session deduction fails
      }
    }

    // Get current VVC to return relevant data
    const updatedVvc = await db.collection('VVC').findOne({ _id: vvcRecord._id });
    const accessStartedAt = updatedVvc.access_started_at || null;
    const numberOfDays = updatedVvc.number_of_days ?? null;
    const computedDeadline =
      codeSettings === 'number_of_days'
        ? computeAccessDeadlineDate(accessStartedAt, numberOfDays)
        : (updatedVvc.deadline_date || null);

    return res.status(200).json({ 
      success: true,
      valid: true,
      message: 'VVC validated successfully',
      vvc_id: vvcRecord._id.toString(),
      code_settings: codeSettings,
      code_lesson: codeLesson,
      number_of_views: updatedVvc.number_of_views || null,
      number_of_days: numberOfDays,
      access_started_at: accessStartedAt,
      deadline_date: computedDeadline
    });
  } catch (error) {
    console.error('❌ Error in VVC check API:', error);
    return res.status(500).json(codeErrorPayload('vvc', CODE_ERROR.INTERNAL_ERROR));
  } finally {
    if (client) {
      await client.close();
    }
  }
}

