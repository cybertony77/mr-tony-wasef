import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../../lib/authMiddleware';

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

/** Format as MM/DD/YYYY at HH:MM:SS AM/PM in Egypt (Africa/Cairo) time */
function formatDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const month = get('month');
  const day = get('day');
  const year = get('year');
  const hours = get('hour');
  const minutes = get('minute');
  const seconds = get('second');
  const ampm = (get('dayPeriod') || '').toUpperCase();

  return `${month}/${day}/${year} at ${hours}:${minutes}:${seconds} ${ampm}`;
}

/** Format like "02/13/2026, 7:26 AM" in Egypt time (mockExams.date) */
function formatEgyptDateTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const month = get('month');
  const day = get('day');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const period = (get('dayPeriod') || '').toUpperCase();

  return `${month}/${day}/${year}, ${hour}:${minute} ${period}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const student_id = parseInt(id);
  const { lesson, percentage, result, student_answers, mock_exam_id, date_of_start, date_of_end, points_added, shuffle_mapping } = req.body;

  if (percentage === undefined || !result || !student_answers || !mock_exam_id) {
    return res.status(400).json({ error: 'Missing required fields: percentage, result, student_answers, mock_exam_id' });
  }

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    
    // Verify authentication - only student can save their own results
    const user = await authMiddleware(req);
    const userId = user.assistant_id || user.id; // JWT contains assistant_id for students
    if (user.role !== 'student' || userId !== student_id) {
      return res.status(403).json({ error: 'Forbidden: You can only save your own results' });
    }

    // Check if student exists
    const student = await db.collection('students').findOne({ id: student_id });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Prepare mock exam result object
    // Ensure percentage is a number (strip % if present)
    const percentageNum = typeof percentage === 'string' ? percentage.replace('%', '') : percentage;
    const mockExamResult = {
      mock_exam_id: mock_exam_id,
      lesson: lesson !== null && lesson !== undefined ? lesson : null,
      percentage: `${percentageNum}%`,
      result: result,
      student_answers: student_answers,
      date_of_start: date_of_start || formatDate(new Date()),
      date_of_end: date_of_end || formatDate(new Date()),
      points_added: points_added !== undefined && points_added !== null ? points_added : null,
      shuffle_mapping: shuffle_mapping || null
    };

    // Ensure online_mock_exams array exists, then push the result
    // MongoDB $push will create the array if it doesn't exist, but we'll ensure it explicitly
    if (!student.online_mock_exams || !Array.isArray(student.online_mock_exams)) {
      await db.collection('students').updateOne(
        { id: student_id },
        { $set: { online_mock_exams: [] } }
      );
    }

    const currentOnlineMockExams = Array.isArray(student.online_mock_exams) ? [...student.online_mock_exams] : [];
    const existingMockExamIndex = currentOnlineMockExams.findIndex(
      (item) => String(item?.mock_exam_id ?? '') === String(mock_exam_id)
    );
    if (existingMockExamIndex >= 0) {
      currentOnlineMockExams[existingMockExamIndex] = {
        ...currentOnlineMockExams[existingMockExamIndex],
        ...mockExamResult,
      };
    } else {
      currentOnlineMockExams.push(mockExamResult);
    }

    // Replace existing result for the same mock exam instead of duplicating it
    const updateResult = await db.collection('students').updateOne(
      { id: student_id },
      { $set: { online_mock_exams: currentOnlineMockExams } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Also save to student's mockExams array using exam index from lesson field
    // lesson field is like "Exam 1", "Exam 2", etc.
    if (lesson) {
      const examMatch = lesson.match(/Exam\s+(\d+)/i);
      if (examMatch) {
        const examIndex = parseInt(examMatch[1], 10) - 1; // "Exam 1" → index 0
        if (examIndex >= 0 && examIndex < 50) {
          // Parse result string "5 / 10" to get correct count and total
          const resultParts = result.split('/').map(s => s.trim());
          const correctCount = parseInt(resultParts[0], 10) || 0;
          const totalQuestions = parseInt(resultParts[1], 10) || 0;
          const percentageNum = typeof percentage === 'string' ? parseInt(percentage.toString().replace('%', ''), 10) : percentage;

          const examData = {
            examDegree: correctCount,
            outOf: totalQuestions,
            percentage: percentageNum,
            date: formatEgyptDateTime(new Date())
          };

          // Initialize mockExams array if it doesn't exist
          if (!student.mockExams || !Array.isArray(student.mockExams)) {
            const defaultMockExams = Array(50).fill(null).map(() => ({
              examDegree: null,
              outOf: null,
              percentage: null,
              date: null
            }));
            await db.collection('students').updateOne(
              { id: student_id },
              { $set: { mockExams: defaultMockExams } }
            );
          }

          // Update the specific exam index
          await db.collection('students').updateOne(
            { id: student_id },
            { $set: { [`mockExams.${examIndex}`]: examData } }
          );
        }
      }
    }

    res.json({ success: true, message: 'Mock exam result saved successfully' });
  } catch (error) {
    console.error('❌ Error saving mock exam result:', error);
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
