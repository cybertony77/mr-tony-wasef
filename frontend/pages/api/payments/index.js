import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';

// Load environment variables from env.config
function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    console.log('🔍 Looking for env.config at:', envPath);
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
    
    console.log('✅ Successfully loaded env.config');
    return envVars;
  } catch (error) {
    console.log('⚠️  Could not read env.config:', error.message);
    console.log('⚠️  Using process.env as fallback');
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'topphysics';

console.log('🔧 Final configuration:');
console.log('  MONGO_URI:', MONGO_URI);
console.log('  DB_NAME:', DB_NAME);

export default async function handler(req, res) {
  console.log('🔍 Payment API called with method:', req.method);
  console.log('📦 Request body:', req.body);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { studentId, numberOfSessions, cost, paymentComment } = req.body;
  console.log('📋 Extracted data:', { studentId, numberOfSessions, cost, paymentComment });

  // Validate required fields
  if (!studentId) {
    console.log('❌ Validation failed - missing student ID');
    return res.status(400).json({ error: 'Student ID is required' });
  }

  // Check if this is a clear operation (all values are null)
  const isClearOperation = numberOfSessions === null && cost === null && paymentComment === null;

  if (!isClearOperation) {
    // Validate required fields for normal payment
    if (!numberOfSessions || !cost) {
      console.log('❌ Validation failed - missing required fields');
      return res.status(400).json({ error: 'Number of sessions and cost are required' });
    }

    // Validate data types
    const sessions = parseInt(numberOfSessions);
    const costValue = parseFloat(cost);

    if (isNaN(sessions) || sessions <= 0) {
      return res.status(400).json({ error: 'Number of sessions must be a positive number' });
    }

    if (isNaN(costValue) || costValue <= 0) {
      return res.status(400).json({ error: 'Cost must be a positive number' });
    }
  }

  let client;
  try {
    console.log('🔗 Connecting to MongoDB:', MONGO_URI);
    console.log('📊 Database name:', DB_NAME);
    
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    console.log('✅ Connected to database successfully');
    
    // Verify authentication
    let user;
    try {
      user = await authMiddleware(req);
      console.log('✅ Authentication successful for user:', user.assistant_id);
    } catch (authError) {
      console.log('❌ Authentication failed:', authError.message);
      return res.status(401).json({ 
        success: false,
        error: 'Authentication failed. Please log in again.',
        message: 'Unauthorized access'
      });
    }
    
    // Check if student exists
    console.log('🔍 Looking for student with ID:', parseInt(studentId));
    const student = await db.collection('students').findOne({ id: parseInt(studentId) });
    if (!student) {
      console.log('❌ Student not found with ID:', parseInt(studentId));
      return res.status(404).json({ error: 'Student not found' });
    }
    console.log('✅ Student found:', student.name);

    // Create payment record
    let paymentData;
    
    if (isClearOperation) {
      // Clear operation - set all values to null
      paymentData = {
        numberOfSessions: null,
        cost: null,
        paymentComment: null,
        date: null
      };
      console.log('🗑️ Clearing payment data for student:', student.name);
    } else {
      // Normal payment operation
      const now = new Date();
      // Use Egypt/Cairo timezone for date formatting
      const formattedDate = now.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Africa/Cairo'
      });

      const sessions = parseInt(numberOfSessions);
      const costValue = parseFloat(cost);

      paymentData = {
        numberOfSessions: sessions,
        cost: costValue,
        paymentComment: paymentComment && paymentComment.trim() ? paymentComment.trim() : null,
        date: formattedDate
      };
      console.log('💾 Saving payment data for student:', student.name);
    }

    // Update student with payment object (overwrites any existing payment)
    console.log('💾 Updating payment for student:', student.name);
    const result = await db.collection('students').updateOne(
      { id: parseInt(studentId) },
      { $set: { payment: paymentData } }
    );
    
    console.log('✅ Payment operation completed successfully');
    console.log('📊 Update result:', result);
    
    const responseMessage = isClearOperation ? 'Payment data cleared successfully' : 'Payment saved successfully';
    
    res.status(201).json({ 
      success: true, 
      message: responseMessage,
      data: {
        studentName: student.name,
        numberOfSessions: paymentData.numberOfSessions,
        cost: paymentData.cost,
        paymentComment: paymentData.paymentComment,
        date: paymentData.date,
        operation: isClearOperation ? 'clear' : 'save'
      }
    });

  } catch (error) {
    console.error('❌ Error saving payment:', error);
    
    if (error.message.includes('Unauthorized') || error.message.includes('Invalid token')) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication failed. Please log in again.',
        message: 'Unauthorized access'
      });
    } else if (error.message.includes('Student not found')) {
      res.status(404).json({ 
        success: false,
        error: 'Student not found in database',
        message: 'Please verify the student ID and try again'
      });
    } else if (error.message.includes('validation') || error.message.includes('required')) {
      res.status(400).json({ 
        success: false,
        error: error.message,
        message: 'Please check your input and try again'
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Internal server error occurred',
        message: 'Please try again later or contact support'
      });
    }
  } finally {
    if (client) await client.close();
  }
}
