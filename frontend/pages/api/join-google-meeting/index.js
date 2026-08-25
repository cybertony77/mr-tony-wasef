import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';

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
  let client;
  
  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    if (req.method === 'GET') {
      // Get the Google Meeting (only one allowed)
      const meetings = await db.collection('join_google_meeting').find({}).toArray();
      
      return res.status(200).json({
        success: true,
        meetings: meetings.map(meeting => ({
          ...meeting,
          _id: meeting._id.toString()
        }))
      });
    } else if (req.method === 'POST') {
      // Create new Google Meeting - only allow one
      const existing = await db.collection('join_google_meeting').countDocuments();
      if (existing > 0) {
        return res.status(400).json({ error: 'Only one Google Meeting is allowed. Please edit or delete the existing one.' });
      }

      const { course, courseType, lesson, link, deadline, dateOfStart, dateOfEnd, meeting_state, account_state } = req.body;

      if (!course || !lesson || !link) {
        return res.status(400).json({ error: 'Course, Lesson and Google Meet Link are required' });
      }

      if (!String(link).trim().toLowerCase().startsWith('https://meet.google.com/')) {
        return res.status(400).json({ error: 'Google Meet link must start with "https://meet.google.com/"' });
      }

      const rawState = meeting_state ?? account_state;
      const meetingState = rawState === 'Deactivated' ? 'Deactivated' : 'Activated';

      const newMeeting = {
        course: course.trim(),
        courseType: courseType ? courseType.trim() : null,
        lesson: lesson.trim(),
        link: link.trim(),
        deadline: deadline || null,
        dateOfStart: dateOfStart || null,
        dateOfEnd: dateOfEnd || null,
        meeting_state: meetingState,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('join_google_meeting').insertOne(newMeeting);
      
      return res.status(200).json({
        success: true,
        meeting: {
          ...newMeeting,
          _id: result.insertedId.toString()
        }
      });
    } else if (req.method === 'PUT') {
      // Update Google Meeting
      const { id, course, courseType, lesson, link, deadline, dateOfStart, dateOfEnd, meeting_state, account_state } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Meeting ID is required' });
      }

      if (!course || !lesson || !link) {
        return res.status(400).json({ error: 'Course, Lesson and Google Meet Link are required' });
      }

      if (!String(link).trim().toLowerCase().startsWith('https://meet.google.com/')) {
        return res.status(400).json({ error: 'Google Meet link must start with "https://meet.google.com/"' });
      }

      let query;
      try {
        query = { _id: new ObjectId(id) };
      } catch (e) {
        query = { _id: id };
      }

      const rawState = meeting_state ?? account_state;
      const meetingState = rawState === 'Deactivated' ? 'Deactivated' : 'Activated';

      const updateData = {
        course: course.trim(),
        courseType: courseType ? courseType.trim() : null,
        lesson: lesson.trim(),
        link: link.trim(),
        deadline: deadline || null,
        dateOfStart: dateOfStart || null,
        dateOfEnd: dateOfEnd || null,
        meeting_state: meetingState,
        updatedAt: new Date()
      };

      const result = await db.collection('join_google_meeting').updateOne(
        query,
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      return res.status(200).json({
        success: true,
        meeting: {
          ...updateData,
          _id: id
        }
      });
    } else if (req.method === 'DELETE') {
      // Delete Google Meeting
      const { id } = req.body || req.query;

      if (!id) {
        return res.status(400).json({ error: 'Meeting ID is required' });
      }

      let query;
      try {
        query = { _id: new ObjectId(id) };
      } catch (e) {
        query = { _id: id };
      }

      const result = await db.collection('join_google_meeting').deleteOne(query);

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'Meeting deleted successfully'
      });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in join-google-meeting API:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  } finally {
    if (client) await client.close();
  }
}
