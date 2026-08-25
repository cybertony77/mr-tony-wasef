import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../../lib/authMiddleware';
import { getStudentLesson, mergeStudentLesson } from '../../../../lib/studentLessons';
import { reverseItemScoring, parsePercentage } from '../../../../lib/reverseItemScoring';

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

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const student_id = parseInt(id);
  const { quiz_id } = req.body;

  if (!quiz_id) {
    return res.status(400).json({ error: 'quiz_id is required' });
  }

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    
    // Verify authentication
    await authMiddleware(req);

    // Get student data
    const student = await db.collection('students').findOne({ id: student_id });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const onlineQuizzes = student.online_quizzes || [];
    
    // Find the quiz to get the week / lesson context
    const quizToReset = onlineQuizzes.find(
      qz => String(qz.quiz_id ?? '') === String(quiz_id)
    );

    let lessonName =
      (quizToReset && quizToReset.lesson) ||
      null;

    if (!lessonName) {
      try {
        const quizDoc = await db.collection('quizzes').findOne({
          _id: new ObjectId(quiz_id),
        });
        if (quizDoc?.lesson) {
          lessonName = quizDoc.lesson;
        }
      } catch (err) {
        console.error('Error fetching quiz document for reset:', err);
      }
    }

    const previousPercentage = parsePercentage(quizToReset?.percentage);
    await reverseItemScoring(db, {
      studentId: student_id,
      type: 'quiz',
      lesson: lessonName,
      sourceKind: 'online_quiz',
      sourceId: quiz_id,
      sourceLabel: lessonName || quiz_id,
      previousPercentage,
      fallbackPoints: quizToReset?.points_added,
    });
    await reverseItemScoring(db, {
      studentId: student_id,
      type: 'quiz',
      lesson: lessonName,
      sourceKind: 'deadline_quiz',
      sourceId: quiz_id,
      sourceLabel: lessonName || quiz_id,
      previousPercentage: 0,
    });

    const latestStudent = await db.collection('students').findOne({ id: student_id }) || student;
    const onlineQuizzesLatest = latestStudent.online_quizzes || onlineQuizzes;
    
    // Remove the quiz from the array
    const updatedQuizzes = onlineQuizzesLatest.filter(
      qz => String(qz.quiz_id ?? '') !== String(quiz_id)
    );

    // Update weeks array if quiz was found and has a week number
    const weeks = latestStudent.weeks || [];
    let updatedWeeks = weeks;
    
    if (quizToReset && quizToReset.week !== undefined && quizToReset.week !== null) {
      updatedWeeks = weeks.map(weekData => {
        if (weekData.week === quizToReset.week) {
          return {
            ...weekData,
            quizDegree: null
          };
        }
        return weekData;
      });
    }

    const updateFields = {
      online_quizzes: updatedQuizzes,
      weeks: updatedWeeks,
    };

    if (lessonName && getStudentLesson(latestStudent.lessons, lessonName)) {
      updateFields.lessons = mergeStudentLesson(latestStudent.lessons, lessonName, {
        quizDegree: null,
      });
    }

    // Update student document
    const updateResult = await db.collection('students').updateOne(
      { id: student_id },
      { $set: updateFields }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({ success: true, message: 'Quiz reset successfully' });
  } catch (error) {
    console.error('❌ Error resetting quiz:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
