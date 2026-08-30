import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../../lib/authMiddleware';
import { mergeStudentLesson, getStudentLesson } from '../../../../lib/studentLessons';
import {
  FREE_ONLINE_SESSION_PAYMENT_STATES,
  isFreeViewingAccessValid,
  syncFreeViewingEntryWithSession,
  getFreeViewsRemaining,
  attendedInCenter,
} from '../../../../lib/onlineSessionViewing';
import { formatEgyptDateTime, formatEgyptAttendance } from '../../../../lib/egyptDateTime';

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
const SCORING_SYSTEM_ENABLED = envConfig.SYSTEM_SCORING_SYSTEM === 'true' || process.env.SYSTEM_SCORING_SYSTEM === 'true';

// Format date as DD/MM/YYYY (Africa/Cairo)
function formatDate(date) {
  return formatEgyptDateTime(date).split(' at ')[0];
}

// Format date with time as DD/MM/YYYY at HH:MM AM/PM (Africa/Cairo)
function formatDateWithTime(date) {
  return formatEgyptDateTime(date);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    // Verify authentication - allow students
    const user = await authMiddleware(req);
    if (!['student', 'admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { id } = req.query;
    const student_id = parseInt(id);
    // For students, the ID is in assistant_id, for others it's in id
    // Handle both string and number types
    const getUserId = (val) => {
      if (val === null || val === undefined) return null;
      return typeof val === 'number' ? val : parseInt(val);
    };
    
    const userId = user.role === 'student' 
      ? getUserId(user.assistant_id) || getUserId(user.id)
      : getUserId(user.id) || getUserId(user.assistant_id);

    // Students can only update their own data
    if (user.role === 'student' && userId !== student_id) {
      console.error('❌ Student ID mismatch:', { 
        userId, 
        student_id, 
        assistant_id: user.assistant_id, 
        user_id: user.id,
        role: user.role 
      });
      return res.status(403).json({ 
        error: 'Forbidden: You can only update your own data',
        details: { userId, student_id, assistant_id: user.assistant_id, user_id: user.id }
      });
    }

    const { session_id, action } = req.body; // action: 'view' | 'finish' | 'start_free_access' | 'decrement_free_views'

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    // Get student
    const student = await db.collection('students').findOne({ id: student_id });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get session to get week and payment_state
    const session = await db.collection('online_sessions').findOne({ _id: new ObjectId(session_id) });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Always use the persisted payment state; never trust a client-supplied value.
    const effectivePaymentState = session.payment_state;
    const isPaidVideo = effectivePaymentState === 'paid';
    const isFreeLimited = FREE_ONLINE_SESSION_PAYMENT_STATES.includes(effectivePaymentState);
    const sessionIdStr = typeof session_id === 'string' ? session_id : session_id.toString();
    const onlineSessions = student.online_sessions || [];
    const findFreeEntryIndex = () =>
      onlineSessions.findIndex((s) => {
        const videoIdStr = typeof s.video_id === 'string' ? s.video_id : s.video_id?.toString();
        return videoIdStr === sessionIdStr && s.free_viewing === true;
      });

    if (action === 'start_free_access') {
      if (!isFreeLimited) {
        return res.status(400).json({ error: 'Free viewing access only applies to free sessions' });
      }

      const lessonData = getStudentLesson(student.lessons, session.lesson);
      // "Free if attended in center" requires a real center attendance.
      if (
        session.payment_state === 'free_if_attended_in_center' &&
        !attendedInCenter(lessonData)
      ) {
        return res.status(403).json({
          error: 'Center attendance is required for this lesson',
          require_vvc: true,
        });
      }

      const existingIdx = findFreeEntryIndex();
      const existingEntry = existingIdx >= 0 ? onlineSessions[existingIdx] : null;

      // Re-sync stored entry with current session limits (admin may have increased views/days)
      const syncedEntry = existingEntry
        ? syncFreeViewingEntryWithSession(session, existingEntry, lessonData)
        : null;

      if (!isFreeViewingAccessValid(session, syncedEntry || existingEntry, lessonData)) {
        // Mark expired so client treats session as paid (VVC required)
        if (syncedEntry && syncedEntry.free_access_expired !== true) {
          const expiredEntry = {
            ...syncedEntry,
            free_access_expired: true,
            expired_at: syncedEntry.expired_at || new Date().toISOString(),
          };
          const nextList = [...onlineSessions];
          nextList[existingIdx] = expiredEntry;
          await db.collection('students').updateOne(
            { id: student_id },
            { $set: { online_sessions: nextList } }
          );
          return res.status(403).json({
            error: 'Viewing access expired — VVC required',
            expired: true,
            require_vvc: true,
            entry: expiredEntry,
          });
        }
        if (syncedEntry && existingIdx >= 0) {
          const nextList = [...onlineSessions];
          nextList[existingIdx] = syncedEntry;
          await db.collection('students').updateOne(
            { id: student_id },
            { $set: { online_sessions: nextList } }
          );
        }
        return res.status(403).json({
          error: 'Viewing access expired — VVC required',
          expired: true,
          require_vvc: true,
          entry: syncedEntry || existingEntry,
        });
      }

      if (!existingEntry) {
        const nowIso = new Date().toISOString();
        const limit = Number(session.viewing_limit_value) || 0;
        const entry = {
          video_id: sessionIdStr,
          free_viewing: true,
          viewing_limit_type: session.viewing_limit_type || null,
          viewing_limit_value: limit,
          first_opened_at: nowIso,
          first_viewed_at: session.viewing_limit_type === 'number_of_days' ? nowIso : null,
          views_used: 0,
          views_remaining:
            session.viewing_limit_type === 'number_of_views' ? limit : null,
          view_times: [],
          free_access_expired: false,
          date: formatDateWithTime(new Date()),
        };
        await db.collection('students').updateOne(
          { id: student_id },
          { $push: { online_sessions: entry } }
        );
        return res.status(200).json({ success: true, entry });
      }

      // Persist synced limits / cleared expired when admin increased views or days
      let entryToReturn = syncedEntry || existingEntry;
      if (!entryToReturn.first_opened_at) {
        const nowIso = new Date().toISOString();
        entryToReturn = {
          ...entryToReturn,
          first_opened_at: entryToReturn.first_viewed_at || nowIso,
          views_used: entryToReturn.views_used ?? 0,
          view_times: Array.isArray(entryToReturn.view_times) ? entryToReturn.view_times : [],
        };
        if (
          session.viewing_limit_type === 'number_of_days' &&
          !entryToReturn.first_viewed_at
        ) {
          entryToReturn.first_viewed_at = entryToReturn.first_opened_at;
        }
        entryToReturn = syncFreeViewingEntryWithSession(session, entryToReturn, lessonData);
      }

      const changed =
        JSON.stringify(entryToReturn) !== JSON.stringify(existingEntry);
      if (changed && existingIdx >= 0) {
        const nextList = [...onlineSessions];
        nextList[existingIdx] = entryToReturn;
        await db.collection('students').updateOne(
          { id: student_id },
          { $set: { online_sessions: nextList } }
        );
      }

      return res.status(200).json({ success: true, entry: entryToReturn });
    }

    if (action === 'decrement_free_views') {
      if (!isFreeLimited || session.viewing_limit_type !== 'number_of_views') {
        return res.status(200).json({ success: true, skipped: true });
      }

      const existingIdx = findFreeEntryIndex();
      if (existingIdx < 0) {
        return res.status(400).json({ error: 'Free viewing access not started' });
      }

      const lessonDataForViews = getStudentLesson(student.lessons, session.lesson);
      const entry = syncFreeViewingEntryWithSession(
        session,
        onlineSessions[existingIdx],
        lessonDataForViews
      );
      const limit = Number(session.viewing_limit_value) || 0;
      const used = Number(entry.views_used ?? 0) || 0;
      // Always derive from current session limit so increased limits grant leftover views
      const remaining = getFreeViewsRemaining(session, entry);

      if (remaining <= 0 || used >= limit) {
        const expiredEntry = {
          ...entry,
          views_remaining: 0,
          views_used: Math.max(used, limit),
          free_access_expired: true,
          expired_at: entry.expired_at || new Date().toISOString(),
        };
        const nextList = [...onlineSessions];
        nextList[existingIdx] = expiredEntry;
        await db.collection('students').updateOne(
          { id: student_id },
          { $set: { online_sessions: nextList } }
        );
        return res.status(403).json({
          error: 'no views remaining',
          number_of_views: 0,
          expired: true,
          require_vvc: true,
          entry: expiredEntry,
        });
      }

      const nowIso = new Date().toISOString();
      const nextUsed = used + 1;
      const nextRemaining = Math.max(0, limit - nextUsed);
      const viewTimes = Array.isArray(entry.view_times) ? [...entry.view_times] : [];
      viewTimes.push(nowIso);

      const updatedEntry = {
        ...entry,
        viewing_limit_type: session.viewing_limit_type,
        viewing_limit_value: limit,
        views_used: nextUsed,
        views_remaining: nextRemaining,
        view_times: viewTimes,
        last_viewed_at: nowIso,
        free_access_expired: nextRemaining <= 0,
        ...(nextRemaining <= 0 ? { expired_at: nowIso } : { expired_at: undefined }),
      };
      if (nextRemaining > 0) {
        delete updatedEntry.expired_at;
      }
      const nextList = [...onlineSessions];
      nextList[existingIdx] = updatedEntry;

      await db.collection('students').updateOne(
        { id: student_id },
        { $set: { online_sessions: nextList } }
      );

      return res.status(200).json({
        success: true,
        number_of_views: nextRemaining,
        views_used: nextUsed,
        expired: nextRemaining <= 0,
        require_vvc: nextRemaining <= 0,
        entry: updatedEntry,
      });
    }

    if (action === 'view') {
      // Just record that video was opened (no decrement)
      return res.status(200).json({ 
        success: true,
        message: 'Video view recorded'
      });
    } else if (action === 'finish') {
      // Free / free-if-attended-in-center: only views/days are tracked (start_free_access /
      // decrement_free_views). Do NOT overwrite lesson attendance (lastAttendance,
      // lastAttendanceCenter, etc.) — those stay as recorded in center.
      if (isFreeLimited) {
        return res.status(200).json({
          success: true,
          message: 'Free viewing video — attendance not modified',
          skipped_attendance: true,
        });
      }

      // Add entry to student's online_sessions array (for paid videos)
      {
        const onlineSessions = student.online_sessions || [];
        const sessionIdStr = typeof session_id === 'string' ? session_id : session_id.toString();
        
        // Check if entry already exists
        const existingEntry = onlineSessions.find(s => {
          const videoIdStr = typeof s.video_id === 'string' ? s.video_id : s.video_id?.toString();
          return videoIdStr === sessionIdStr;
        });

        if (!existingEntry) {
          // Add new entry for video (YouTube videos don't need VVC)
          const videoEntry = {
            video_id: sessionIdStr,
            date: formatDateWithTime(new Date())
          };
          
          await db.collection('students').updateOne(
            { id: student_id },
            { $push: { online_sessions: videoEntry } }
          );
          
          console.log('✅ Added video entry to student online_sessions:', videoEntry);
        } else {
          console.log('ℹ️ Video entry already exists in student online_sessions');
        }
      }

      // Mark attendance when paid video finishes
      const lesson = session.lesson;
      if (lesson && lesson.trim()) {
        const attendanceDate = formatDate(new Date());
        const attendanceString = formatEgyptAttendance(new Date(), 'Online');

        const lessonPatch = {
          attended: true,
          lastAttendance: attendanceString,
          lastAttendanceCenter: 'Online',
          attendanceDate: attendanceDate,
          ...(isPaidVideo ? { paid: true } : {}),
        };
        const nextLessons = mergeStudentLesson(student.lessons, lesson, lessonPatch);
        const updateResult = await db.collection('students').updateOne(
          { id: student_id },
          { $set: { lessons: nextLessons } }
        );
        const attendanceMarked = updateResult.modifiedCount > 0 || updateResult.matchedCount > 0;

        // Create history record when attendance is marked (similar to scan page logic)
        if (attendanceMarked) {
          // Check if history record already exists to avoid duplicates
          const existingHistory = await db.collection('history').findOne({
            studentId: student_id,
            lesson: lesson
          });

          if (!existingHistory) {
            // Create simplified history record (only studentId and lesson)
            const historyRecord = {
              studentId: student.id,
              lesson: lesson
            };
            
            console.log('📝 Creating history record for video attendance:', historyRecord);
            const historyResult = await db.collection('history').insertOne(historyRecord);
            console.log('✅ History record created with ID:', historyResult.insertedId);
          } else {
            console.log('ℹ️ History record already exists for student', student_id, 'lesson', lesson);
          }

          // === SCORING SYSTEM: Apply attendance scoring (status: 'attend') ===
          if (SCORING_SYSTEM_ENABLED) {
            try {
              // Check if 'attend' scoring was already applied for this student + lesson
              const existingScoringHistory = await db.collection('scoring_system_history').findOne({
                studentId: student_id,
                type: 'attendance',
                lesson: lesson,
                'data.status': 'attend'
              });

              if (!existingScoringHistory) {
                // Call scoring APIs via internal HTTP
                const protocol = req.headers['x-forwarded-proto'] || 'http';
                const host = req.headers.host;
                const baseUrl = `${protocol}://${host}`;

                const headers = { 'Content-Type': 'application/json' };
                if (req.headers.authorization) {
                  headers['Authorization'] = req.headers.authorization;
                }
                if (req.headers.cookie) {
                  headers['Cookie'] = req.headers.cookie;
                }

                // Check previous scoring history for this lesson
                let previousStatus = null;
                try {
                  const historyRes = await fetch(`${baseUrl}/api/scoring/get-last-history`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      studentId: student_id,
                      type: 'attendance',
                      lesson: lesson
                    })
                  });
                  if (historyRes.ok) {
                    const historyData = await historyRes.json();
                    if (historyData.found) {
                      previousStatus = historyData.history?.data?.status || null;
                    }
                  }
                } catch (e) {
                  console.error('⚠️ Failed to get scoring history:', e);
                }

                // Apply 'attend' attendance scoring
                try {
                  const calcRes = await fetch(`${baseUrl}/api/scoring/calculate`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      studentId: student_id,
                      type: 'attendance',
                      lesson: lesson,
                      source: {
                        kind: 'attendance',
                        id: lesson,
                        label: lesson,
                      },
                      data: {
                        status: 'attend',
                        previousStatus: previousStatus
                      }
                    })
                  });
                  if (calcRes.ok) {
                    console.log(`[SCORING] Attend score applied for student ${student_id}, lesson "${lesson}" via Online Session`);
                  } else {
                    const errData = await calcRes.json().catch(() => ({}));
                    console.error('⚠️ Scoring calculate failed:', errData);
                  }
                } catch (e) {
                  console.error('⚠️ Failed to apply scoring:', e);
                }
              } else {
                console.log(`[SCORING] Attend scoring already applied for student ${student_id}, lesson "${lesson}" — skipping`);
              }
            } catch (scoringErr) {
              console.error('⚠️ Failed to process scoring for online session attendance:', scoringErr);
            }
          }
        }
      }

      return res.status(200).json({ 
        success: true,
        message: 'Video finished and attendance marked'
      });
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "view" or "finish"' });
    }
  } catch (error) {
    console.error('❌ Error in watch-video API:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}

