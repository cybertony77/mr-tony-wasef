import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import { getStudentLesson, mergeStudentLesson } from '../../../lib/studentLessons';

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
const SCORING_SYSTEM_ENABLED = envConfig.SYSTEM_SCORING_SYSTEM === 'true' || process.env.SYSTEM_SCORING_SYSTEM === 'true';

function isPaymentSystemEnabled() {
  const live = loadEnvConfig();
  return live.SYSTEM_PAYMENT_SYSTEM === 'true' || process.env.SYSTEM_PAYMENT_SYSTEM === 'true';
}

function normalizePayment(payment) {
  const src = Array.isArray(payment) ? payment[0] : payment;
  if (!src || typeof src !== 'object') {
    return { numberOfSessions: 0, cost: null, paymentComment: null, date: null };
  }
  const sessions = Number(src.numberOfSessions);
  return {
    numberOfSessions: Number.isFinite(sessions) ? sessions : 0,
    cost: src.cost ?? null,
    paymentComment: src.paymentComment ?? null,
    date: src.date ?? null,
  };
}

// Format date as DD/MM/YYYY in Egypt/Cairo timezone
function formatDateEgypt(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const studentId = user.assistant_id || user.id;
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const { lesson } = req.body;
    if (!lesson) {
      return res.status(400).json({ error: 'Lesson is required' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    // Get student data
    const student = await db.collection('students').findOne({ id: parseInt(studentId) });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Ensure lessons is an object
    if (!student.lessons || Array.isArray(student.lessons)) {
      await db.collection('students').updateOne(
        { id: parseInt(studentId) },
        { $set: { lessons: {} } }
      );
      student.lessons = {};
    }

    // Check if lesson already exists and is attended
    const lessonData = getStudentLesson(student.lessons, lesson);
    const alreadyAttended = lessonData && lessonData.attended === true;

    if (alreadyAttended) {
      // Already attended - don't deduct sessions, don't apply scoring, just return success
      return res.status(200).json({
        success: true,
        message: 'Already attended this lesson',
        alreadyAttended: true,
        sessionDeducted: false
      });
    }

    // Build attendance data (same schema as scan page / online sessions)
    const now = new Date();
    const attendanceDateOnly = formatDateEgypt(now);
    const attendanceString = `${attendanceDateOnly} in Online`;

    const PAYMENT_SYSTEM_ENABLED = isPaymentSystemEnabled();
    const payment = normalizePayment(student.payment);
    if (!student.payment || typeof student.payment !== 'object' || Array.isArray(student.payment)) {
      await db.collection('students').updateOne(
        { id: parseInt(studentId) },
        { $set: { payment } }
      );
      student.payment = payment;
    }

    const isLessonPaid = lessonData && lessonData.paid === true;
    const currentSessions = payment.numberOfSessions;

    if (PAYMENT_SYSTEM_ENABLED && currentSessions <= 0 && !isLessonPaid) {
      return res.status(400).json({
        error: 'No available sessions',
        message: 'Sorry, this account has used all available sessions. Please pay again to continue.',
      });
    }

    const lessonPatch = {
      attended: true,
      lastAttendance: attendanceString,
      lastAttendanceCenter: 'Online',
      attendanceDate: attendanceDateOnly,
    };

    let sessionDelta = 0;
    if (PAYMENT_SYSTEM_ENABLED) {
      lessonPatch.paid = true;
      if (!isLessonPaid && currentSessions > 0) {
        sessionDelta = -1;
      }
    }

    const nextLessons = mergeStudentLesson(student.lessons, lesson, lessonPatch);
    const updateDoc = sessionDelta !== 0
      ? { $set: { lessons: nextLessons }, $inc: { 'payment.numberOfSessions': sessionDelta } }
      : { $set: { lessons: nextLessons } };

    // Apply the update
    await db.collection('students').updateOne(
      { id: parseInt(studentId) },
      updateDoc
    );

    const sessionDeducted = sessionDelta === -1;

    // Add to history collection (same as scan page / online session attendance)
    try {
      const existingHistory = await db.collection('history').findOne({
        studentId: parseInt(studentId),
        lesson: lesson
      });

      if (!existingHistory) {
        await db.collection('history').insertOne({
          studentId: parseInt(studentId),
          lesson: lesson
        });
      }
    } catch (historyErr) {
      console.error('⚠️ Failed to add zoom attendance to history:', historyErr);
    }

    // === SCORING SYSTEM: Apply attendance scoring (status: 'attend') ===
    if (SCORING_SYSTEM_ENABLED) {
      try {
        // Check if 'attend' scoring was already applied for this student + lesson
        const existingScoringHistory = await db.collection('scoring_system_history').findOne({
          studentId: parseInt(studentId),
          type: 'attendance',
          lesson: lesson,
          'data.status': 'attend'
        });

        if (!existingScoringHistory) {
          // Forward auth headers for internal API calls
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers.host;
          const baseUrl = `${protocol}://${host}`;

          const headers = { 'Content-Type': 'application/json' };
          if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
          }
          if (req.headers.cookie) {
            headers['Cookie'] = req.headers.cookie;
          }

          // Check previous scoring history for this lesson
          let previousStatus = null;
          try {
            const historyRes = await fetch(`${baseUrl}/api/scoring/get-last-history`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                studentId: parseInt(studentId),
                type: 'attendance',
                lesson: lesson
              })
            });
            if (historyRes.ok) {
              const historyData = await historyRes.json();
              if (historyData.found) {
                previousStatus = historyData.history?.data?.status || null;
              }
            }
          } catch (e) {
            console.error('⚠️ Failed to get scoring history:', e);
          }

          // Apply 'attend' attendance scoring
          try {
            const calcRes = await fetch(`${baseUrl}/api/scoring/calculate`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                studentId: parseInt(studentId),
                type: 'attendance',
                lesson: lesson,
                data: {
                  status: 'attend',
                  previousStatus: previousStatus
                }
              })
            });
            if (calcRes.ok) {
              console.log(`[SCORING] Attend score applied for student ${studentId}, lesson "${lesson}" via Zoom`);
            } else {
              const errData = await calcRes.json().catch(() => ({}));
              console.error('⚠️ Scoring calculate failed:', errData);
            }
          } catch (e) {
            console.error('⚠️ Failed to apply scoring:', e);
          }
        } else {
          console.log(`[SCORING] Attend scoring already applied for student ${studentId}, lesson "${lesson}" — skipping`);
        }
      } catch (scoringErr) {
        console.error('⚠️ Failed to process scoring for zoom attendance:', scoringErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Attendance recorded successfully',
      alreadyAttended: false,
      sessionDeducted,
      payment: {
        ...payment,
        numberOfSessions: currentSessions + sessionDelta,
      },
      sessionDelta,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error in zoom meeting attend API:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    if (client) await client.close();
  }
}
