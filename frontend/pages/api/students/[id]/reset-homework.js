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
  const { homework_id } = req.body;

  if (!homework_id) {
    return res.status(400).json({ error: 'homework_id is required' });
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

    const onlineHomeworks = student.online_homeworks || [];
    
    // Find the homework to get the week / lesson context
    const homeworkToReset = onlineHomeworks.find(
      hw => String(hw.homework_id ?? '') === String(homework_id)
    );
    
    // Reverse the actual awarded score for this homework before deleting the result
    let lessonName =
      (homeworkToReset && homeworkToReset.lesson) ||
      null;

    if (!lessonName) {
      try {
        const homeworkDoc = await db.collection('homeworks').findOne({
          _id: new ObjectId(homework_id),
        });
        if (homeworkDoc?.lesson) {
          lessonName = homeworkDoc.lesson;
        }
      } catch (err) {
        console.error('Error fetching homework document for reset:', err);
      }
    }

    const previousPercentage = parsePercentage(homeworkToReset?.percentage);
    await reverseItemScoring(db, {
      studentId: student_id,
      type: 'homework',
      lesson: lessonName,
      sourceKind: 'online_homework',
      sourceId: homework_id,
      sourceLabel: lessonName || homework_id,
      previousPercentage,
      fallbackPoints: homeworkToReset?.points_added,
    });
    await reverseItemScoring(db, {
      studentId: student_id,
      type: 'homework',
      lesson: lessonName,
      sourceKind: 'deadline_homework',
      sourceId: homework_id,
      sourceLabel: lessonName || homework_id,
      previousHwDone: false,
    });

    // Re-read after scoring update so later $set does not overwrite score
    const latestStudent = await db.collection('students').findOne({ id: student_id }) || student;
    const onlineHomeworksLatest = latestStudent.online_homeworks || onlineHomeworks;
    
    // Remove the homework from the array
    const updatedHomeworks = onlineHomeworksLatest.filter(
      hw => String(hw.homework_id ?? '') !== String(homework_id)
    );

    // Update weeks array if homework was found and has a week number
    const weeks = latestStudent.weeks || [];
    let updatedWeeks = weeks;
    
    if (homeworkToReset && homeworkToReset.week !== undefined && homeworkToReset.week !== null) {
      updatedWeeks = weeks.map(weekData => {
        if (weekData.week === homeworkToReset.week) {
          return {
            ...weekData,
            hwDone: false,
            hwDegree: null
          };
        }
        return weekData;
      });
    }

    const updateFields = {
      online_homeworks: updatedHomeworks,
      weeks: updatedWeeks,
    };

    if (lessonName && getStudentLesson(latestStudent.lessons, lessonName)) {
      updateFields.lessons = mergeStudentLesson(latestStudent.lessons, lessonName, {
        hwDone: false,
        homework_degree: null,
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

    res.json({ success: true, message: 'Homework reset successfully' });
  } catch (error) {
    console.error('❌ Error resetting homework:', error);
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
