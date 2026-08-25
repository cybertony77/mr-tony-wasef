import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';
import {
  isCodeNumberOfDaysValid,
  computeAccessDeadlineDate,
} from '../../../lib/codeNumberOfDays';
import { isDeadlinePassedEgypt } from '../../../lib/deadlineTimeEgypt';

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

// Format date as DD/MM/YYYY at HH:MM AM/PM
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

    const { VHC, session_id, lesson } = req.body;

    if (!VHC || VHC.length !== 9) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Sorry, Wrong VHC, recheck your VHC',
        valid: false 
      });
    }

    if (!session_id) {
      return res.status(400).json({ 
        success: false,
        error: 'Session ID is required',
        valid: false 
      });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    // Get student ID (for students, it's in assistant_id) - ensure it's a number
    const studentId = parseInt(user.assistant_id || user.id);

    // Find the VHC record (case-insensitive comparison)
    const vhcRecord = await db.collection('VHC').findOne({ 
      VHC: { $regex: new RegExp(`^${VHC}$`, 'i') }
    });

    if (!vhcRecord) {
      return res.status(200).json({ 
        success: false,
        error: '❌ Sorry, Wrong VHC, recheck your VHC',
        valid: false 
      });
    }

    // Check if code is deactivated
    if (vhcRecord.code_state === 'Deactivated') {
      return res.status(200).json({ 
        success: false,
        error: '❌ Sorry, This code is deactivated',
        valid: false 
      });
    }

    // Check lesson restriction
    const codeLesson = vhcRecord.code_lesson || 'All';
    if (codeLesson !== 'All' && lesson) {
      if (normalizeLessonName(codeLesson) !== normalizeLessonName(lesson)) {
        return res.status(200).json({
          success: false,
          error: '❌ Sorry, Wrong VHC, recheck your VHC',
          valid: false
        });
      }
    }

    // Check deadline date if code_settings is 'deadline_date'
    const codeSettings = vhcRecord.code_settings || 'number_of_views'; // Default to number_of_views for backward compatibility
    if (codeSettings === 'deadline_date') {
      if (vhcRecord.deadline_date) {
        // Date-only deadline: active through end of that Africa/Cairo day
        if (isDeadlinePassedEgypt(vhcRecord.deadline_date, null)) {
          return res.status(200).json({ 
            success: false,
            error: '❌ Sorry, This code is expired',
            valid: false 
          });
        }
      }
    } else if (codeSettings === 'number_of_days') {
      if (vhcRecord.viewed_by_who !== null && vhcRecord.viewed_by_who !== studentId) {
        return res.status(200).json({
          success: false,
          error: '❌ Sorry, this code is already used by another student',
          valid: false,
        });
      }
      if (!isCodeNumberOfDaysValid(vhcRecord.access_started_at, vhcRecord.number_of_days)) {
        return res.status(200).json({
          success: false,
          error: '❌ Sorry, This code is expired',
          valid: false,
        });
      }
    } else {
      // Check if code is valid for number_of_views
      // ❌ Block if: number_of_views <= 0  OR  code already belongs to another student
      // ✅ Allow if: number_of_views > 0 AND (viewed_by_who is null OR equals current student)

      // No views remaining
      if (vhcRecord.number_of_views === null || vhcRecord.number_of_views <= 0) {
        return res.status(200).json({ 
          success: false,
          error: '❌ Sorry, this code has no views remaining',
          valid: false 
        });
      }

      // Code is already assigned to a different student
      if (vhcRecord.viewed_by_who !== null && vhcRecord.viewed_by_who !== studentId) {
        return res.status(200).json({ 
          success: false,
          error: '❌ Sorry, this code is already used by another student',
          valid: false 
        });
      }
    }

    // Format date as DD/MM/YYYY at hour:minute AM/PM
    function formatDateWithTime(date) {
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

    // VHC is valid - update it
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
      if (!vhcRecord.access_started_at) {
        updateData.access_started_at = new Date().toISOString();
      }
    }
    // For deadline_date, we don't set viewed/viewed_by_who to allow unlimited views until deadline
    
    let updateResult = { matchedCount: 1, modifiedCount: 0 };
    if (Object.keys(updateData).length > 0) {
      updateResult = await db.collection('VHC').updateOne(
        { _id: vhcRecord._id },
        { $set: updateData }
      );
    }

    if (updateResult.matchedCount === 0) {
      return res.status(500).json({ 
        success: false,
        error: 'Failed to update VHC',
        valid: false 
      });
    }

    // Get student
    const student = await db.collection('students').findOne({ id: studentId });
    if (!student) {
      return res.status(404).json({ 
        success: false,
        error: 'Student not found',
        valid: false 
      });
    }

    // Get homework video session to get week
    const session = await db.collection('homeworks_videos').findOne({ _id: new ObjectId(session_id) });
    if (!session) {
      return res.status(404).json({ 
        success: false,
        error: 'Homework video session not found',
        valid: false 
      });
    }

    const week = session.week;
    if (week !== null && week !== undefined) {
      const weeks = student.weeks || [];
      // Find the week entry
      const weekIndex = weeks.findIndex(w => w && w.week === week);

      if (weekIndex !== -1) {
        // Update existing week - set view_homework_video=true
        await db.collection('students').updateOne(
          { id: studentId, 'weeks.week': week },
          {
            $set: {
              'weeks.$.view_homework_video': true
            }
          }
        );
      } else {
        // Week doesn't exist, create it with view_homework_video=true
        const newWeek = {
          week: week,
          attended: false,
          hwDone: false,
          view_homework_video: true,
          quizDegree: null,
          comment: null,
          message_state: false
        };
        await db.collection('students').updateOne(
          { id: studentId },
          { $push: { weeks: newWeek } }
        );
      }
    }

    // Deduct 1 from student.payment.numberOfSessions if payment system is enabled, video is paid and sessions > 0
    if (PAYMENT_SYSTEM_ENABLED && session && session.payment_state === 'paid') {
      try {
        const currentSessions = student.payment?.numberOfSessions || 0;
        if (currentSessions > 0) {
          await db.collection('students').updateOne(
            { id: studentId },
            { $inc: { 'payment.numberOfSessions': -1 } }
          );
        }
      } catch (sessionErr) {
        console.error('⚠️ Failed to deduct numberOfSessions:', sessionErr);
        // Don't fail the VHC check if session deduction fails
      }
    }

    // Save to student's homeworks_videos array (similar to online_sessions for VVC)
    // Ensure homeworks_videos array exists
    const homeworksVideos = student.homeworks_videos || [];
    
    // Check if this session is already in homeworks_videos
    const existingSessionIndex = homeworksVideos.findIndex(s => s.video_id === session_id);
    
    const newSessionEntry = {
      video_id: session_id,
      vhc_id: vhcRecord._id.toString(),
      date: formatDate(new Date())
    };
    
    if (existingSessionIndex !== -1) {
      // Override existing entry with new VHC
      homeworksVideos[existingSessionIndex] = newSessionEntry;
      await db.collection('students').updateOne(
        { id: studentId },
        { $set: { homeworks_videos: homeworksVideos } }
      );
    } else {
      // Add new entry to homeworks_videos
      await db.collection('students').updateOne(
        { id: studentId },
        { $push: { homeworks_videos: newSessionEntry } }
      );
    }

    // Get current VHC to return relevant data
    const updatedVhc = await db.collection('VHC').findOne({ _id: vhcRecord._id });
    const accessStartedAt = updatedVhc.access_started_at || null;
    const numberOfDays = updatedVhc.number_of_days ?? null;
    const computedDeadline =
      codeSettings === 'number_of_days'
        ? computeAccessDeadlineDate(accessStartedAt, numberOfDays)
        : (updatedVhc.deadline_date || null);

    return res.status(200).json({ 
      success: true,
      valid: true,
      message: 'VHC validated successfully',
      vhc_id: vhcRecord._id.toString(),
      code_settings: codeSettings,
      number_of_views: updatedVhc.number_of_views || null,
      number_of_days: numberOfDays,
      access_started_at: accessStartedAt,
      deadline_date: computedDeadline,
      code_lesson: codeLesson
    });
  } catch (error) {
    console.error('❌ Error in VHC check API:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      valid: false,
      details: error.message 
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
