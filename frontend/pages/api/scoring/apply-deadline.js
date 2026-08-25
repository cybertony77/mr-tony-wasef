import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';
import { processDeadlineHomework, processDeadlineQuiz } from '../../../lib/deadlineScoring';
import { ensureHistoryIndexes } from './calculate';

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
  } catch {
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI;
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant', 'student'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { studentId, kind, itemId, lesson } = req.body;
    const numericStudentId = parseInt(studentId);

    if (user.role === 'student') {
      const tokenStudentId = parseInt(user.assistant_id || user.id);
      if (tokenStudentId !== numericStudentId) {
        return res.status(403).json({ error: 'Forbidden: Students can only update their own score' });
      }
    }

    if (!numericStudentId || !kind || !itemId || !lesson) {
      return res.status(400).json({ error: 'studentId, kind, itemId, and lesson are required' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    await ensureHistoryIndexes(db);

    let result;
    if (kind === 'homework') {
      result = await processDeadlineHomework({
        db,
        studentId: numericStudentId,
        homeworkId: itemId,
        lesson,
      });
    } else if (kind === 'quiz') {
      result = await processDeadlineQuiz({
        db,
        studentId: numericStudentId,
        quizId: itemId,
        lesson,
      });
    } else {
      return res.status(400).json({ error: 'kind must be homework or quiz' });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[DEADLINE SCORING] Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    if (client) await client.close();
  }
}
