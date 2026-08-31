import { MongoClient } from 'mongodb';
import { authMiddleware, isAuthError } from '../../../lib/authMiddleware';
import { getStudentLesson, mergeStudentLesson } from '../../../lib/studentLessons';
import fs from 'fs';
import path from 'path';

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split(/\r?\n/).forEach((line) => {
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

function normalizePayment(payment) {
  const source = Array.isArray(payment) ? payment[0] : payment;
  if (!source || typeof source !== 'object') {
    return { numberOfSessions: 0, cost: null, paymentComment: null, date: null };
  }
  const numberOfSessions = Number(source.numberOfSessions);
  return {
    numberOfSessions: Number.isFinite(numberOfSessions) ? numberOfSessions : 0,
    cost: source.cost ?? null,
    paymentComment: source.paymentComment ?? null,
    date: source.date ?? null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { ids, attendanceLesson } = req.body || {};
    const lessonName = String(attendanceLesson || '').trim();
    if (!lessonName) {
      return res.status(400).json({ error: 'attendanceLesson is required' });
    }

    const requestedIds = Array.isArray(ids)
      ? ids
      : String(ids || '').split(',');
    const studentIds = [...new Set(
      requestedIds
        .map((value) => String(value ?? '').trim())
        .filter((value) => /^\d+$/.test(value))
        .map(Number)
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    )];

    if (studentIds.length === 0) {
      return res.status(400).json({ error: 'At least one valid student ID is required' });
    }
    if (studentIds.length > 20000) {
      return res.status(400).json({ error: 'Too many student IDs in one request' });
    }

    const envConfig = loadEnvConfig();
    const paymentSystemEnabled =
      envConfig.SYSTEM_PAYMENT_SYSTEM === 'true' ||
      process.env.SYSTEM_PAYMENT_SYSTEM === 'true';

    client = await MongoClient.connect(
      envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics'
    );
    const db = client.db(envConfig.DB_NAME || process.env.DB_NAME || 'topphysics');
    const students = await db.collection('students').find({ id: { $in: studentIds } }).toArray();
    const foundIds = new Set(students.map((student) => student.id));
    const notFoundIds = studentIds.filter((id) => !foundIds.has(id));
    const skippedAlreadyAbsent = [];
    const skippedDeactivated = [];
    const updates = [];
    const processedIds = [];

    for (const student of students) {
      if (student.account_state === 'Deactivated') {
        skippedDeactivated.push(student.id);
        continue;
      }

      const existingLesson = getStudentLesson(student.lessons, lessonName);
      if (existingLesson?.attended === false) {
        skippedAlreadyAbsent.push(student.id);
        continue;
      }

      const nextLessons = mergeStudentLesson(
        student.lessons,
        lessonName,
        {
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
        }
      );

      const updateFields = { lessons: nextLessons };
      const rawPayment = student.payment;
      const normalizedPayment = normalizePayment(rawPayment);
      const wasLessonPaid = existingLesson?.paid === true;

      if (!rawPayment || typeof rawPayment !== 'object' || Array.isArray(rawPayment)) {
        updateFields.payment = normalizedPayment;
      }

      if (paymentSystemEnabled && wasLessonPaid) {
        const currentPayment =
          rawPayment && typeof rawPayment === 'object' && !Array.isArray(rawPayment)
            ? { ...rawPayment }
            : { ...normalizedPayment };
        currentPayment.numberOfSessions = normalizedPayment.numberOfSessions + 1;
        updateFields.payment = currentPayment;
      }

      updates.push({
        updateOne: {
          filter: { id: student.id },
          update: { $set: updateFields },
        },
      });
      processedIds.push(student.id);
    }

    if (updates.length > 0) {
      await db.collection('students').bulkWrite(updates, { ordered: false });
      await db.collection('history').deleteMany({
        studentId: { $in: processedIds },
        lesson: lessonName,
      });
    }

    return res.status(200).json({
      success: true,
      lesson: lessonName,
      requestedCount: studentIds.length,
      updatedCount: processedIds.length,
      skippedAlreadyAbsent,
      skippedDeactivated,
      notFoundIds,
    });
  } catch (error) {
    console.error('❌ Error saving bulk absences:', error);
    if (isAuthError(error)) {
      return res.status(error.statusCode || 401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    if (client) await client.close();
  }
}
