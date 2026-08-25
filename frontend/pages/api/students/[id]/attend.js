import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../../lib/authMiddleware';
import {
  createDefaultStudentLesson,
  getStudentLesson,
  mergeStudentLesson,
} from '../../../../lib/studentLessons';

// Load environment variables from env.config
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
          value = value.replace(/^"|"$/g, ''); // strip quotes
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
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'topphysics';

function isPaymentSystemEnabled() {
  // Re-read env each request so toggling SYSTEM_PAYMENT_SYSTEM applies without restart
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

console.log('🔗 Using Mongo URI:', MONGO_URI);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { id } = req.query;
  const student_id = parseInt(id);
  const { attended, lastAttendance, lastAttendanceCenter, attendanceLesson } = req.body;
  
  if (attendanceLesson === undefined || attendanceLesson === null) {
    console.log('❌ attendanceLesson missing in request body for student', student_id);
    return res.status(400).json({ error: 'attendanceLesson is required' });
  }
  
  console.log('🎯 Toggling attendance for student:', student_id);
  console.log('📅 Attendance data:', { attended, lastAttendance, lastAttendanceCenter, attendanceLesson });
  
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    
    // Verify authentication
    const user = await authMiddleware(req);
    console.log('✅ Authentication successful for user:', user.assistant_id);
    
    // Get the student data first
    const student = await db.collection('students').findOne({ id: student_id });
    if (!student) {
      console.log('❌ Student not found:', student_id);
      return res.status(404).json({ error: 'Student not found' });
    }
    console.log('✅ Found student:', student.name);
    
    // Check if student account is deactivated
    if (student.account_state === 'Deactivated') {
      console.log('❌ Student account is deactivated:', student_id);
      return res.status(403).json({ error: 'Student account is deactivated' });
    }
    
    // Load lessons from database
    const lessonsFromDB = await db.collection('lessons').find({}).sort({ id: 1 }).toArray();
    const lessonNames = lessonsFromDB.map(l => l.name);
    
    // Determine which lesson to update
    const lessonName = attendanceLesson || (lessonNames.length > 0 ? lessonNames[0] : 'Lesson 1');
    
    // Ensure the target lesson exists; if not, create it with default schema.
    // IMPORTANT: never use dotted paths like `lessons.${name}` — dots in lesson
    // names (e.g. "1. tester") would nest incorrectly in MongoDB.
    const ensureLessonExists = async () => {
      console.log(`🔍 Current student lessons structure:`, typeof student.lessons, student.lessons);
      
      // Handle case where lessons might be an array (old format) or undefined
      if (!student.lessons || Array.isArray(student.lessons)) {
        console.log(`🔄 Converting lessons from array to object format for student ${student_id}`);
        student.lessons = {};
        await db.collection('students').updateOne(
          { id: student_id },
          { $set: { lessons: {} } }
        );
      }
      
      if (!getStudentLesson(student.lessons, lessonName)) {
        console.log(`🧩 Creating missing lesson "${lessonName}" for student ${student_id}`);
        const nextLessons = mergeStudentLesson(
          student.lessons,
          lessonName,
          createDefaultStudentLesson(lessonName)
        );
        await db.collection('students').updateOne(
          { id: student_id },
          { $set: { lessons: nextLessons } }
        );
        student.lessons = nextLessons;
      }
    };

    await ensureLessonExists();

    const PAYMENT_SYSTEM_ENABLED = isPaymentSystemEnabled();
    const payment = normalizePayment(student.payment);
    // Keep payment as a proper object in DB (never an array / missing)
    if (!student.payment || typeof student.payment !== 'object' || Array.isArray(student.payment)) {
      await db.collection('students').updateOne(
        { id: student_id },
        { $set: { payment } }
      );
      student.payment = payment;
    } else {
      student.payment = { ...student.payment, numberOfSessions: payment.numberOfSessions };
    }

    if (attended) {
      // Check if student has available sessions or if this lesson is already paid (only if payment system is enabled)
      const currentSessions = payment.numberOfSessions;
      const existingLesson = getStudentLesson(student.lessons, lessonName);
      const isLessonPaid = existingLesson && existingLesson.paid === true;
      
      if (PAYMENT_SYSTEM_ENABLED && currentSessions <= 0 && !isLessonPaid) {
        console.log('❌ Student has no available sessions and lesson is not paid:', student_id);
        return res.status(400).json({ error: 'No available sessions' });
      }
      
      // Compute attendance date in DD/MM/YYYY format using Egypt timezone
      const now = new Date();
      const egyptParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).formatToParts(now);
      const getPart = (type) => egyptParts.find((p) => p.type === type)?.value || '';
      const attendanceDateOnly = `${getPart('day')}/${getPart('month')}/${getPart('year')}`;

      const lessonPatch = {
        attended: true,
        lastAttendance: lastAttendance || null,
        lastAttendanceCenter: lastAttendanceCenter || null,
        attendanceDate: attendanceDateOnly,
      };

      let sessionDelta = 0;
      if (PAYMENT_SYSTEM_ENABLED) {
        lessonPatch.paid = true;
        if (!isLessonPaid && currentSessions > 0) {
          sessionDelta = -1;
        }
      }

      const nextLessons = mergeStudentLesson(student.lessons, lessonName, lessonPatch);
      
      console.log('🔧 Updating lessons map for lesson:', lessonName, 'sessionDelta:', sessionDelta);
      const updateDoc = sessionDelta !== 0
        ? { $set: { lessons: nextLessons }, $inc: { 'payment.numberOfSessions': sessionDelta } }
        : { $set: { lessons: nextLessons } };

      const result = await db.collection('students').updateOne(
        { id: student_id },
        updateDoc
      );
      
      console.log('🔧 Database update result:', result);
      
      if (result.matchedCount === 0) {
        console.log('❌ Failed to update student:', student_id);
        return res.status(404).json({ error: 'Student not found' });
      }

      const nextSessions = currentSessions + sessionDelta;
      console.log('✅ Student marked as attended for lesson', lessonName, 'sessions:', nextSessions);
      
      // Create simplified history record (only studentId and lesson)
      const historyRecord = {
        studentId: student.id,
        lesson: lessonName
      };
      
      console.log('📝 Creating simplified history record:', historyRecord);
      const historyResult = await db.collection('history').insertOne(historyRecord);
      console.log('✅ History record created with ID:', historyResult.insertedId);

      return res.json({
        success: true,
        payment: { ...payment, numberOfSessions: nextSessions },
        sessionDelta,
      });
      
    } else {
      // Mark as not attended (unattend)
      // Also reset hw and quiz since student didn't attend
      const currentSessions = payment.numberOfSessions;
      const existingLesson = getStudentLesson(student.lessons, lessonName);
      const wasLessonPaid = existingLesson && existingLesson.paid === true;
      
      const nextLessons = mergeStudentLesson(student.lessons, lessonName, {
        attended: false,
        lastAttendance: null,
        lastAttendanceCenter: null,
        attendanceDate: null,
        hwDone: false,
        quizDegree: null,
        comment: null,
        message_state: false,
        homework_degree: null,
        paid: false,
      });

      let sessionDelta = 0;
      // Restore one session if payment is on and this lesson had consumed a session
      if (PAYMENT_SYSTEM_ENABLED && wasLessonPaid) {
        sessionDelta = 1;
      }

      const updateDoc = sessionDelta !== 0
        ? { $set: { lessons: nextLessons }, $inc: { 'payment.numberOfSessions': sessionDelta } }
        : { $set: { lessons: nextLessons } };
      
      const result = await db.collection('students').updateOne(
        { id: student_id },
        updateDoc
      );
      
      if (result.matchedCount === 0) {
        console.log('❌ Failed to update student:', student_id);
        return res.status(404).json({ error: 'Student not found' });
      }

      const nextSessions = currentSessions + sessionDelta;
      console.log('✅ Student marked as not attended for lesson', lessonName, 'sessions:', nextSessions);
      
      // Remove simplified history record for this student and lesson
      const historyDeleteResult = await db.collection('history').deleteMany({
        studentId: student_id,
        lesson: lessonName
      });
      console.log('🗑️ Removed', historyDeleteResult.deletedCount, 'history records');

      return res.json({
        success: true,
        payment: { ...payment, numberOfSessions: nextSessions },
        sessionDelta,
      });
    }
  } catch (error) {
    console.error('❌ Error in attend endpoint:', error);
    if (error.message.includes('Unauthorized') || error.message.includes('Invalid token')) {
      res.status(401).json({ error: error.message });
    } else {
      console.error('Error toggling attendance:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    if (client) await client.close();
  }
}
