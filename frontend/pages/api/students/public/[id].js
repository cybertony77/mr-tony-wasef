import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { verifySignature } from '../../../../lib/hmacServer';
import { getHomeworkVideoLessonsForStudent } from '../../../../lib/homeworkVideoLessons';
import { toPublicStudentPayload } from '../../../../lib/publicStudentPayload';

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
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
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
const NATIONAL_SYSTEM =
  envConfig.NATIONAL_SYSTEM === 'true' || process.env.NATIONAL_SYSTEM === 'true';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id, sig } = req.query;

  if (!verifySignature(id, sig)) {
    return res.status(401).json({ message: 'Invalid signature' });
  }

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    const studentsCollection = db.collection('students');

    let student;
    if (/^\d+$/.test(String(id))) {
      student = await studentsCollection.findOne({ id: parseInt(id, 10) });
    }
    if (!student) {
      try {
        const { ObjectId } = require('mongodb');
        student = await studentsCollection.findOne({ _id: new ObjectId(id) });
      } catch {
        /* ignore */
      }
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const homeworkVideoSessions = await db
      .collection('homeworks_videos')
      .find({})
      .project({ lesson: 1, course: 1, courseType: 1, state: 1, account_state: 1 })
      .toArray();
    const homeworkVideoLessons = getHomeworkVideoLessonsForStudent(
      homeworkVideoSessions,
      student,
      NATIONAL_SYSTEM
    );

    return res.status(200).json(
      toPublicStudentPayload(student, { homework_video_lessons: homeworkVideoLessons })
    );
  } catch (error) {
    console.error('Public student API error:', error?.message || error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
