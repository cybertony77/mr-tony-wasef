import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';

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
const JWT_SECRET = envConfig.JWT_SECRET || process.env.JWT_SECRET || 'topphysics_secret';
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'topphysics';

console.log('🔗 Using Mongo URI:', MONGO_URI);

/** Format like "02/13/2026, 7:26 AM" in Egypt (Africa/Cairo) time */
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
  
  const {
    studentId,
    examIndex,
    mathDegree,
    mathOutOf,
    englishDegree,
    englishOutOf,
    examDegree,
    outOf,
  } = req.body;
  
  // Validate required fields
  if (!studentId || examIndex === undefined) {
    return res.status(400).json({ error: 'Student ID and exam index are required' });
  }
  
  // Validate exam index (0-49)
  if (examIndex < 0 || examIndex > 49) {
    return res.status(400).json({ error: 'Exam index must be between 0 and 49' });
  }
  
  // Legacy clients sent one degree/out-of pair. Treat it as Math while accepting
  // the new separate Math and English sections.
  const effectiveMathDegree = mathDegree ?? examDegree;
  const effectiveMathOutOf = mathOutOf ?? outOf;
  const isEmpty = (value) => value === null || value === undefined || value === '';
  const hasNewSubjectFields = [
    mathDegree,
    mathOutOf,
    englishDegree,
    englishOutOf,
  ].some((value) => value !== undefined);
  const isClearOperation = hasNewSubjectFields
    ? mathDegree === null &&
      mathOutOf === null &&
      englishDegree === null &&
      englishOutOf === null &&
      isEmpty(examDegree) &&
      isEmpty(outOf)
    : examDegree === null && outOf === null;

  const validateSection = (sectionName, degreeValue, outOfValue) => {
    const hasInput = !isEmpty(degreeValue) || !isEmpty(outOfValue);
    if (!hasInput) return { hasInput: false };
    if (isEmpty(degreeValue) || isEmpty(outOfValue)) {
      return { error: `${sectionName} degree and out of are both required` };
    }

    const degree = Number(degreeValue);
    const total = Number(outOfValue);
    if (!Number.isFinite(degree) || degree < 0) {
      return { error: `${sectionName} degree must be a valid non-negative number` };
    }
    if (!Number.isFinite(total) || total <= 0 || degree > total) {
      return { error: `Invalid ${sectionName} degree or out of value` };
    }
    return {
      hasInput: true,
      degree,
      outOf: total,
      percentage: Math.round((degree / total) * 100),
    };
  };

  let mathSection = { hasInput: false };
  let englishSection = { hasInput: false };
  if (!isClearOperation) {
    mathSection = validateSection('Math', effectiveMathDegree, effectiveMathOutOf);
    englishSection = validateSection('English', englishDegree, englishOutOf);
    if (mathSection.error || englishSection.error) {
      return res.status(400).json({ error: mathSection.error || englishSection.error });
    }
    if (!mathSection.hasInput && !englishSection.hasInput) {
      return res.status(400).json({ error: 'Enter Math or English degree and out of values' });
    }
  }
  
  console.log('📝 Saving mock exam for student:', studentId, 'exam:', examIndex + 1);
  console.log('📊 Exam data:', {
    mathDegree: effectiveMathDegree,
    mathOutOf: effectiveMathOutOf,
    englishDegree,
    englishOutOf,
  });
  
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    
    // Verify authentication
    const user = await authMiddleware(req);
    console.log('✅ Authentication successful for user:', user.assistant_id);
    
    // Get the student data first
    const student = await db.collection('students').findOne({ id: parseInt(studentId) });
    if (!student) {
      console.log('❌ Student not found:', studentId);
      return res.status(404).json({ error: 'Student not found' });
    }
    console.log('✅ Found student:', student.name);
    
    // Check if student account is deactivated
    if (student.account_state === 'Deactivated') {
      console.log('❌ Student account is deactivated:', studentId);
      return res.status(403).json({ error: 'Student account is deactivated' });
    }
    
    // Initialize mockExams array if it doesn't exist
    if (!student.mockExams || !Array.isArray(student.mockExams)) {
      // Create array with proper default objects
      const defaultMockExams = Array(50).fill(null).map(() => ({
        mathDegree: null,
        mathOutOf: null,
        mathPercentage: null,
        englishDegree: null,
        englishOutOf: null,
        englishPercentage: null,
        examDegree: null,
        outOf: null,
        percentage: null,
        date: null
      }));
      
      // First, update the database to initialize the mockExams array
      await db.collection('students').updateOne(
        { id: parseInt(studentId) },
        { 
          $set: { 
            mockExams: defaultMockExams
          } 
        }
      );
      // Update local reference
      student.mockExams = defaultMockExams;
    }
    
    // Create exam data based on operation type
    let examData;
    
    if (isClearOperation) {
      // Clear operation - set all values to null
      examData = {
        mathDegree: null,
        mathOutOf: null,
        mathPercentage: null,
        englishDegree: null,
        englishOutOf: null,
        englishPercentage: null,
        examDegree: null,
        outOf: null,
        percentage: null,
        date: null
      };
      console.log('🗑️ Clearing mock exam data for student:', student.name);
    } else {
      // Normal mock exam operation — always Egypt time, not server local/UTC
      const totalDegree =
        (mathSection.degree || 0) + (englishSection.degree || 0);
      const totalOutOf =
        (mathSection.outOf || 0) + (englishSection.outOf || 0);
      examData = {
        mathDegree: mathSection.hasInput ? mathSection.degree : null,
        mathOutOf: mathSection.hasInput ? mathSection.outOf : null,
        mathPercentage: mathSection.hasInput ? mathSection.percentage : null,
        englishDegree: englishSection.hasInput ? englishSection.degree : null,
        englishOutOf: englishSection.hasInput ? englishSection.outOf : null,
        englishPercentage: englishSection.hasInput ? englishSection.percentage : null,
        // Keep aggregate fields for old screens and consumers.
        examDegree: totalDegree,
        outOf: totalOutOf,
        percentage: Math.round((totalDegree / totalOutOf) * 100),
        date: formatEgyptDateTime(new Date())
      };
      console.log('💾 Saving mock exam data for student:', student.name);
    }
    
    // Update the student document
    const result = await db.collection('students').updateOne(
      { id: parseInt(studentId) },
      { 
        $set: { 
          [`mockExams.${examIndex}`]: examData
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      console.log('❌ Failed to update student:', studentId);
      return res.status(404).json({ error: 'Student not found' });
    }
    
    console.log('✅ Mock exam operation completed successfully for student:', studentId, 'exam:', examIndex + 1);
    
    const responseMessage = isClearOperation ? 'Mock exam data cleared successfully' : 'Mock exam saved successfully';
    
    res.json({ 
      success: true, 
      message: responseMessage,
      examData: examData,
      operation: isClearOperation ? 'clear' : 'save'
    });
    
  } catch (error) {
    console.error('❌ Error in mock exam endpoint:', error);
    if (error.message.includes('Unauthorized') || error.message.includes('Invalid token')) {
      res.status(401).json({ error: error.message });
    } else {
      console.error('Error saving mock exam:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    if (client) await client.close();
  }
}
