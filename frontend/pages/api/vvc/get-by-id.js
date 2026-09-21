import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';
import {
  isCodeNumberOfDaysValid,
  computeAccessDeadlineDate,
} from '../../../lib/codeNumberOfDays';
import { isDeadlinePassedEgypt } from '../../../lib/deadlineTimeEgypt';
import { CODE_ERROR, codeErrorPayload } from '../../../lib/verificationCodeMessages';

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
  } catch (error) {
    console.log('⚠️  Could not read env.config, using process.env as fallback');
    return {};
  }
}

function normalizeIdString(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    return s || null;
  }
  if (typeof value === 'object') {
    if (value.$oid) return String(value.$oid);
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (typeof value.toString === 'function') {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  const s = String(value);
  return s && s !== '[object Object]' ? s : null;
}

async function findVvcById(db, rawId) {
  const idStr = normalizeIdString(rawId);
  if (!idStr) return null;

  if (ObjectId.isValid(idStr)) {
    try {
      const asOid = new ObjectId(idStr);
      if (String(asOid) === idStr) {
        const byOid = await db.collection('VVC').findOne({ _id: asOid });
        if (byOid) return byOid;
      }
    } catch {
      /* try string _id below */
    }
  }

  return db.collection('VVC').findOne({ _id: idStr });
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
    if (!['student', 'admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { vvc_id } = req.body;

    if (!vvc_id) {
      return res.status(400).json({
        success: false,
        error: 'VVC ID is required',
      });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    const studentId = parseInt(user.assistant_id || user.id, 10);

    const vvcRecord = await findVvcById(db, vvc_id);

    if (!vvcRecord) {
      // 200 so restore can fall back to the mirrored student entry without Axios throw
      return res.status(200).json({
        success: false,
        valid: false,
        error: 'VVC record not found',
        code: CODE_ERROR.NOT_FOUND,
      });
    }

    if (vvcRecord.code_state === 'Deactivated') {
      return res.status(200).json(codeErrorPayload('vvc', CODE_ERROR.DEACTIVATED));
    }

    const codeSettings = vvcRecord.code_settings || 'number_of_views';
    if (codeSettings === 'number_of_views') {
      if (vvcRecord.viewed_by_who !== null && vvcRecord.viewed_by_who !== studentId) {
        return res.status(200).json(
          codeErrorPayload('vvc', CODE_ERROR.USED_BY_ANOTHER, {
            code_settings: 'number_of_views',
          })
        );
      }

      if (vvcRecord.number_of_views === null || vvcRecord.number_of_views <= 0) {
        return res.status(200).json(
          codeErrorPayload('vvc', CODE_ERROR.NO_VIEWS_REMAINING, {
            code_settings: 'number_of_views',
          })
        );
      }
    } else if (codeSettings === 'number_of_days') {
      if (vvcRecord.viewed_by_who !== null && vvcRecord.viewed_by_who !== studentId) {
        return res.status(200).json(
          codeErrorPayload('vvc', CODE_ERROR.USED_BY_ANOTHER, {
            code_settings: 'number_of_days',
          })
        );
      }
      if (!isCodeNumberOfDaysValid(vvcRecord.access_started_at, vvcRecord.number_of_days)) {
        return res.status(200).json(
          codeErrorPayload('vvc', CODE_ERROR.DAYS_EXPIRED, {
            code_settings: 'number_of_days',
          })
        );
      }
    } else if (codeSettings === 'deadline_date' && vvcRecord.deadline_date) {
      if (isDeadlinePassedEgypt(vvcRecord.deadline_date, null)) {
        return res.status(200).json(
          codeErrorPayload('vvc', CODE_ERROR.DEADLINE_EXPIRED, {
            code_settings: 'deadline_date',
            deadline_date: vvcRecord.deadline_date,
          })
        );
      }
    }

    const accessStartedAt = vvcRecord.access_started_at || null;
    const numberOfDays = vvcRecord.number_of_days ?? null;
    const computedDeadline =
      codeSettings === 'number_of_days'
        ? computeAccessDeadlineDate(accessStartedAt, numberOfDays)
        : vvcRecord.deadline_date || null;

    return res.status(200).json({
      success: true,
      valid: true,
      vvc_id: vvcRecord._id.toString(),
      code_settings: codeSettings,
      number_of_views: vvcRecord.number_of_views || null,
      number_of_days: numberOfDays,
      access_started_at: accessStartedAt,
      deadline_date: computedDeadline,
      code_lesson: vvcRecord.code_lesson || 'All',
    });
  } catch (error) {
    console.error('❌ Error in VVC get-by-id API:', error);
    return res.status(500).json(codeErrorPayload('vvc', CODE_ERROR.INTERNAL_ERROR));
  } finally {
    if (client) {
      await client.close();
    }
  }
}
