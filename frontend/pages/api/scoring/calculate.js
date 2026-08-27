import { MongoClient } from 'mongodb';
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
export const SYSTEM_SCORING_SYSTEM = envConfig.SYSTEM_SCORING_SYSTEM === 'true' || process.env.SYSTEM_SCORING_SYSTEM === 'true';

// Convert scoring condition to ZEN Engine rule format
function convertConditionToZenRule(condition) {
  const { type, withDegree, rules, bonusRules } = condition;
  
  // Build decision table based on type
  let decisions = [];
  
  if (type === 'attendance') {
    // Attendance rules: match by key (status)
    decisions = rules.map(rule => ({
      key: rule.key,
      result: {
        points: rule.points
      }
    }));
  } else if (type === 'homework' && withDegree === true) {
    // Homework with degree: match by percentage range
    decisions = rules.map(rule => ({
      key: `range_${rule.min}_${rule.max}`,
      result: {
        points: rule.points,
        min: rule.min,
        max: rule.max
      }
    }));
  } else if (type === 'homework' && withDegree === false) {
    // Homework without degree: match by hwDone value
    decisions = rules.map(rule => ({
      key: `hwDone_${String(rule.hwDone)}`,
      result: {
        points: rule.points,
        hwDone: rule.hwDone
      }
    }));
  } else if (type === 'quiz' || type === 'mock-exam') {
    // Quiz/Mock-exam rules: match by percentage range
    decisions = rules.map(rule => ({
      key: `range_${rule.min}_${rule.max}`,
      result: {
        points: rule.points,
        min: rule.min,
        max: rule.max
      }
    }));
  }
  
  return {
    key: `${type}_${withDegree !== undefined ? withDegree : 'default'}`,
    name: `Scoring Rule for ${type}${withDegree !== undefined ? ` (${withDegree ? 'with' : 'without'} degree)` : ''}`,
    decisions: decisions,
    bonusRules: bonusRules || []
  };
}

// Evaluate rule using ZEN Engine
async function evaluateRule(zenRule, input) {
  try {
    // Create a simple decision table rule for ZEN Engine
    const ruleContent = {
      key: zenRule.key,
      name: zenRule.name,
      input: {
        type: 'string',
        default: ''
      },
      output: {
        type: 'number',
        default: 0
      },
      decisions: zenRule.decisions.map(decision => ({
        key: decision.key,
        conditions: [
          {
            all: [
              {
                fact: 'input',
                operator: 'equal',
                value: decision.key
              }
            ]
          }
        ],
        event: {
          type: 'set',
          params: {
            points: decision.result.points
          }
        }
      }))
    };
    
    // For range-based rules, we need custom evaluation
    if (zenRule.decisions[0]?.result?.min !== undefined) {
      // Range-based evaluation (homework with degree, quiz)
      const { percentage } = input;
      if (percentage !== undefined && percentage !== null) {
        const matchingDecision = zenRule.decisions.find(d => {
          const { min, max } = d.result;
          return percentage >= min && percentage <= max;
        });
        return matchingDecision ? matchingDecision.result.points : 0;
      }
      return 0;
    } else if (zenRule.decisions[0]?.result?.hwDone !== undefined) {
      // Homework without degree evaluation
      const { hwDone } = input;
      if (hwDone !== undefined && hwDone !== null) {
        const matchingDecision = zenRule.decisions.find(d => {
          const ruleHwDone = d.result.hwDone;
          if (ruleHwDone === hwDone) return true;
          return String(ruleHwDone) === String(hwDone);
        });
        return matchingDecision ? matchingDecision.result.points : 0;
      }
      return 0;
    } else {
      // Key-based evaluation (attendance)
      const { status } = input;
      if (status) {
        const matchingDecision = zenRule.decisions.find(d => d.key === status);
        return matchingDecision ? matchingDecision.result.points : 0;
      }
      return 0;
    }
  } catch (error) {
    console.error('Error evaluating ZEN rule:', error);
    return 0;
  }
}

// Calculate bonus points for streaks (uses lessons instead of weeks)
function calculateBonusPoints(condition, student, type, currentLesson = null) {
  let bonusPoints = 0;
  const bonusLessons = []; // Track which lessons are involved in bonuses
  
  if (!condition.bonusRules || condition.bonusRules.length === 0) {
    return { bonusPoints: 0, bonusLessons: [] };
  }
  
  // Ensure lessons is an object, not an array
  let lessons = {};
  if (student.lessons) {
    if (typeof student.lessons === 'object' && !Array.isArray(student.lessons)) {
      lessons = student.lessons;
    } else if (Array.isArray(student.lessons)) {
      // Convert array format to object format if needed
      console.log('[SCORING] Warning: student.lessons is an array, converting to object format');
      lessons = {};
    }
  }
  
  const lessonPercentageMap = new Map();
  
  try {
  if (type === 'homework' && condition.withDegree === true) {
      const onlineHomeworks = (student.online_homeworks && Array.isArray(student.online_homeworks)) ? student.online_homeworks : [];
    
      // Get percentages from lessons.homework_degree
      if (typeof lessons === 'object' && !Array.isArray(lessons)) {
        Object.keys(lessons).forEach(lessonName => {
          try {
            const lessonData = lessons[lessonName];
            if (lessonData && lessonData.homework_degree && typeof lessonData.homework_degree === 'string') {
              const hwDegreeStr = String(lessonData.homework_degree).trim();
        const match = hwDegreeStr.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
        if (match) {
          const obtained = parseFloat(match[1]);
          const total = parseFloat(match[2]);
          const percentage = total > 0 ? Math.round((obtained / total) * 100) : 0;
                lessonPercentageMap.set(lessonName, percentage);
          }
        }
          } catch (err) {
            console.error(`[SCORING] Error processing lesson ${lessonName} for homework bonus:`, err);
      }
    });
      }
    
    // Get percentages from online_homeworks (these take precedence)
      if (Array.isArray(onlineHomeworks)) {
    onlineHomeworks.forEach(ohw => {
          try {
            if (ohw && ohw.lesson) {
        if (ohw.percentage !== undefined && ohw.percentage !== null) {
          const percentage = parseInt(String(ohw.percentage).replace('%', '').trim(), 10);
          if (!isNaN(percentage)) {
            lessonPercentageMap.set(ohw.lesson, percentage);
            return;
          }
        }
        if (ohw.result && typeof ohw.result === 'string') {
        const resultStr = String(ohw.result).trim();
        const match = resultStr.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
        if (match) {
          const obtained = parseFloat(match[1]);
          const total = parseFloat(match[2]);
          const percentage = total > 0 ? Math.round((obtained / total) * 100) : 0;
                lessonPercentageMap.set(ohw.lesson, percentage);
          }
          }
        }
          } catch (err) {
            console.error('[SCORING] Error processing online homework for bonus:', err);
      }
    });
      }
  } else if (type === 'quiz') {
      const onlineQuizzes = (student.online_quizzes && Array.isArray(student.online_quizzes)) ? student.online_quizzes : [];
    
      // Get percentages from lessons.quizDegree
      if (typeof lessons === 'object' && !Array.isArray(lessons)) {
        Object.keys(lessons).forEach(lessonName => {
          try {
            const lessonData = lessons[lessonName];
            if (lessonData && lessonData.quizDegree && typeof lessonData.quizDegree === 'string' && 
                lessonData.quizDegree !== "Didn't Attend The Quiz" && lessonData.quizDegree !== "No Quiz") {
              const quizDegreeStr = String(lessonData.quizDegree).trim();
        const match = quizDegreeStr.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
        if (match) {
          const obtained = parseFloat(match[1]);
          const total = parseFloat(match[2]);
          const percentage = total > 0 ? Math.round((obtained / total) * 100) : 0;
                lessonPercentageMap.set(lessonName, percentage);
          }
        }
          } catch (err) {
            console.error(`[SCORING] Error processing lesson ${lessonName} for quiz bonus:`, err);
      }
    });
      }
    
    // Get percentages from online_quizzes (these take precedence)
      if (Array.isArray(onlineQuizzes)) {
    onlineQuizzes.forEach(oqz => {
          try {
            if (oqz && oqz.lesson) {
        if (oqz.percentage !== undefined && oqz.percentage !== null) {
          const percentage = parseInt(String(oqz.percentage).replace('%', '').trim(), 10);
          if (!isNaN(percentage)) {
            lessonPercentageMap.set(oqz.lesson, percentage);
            return;
          }
        }
        if (oqz.result && typeof oqz.result === 'string') {
        const resultStr = String(oqz.result).trim();
        const match = resultStr.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
        if (match) {
          const obtained = parseFloat(match[1]);
          const total = parseFloat(match[2]);
          const percentage = total > 0 ? Math.round((obtained / total) * 100) : 0;
                lessonPercentageMap.set(oqz.lesson, percentage);
          }
              }
            }
          } catch (err) {
            console.error('[SCORING] Error processing online quiz for bonus:', err);
          }
        });
      }
    } else if (type === 'mock_exam') {
      const onlineMockExams = (student.online_mock_exams && Array.isArray(student.online_mock_exams)) ? student.online_mock_exams : [];
    
      // Get percentages from online_mock_exams
      if (Array.isArray(onlineMockExams)) {
        onlineMockExams.forEach(ome => {
          try {
            if (ome && ome.lesson && ome.percentage) {
              const percentageStr = String(ome.percentage).replace('%', '').trim();
              const percentage = parseInt(percentageStr, 10);
              if (!isNaN(percentage)) {
                lessonPercentageMap.set(ome.lesson, percentage);
              }
            }
          } catch (err) {
            console.error('[SCORING] Error processing online mock exam for bonus:', err);
          }
        });
      }
    }
  } catch (err) {
    console.error('[SCORING] Error in calculateBonusPoints while processing lessons:', err);
    // Return empty bonus if there's an error
    return { bonusPoints: 0, bonusLessons: [] };
  }
  
  // Check bonus rules for groups of consecutive lessons
  // Lessons array to get lesson order (defined inline since API routes can't import from frontend)
  const lessonsArray = [
    'Subject and Verb Agreement',
    'Verb Tenses',
    'if conditionals and Pronouns',
    'Comparison and Superlative and Parallel Structure',
    'Modifiers',
    'Transition Words',
    'Punctuation Marks Part 1',
    'Punctuation Marks Part 2',
    'Rhetorical Synthesis',
    'Main Ideas',
    'Making Inferences',
    'Command of Evidence - Graphs',
    'Command of Evidence - Support and Weaken',
    'Cross-Text Connections',
    'Text, Structure, and Purpose',
    'Words in Context - Gap Filling - Synonyms',
    'Supporting Evidence and Examples, Topic, Conclusion, and Transition Sentences',
    'Sentence Placement',
    'Relevance and Purpose',
    'Boundaries',
    'Form, Structure, and Sense',
    'Details Question',
    'Main Purpose',
    'Overall Structure',
    'Underlined Purpose',
    'DSAT Exam 1',
    'DSAT Exam 2',
    'DSAT Exam 3',
    'DSAT Exam 4',
    'DSAT Exam 5',
    'DSAT Exam 6',
    'DSAT Exam 7',
    'DSAT Exam 8',
    'DSAT Exam 9',
    'DSAT Exam 10',
    'EST Exam 1',
    'EST Exam 2',
    'EST Exam 3',
    'EST Exam 4',
    'EST Exam 5',
    'EST Exam 6',
    'EST Exam 7',
    'EST Exam 8',
    'EST Exam 9',
    'EST Exam 10',
    'Revision 1',
    'Revision 2',
    'Revision 3',
    'Revision 4',
    'Revision 5',
  ];
  
  for (const bonusRule of condition.bonusRules) {
    if (bonusRule.condition?.lastN && bonusRule.condition?.percentage) {
      const lastN = bonusRule.condition.lastN;
      const requiredPercentage = bonusRule.condition.percentage;
      
      // Get all lessons that have the required percentage, in order
      const lessonNames = Array.from(lessonPercentageMap.keys()).filter(lessonName => {
        return lessonPercentageMap.get(lessonName) === requiredPercentage;
      });
      
      // Sort lessons by their index in the lessons array
      const sortedLessons = lessonNames.sort((a, b) => {
        const indexA = lessonsArray.indexOf(a);
        const indexB = lessonsArray.indexOf(b);
        return indexA - indexB;
      });
      
      if (sortedLessons.length >= lastN) {
        // Check for consecutive groups of lastN lessons
        for (let i = 0; i <= sortedLessons.length - lastN; i++) {
          const groupLessons = sortedLessons.slice(i, i + lastN);
          
          // Check if lessons are consecutive in the lessons array
          let isConsecutive = true;
          for (let j = 0; j < groupLessons.length - 1; j++) {
            const currentIndex = lessonsArray.indexOf(groupLessons[j]);
            const nextIndex = lessonsArray.indexOf(groupLessons[j + 1]);
            if (nextIndex !== currentIndex + 1) {
              isConsecutive = false;
              break;
            }
          }
          
          if (isConsecutive) {
            // Only count bonus if current lesson is part of this group or if no current lesson specified
            if (currentLesson === null || groupLessons.includes(currentLesson)) {
              bonusPoints += bonusRule.points;
              bonusLessons.push(...groupLessons);
              console.log(`[SCORING] Bonus (${type} streak): +${bonusRule.points} points for lessons ${groupLessons.join(', ')} (all ${requiredPercentage}%)`);
              // Only count each group once
              break;
            }
          }
        }
      }
    }
  }
  
  // Remove duplicates from bonusLessons
  const uniqueBonusLessons = [...new Set(bonusLessons)];
  
  return { bonusPoints, bonusLessons: uniqueBonusLessons };
}

function buildProcessName(type, condition, data = {}) {
  if (type === 'attendance') {
    const statusLabel = data.reverseOnly
      ? `Reverse (was: ${data.previousStatus ?? 'attend'})`
      : (data.status ?? 'attend');
    return `Attendance: ${statusLabel}`;
  }
  if (type === 'homework') {
    if (condition.withDegree === true) {
      if (data.reverseOnly) {
        return `Homework (with degree): Reverse (was: ${data.previousPercentage ?? 0}%)`;
      }
      return `Homework (with degree): ${data.percentage ?? 0}%`;
    }
    if (data.reverseOnly) {
      const prevLabel = data.previousHwDone === true ? 'Done'
        : data.previousHwDone === false ? 'Not Done'
        : data.previousHwDone === 'Not Completed' ? 'Not Completed'
        : String(data.previousHwDone ?? 'Done');
      return `Homework (without degree): Reverse (was: ${prevLabel})`;
    }
    const hwLabel = data.hwDone === true ? 'Done'
      : data.hwDone === false ? 'Not Done'
      : data.hwDone === 'Not Completed' ? 'Not Completed'
      : String(data.hwDone ?? 'Not Done');
    return `Homework (without degree): ${hwLabel}`;
  }
  if (type === 'quiz') {
    return data.reverseOnly
      ? `Quiz: Reverse (was: ${data.previousPercentage ?? 0}%)`
      : `Quiz: ${data.percentage ?? 0}%`;
  }
  if (type === 'mock_exam') {
    return data.reverseOnly
      ? `Mock Exam: Reverse (was: ${data.previousPercentage ?? 0}%)`
      : `Mock Exam: ${data.percentage ?? 0}%`;
  }
  if (type === 'manual') {
    const delta = Number(data.delta ?? 0);
    return `Staff adjustment: ${delta >= 0 ? '+' : ''}${delta}`;
  }
  return type;
}

function inferLegacySource(type, lesson, data = {}) {
  if (type === 'attendance') {
    return {
      kind: 'attendance',
      id: lesson || 'global',
      label: lesson || 'Attendance',
    };
  }
  if (type === 'homework') {
    if (data.percentage !== undefined && data.percentage !== null) {
      return {
        kind: 'legacy_homework_with_degree',
        id: lesson || 'global',
        label: lesson || 'Legacy Homework With Degree',
      };
    }
    return {
      kind: 'legacy_homework_without_degree',
      id: lesson || 'global',
      label: lesson || 'Legacy Homework Status',
    };
  }
  if (type === 'quiz') {
    return {
      kind: 'legacy_quiz',
      id: lesson || 'global',
      label: lesson || 'Legacy Quiz',
    };
  }
  if (type === 'mock_exam') {
    return {
      kind: 'legacy_mock_exam',
      id: lesson || 'global',
      label: lesson || 'Legacy Mock Exam',
    };
  }
  if (type === 'manual') {
    return {
      kind: 'staff_adjustment',
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      label: 'Manage Student Score',
    };
  }
  return {
    kind: `legacy_${type}`,
    id: lesson || 'global',
    label: lesson || type,
  };
}

function buildSourceDescriptor(studentId, type, lesson, data = {}, sourceInput = null) {
  const source = sourceInput && sourceInput.kind && sourceInput.id
    ? sourceInput
    : inferLegacySource(type, lesson, data);

  const sourceKind = String(source.kind);
  const sourceId = String(source.id);
  const sourceLabel = String(source.label || lesson || sourceId);
  const rawKey = `student:${studentId}|type:${type}|kind:${sourceKind}|id:${sourceId}`;
  const stateKey = Buffer.from(rawKey, 'utf8').toString('hex');

  return {
    sourceKey: rawKey,
    stateKey,
    sourceKind,
    sourceId,
    sourceLabel,
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function upsertById(arr, idField, idValue, nextValue) {
  const list = Array.isArray(arr) ? [...arr] : [];
  const idx = list.findIndex((item) => String(item?.[idField] ?? '') === String(idValue));
  if (idx === -1) list.push(nextValue);
  else list[idx] = { ...list[idx], ...nextValue };
  return list;
}

function removeById(arr, idField, idValue) {
  const list = Array.isArray(arr) ? [...arr] : [];
  return list.filter((item) => String(item?.[idField] ?? '') !== String(idValue));
}

function setProjectedLessonData(projected, lesson, patch) {
  if (!lesson) return;
  if (!projected.lessons || typeof projected.lessons !== 'object' || Array.isArray(projected.lessons)) {
    projected.lessons = {};
  }
  const current = projected.lessons[lesson] && typeof projected.lessons[lesson] === 'object'
    ? projected.lessons[lesson]
    : {
        lesson,
        attended: false,
        lastAttendance: null,
        lastAttendanceCenter: null,
        attendanceDate: null,
        hwDone: false,
        quizDegree: null,
        comment: null,
        message_state: false,
        homework_degree: null,
        paid: false,
      };
  projected.lessons[lesson] = { ...current, ...patch };
}

function buildProjectedStudent(student, { type, data, lesson, source }) {
  const projected = deepClone(student);
  const reverseOnly = data?.reverseOnly === true;

  if (type === 'homework') {
    if (source.sourceKind === 'online_homework') {
      projected.online_homeworks = reverseOnly
        ? removeById(projected.online_homeworks, 'homework_id', source.sourceId)
        : upsertById(projected.online_homeworks, 'homework_id', source.sourceId, {
            homework_id: source.sourceId,
            lesson,
            percentage: `${data.percentage ?? 0}%`,
          });
    } else if (source.sourceKind === 'classroom_homework_degree') {
      setProjectedLessonData(projected, lesson, {
        hwDone: !reverseOnly,
        homework_degree: reverseOnly
          ? null
          : `${data.obtained ?? data.percentage ?? 0} / ${data.outOf ?? 100}`,
      });
    } else if (
      source.sourceKind === 'classroom_homework_status' ||
      source.sourceKind === 'deadline_homework'
    ) {
      setProjectedLessonData(projected, lesson, {
        hwDone: reverseOnly ? false : data.hwDone,
      });
    }
  } else if (type === 'quiz') {
    if (source.sourceKind === 'online_quiz') {
      projected.online_quizzes = reverseOnly
        ? removeById(projected.online_quizzes, 'quiz_id', source.sourceId)
        : upsertById(projected.online_quizzes, 'quiz_id', source.sourceId, {
            quiz_id: source.sourceId,
            lesson,
            percentage: `${data.percentage ?? 0}%`,
          });
    } else if (
      source.sourceKind === 'classroom_quiz_degree' ||
      source.sourceKind === 'deadline_quiz'
    ) {
      let quizDegree = null;
      if (!reverseOnly) {
        if (data.percentage === 0) quizDegree = "Didn't Attend The Quiz";
        else if (data.obtained !== undefined && data.outOf !== undefined) {
          quizDegree = `${data.obtained} / ${data.outOf}`;
        } else if (data.percentage !== undefined && data.percentage !== null) {
          quizDegree = `${data.percentage} / 100`;
        }
      }
      setProjectedLessonData(projected, lesson, { quizDegree });
    }
  } else if (type === 'mock_exam') {
    if (source.sourceKind === 'online_mock_exam') {
      projected.online_mock_exams = reverseOnly
        ? removeById(projected.online_mock_exams, 'mock_exam_id', source.sourceId)
        : upsertById(projected.online_mock_exams, 'mock_exam_id', source.sourceId, {
            mock_exam_id: source.sourceId,
            lesson,
            percentage: `${data.percentage ?? 0}%`,
          });
    }
  }

  return projected;
}

function getStateEntry(student, stateKey) {
  if (!student?.scoring_state || typeof student.scoring_state !== 'object') return null;
  return student.scoring_state[stateKey] || null;
}

async function findCompatibilityFallbackHistory(db, { studentId, type, lesson, source }) {
  const query = {
                    student_id: parseInt(studentId), 
    type,
  };

  if (lesson) {
    query.process_lesson = lesson;
  } else if (
    source.sourceKind !== 'online_homework' &&
    source.sourceKind !== 'online_quiz' &&
    source.sourceKind !== 'online_mock_exam'
  ) {
    query.process_name = { $regex: source.sourceLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
              } else {
    return null;
  }

  const history = await db.collection('scoring_system_history')
    .find(query)
    .sort({ timestamp: -1 })
    .limit(1)
    .toArray();

  if (history.length === 0) return null;
  return history[0];
}

export async function ensureHistoryIndexes(db) {
  try {
    await db.collection('scoring_system_history').createIndex(
      { student_id: 1, type: 1, source_key: 1, timestamp: -1 },
      { name: 'student_type_source_ts' }
    );
    await db.collection('students').createIndex(
      { id: 1 },
      { unique: true, name: 'student_id_unique' }
    );
  } catch (error) {
    console.warn('[SCORING] Failed to ensure indexes:', error?.message || error);
  }
}

export async function applyScoringEvent({
  db,
  studentId,
  type,
  lesson,
  data,
  sourceInput,
  skipAttendanceAutoReverse = false,
}) {
  const studentNumericId = parseInt(studentId);
  const isManual = type === 'manual';

  let condition = null;
  let zenRule = null;

  if (!isManual) {
    const conditions = await db.collection('scoring_system_conditions').find({}).toArray();
    if (conditions.length === 0) {
      throw new Error('Scoring system conditions not found. Please seed the database first.');
    }

    const lookupType = type === 'mock_exam' ? 'mock-exam' : type;
    if (lookupType === 'homework') {
      const hasPercentage = data?.percentage !== undefined && data?.percentage !== null;
      condition = conditions.find((c) => c.type === lookupType && c.withDegree === hasPercentage);
        } else {
      condition = conditions.find((c) => c.type === lookupType);
    }
    if (!condition) {
      throw new Error(`No scoring condition found for type: ${type}`);
    }
    zenRule = convertConditionToZenRule(condition);
  } else if (data?.delta === undefined || data?.delta === null || Number.isNaN(Number(data.delta))) {
    throw new Error('Manual scoring requires a numeric delta');
  }

  const source = buildSourceDescriptor(studentNumericId, type, lesson, data, sourceInput);
  const processName = buildProcessName(type, condition, data);

  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const freshStudent = await db.collection('students').findOne({ id: studentNumericId });
    if (!freshStudent) {
      throw new Error('Student not found');
    }

    const previousState = getStateEntry(freshStudent, source.stateKey);
    let previousAwardedTotal = Number(previousState?.awarded_total_points ?? 0);
    let previousAwardedBase = Number(previousState?.awarded_base_points ?? 0);
    let previousAwardedBonus = Number(previousState?.awarded_bonus_points ?? 0);

    // Compatibility fallback for older records only when reversing and no authoritative state exists.
    if (!previousState && data?.reverseOnly) {
      const fallbackHistory = await findCompatibilityFallbackHistory(db, {
        studentId: studentNumericId,
        type,
        lesson,
        source,
      });
      if (fallbackHistory) {
        previousAwardedTotal = Number(
          fallbackHistory.awarded_total_points ??
          fallbackHistory.score_added ??
          fallbackHistory.base_points ??
          0
        );
        previousAwardedBase = Number(
          fallbackHistory.awarded_base_points ??
          fallbackHistory.base_points ??
          0
        );
        previousAwardedBonus = Number(
          fallbackHistory.awarded_bonus_points ??
          fallbackHistory.bonus_points ??
          0
        );
      }
    }

    let currentBaseContribution = 0;
    let currentBonusContribution = 0;
    let currentResult = {};

    if (type === 'manual') {
      currentBaseContribution = Number(data.delta);
      currentResult = {
        delta: currentBaseContribution,
        reason: data.reason || 'Staff adjustment from Manage Student Score',
      };
    } else if (type === 'attendance') {
      if (data?.reverseOnly) {
        currentResult = { status: 'reversed', previousStatus: data?.previousStatus ?? null };
            } else {
        currentBaseContribution = await evaluateRule(zenRule, { status: data?.status });
        currentResult = { status: data?.status ?? null };
      }
    } else if (type === 'homework') {
      if (condition.withDegree === true) {
        if (!data?.reverseOnly && data?.percentage !== undefined && data?.percentage !== null) {
          currentBaseContribution = await evaluateRule(zenRule, { percentage: data.percentage });
          currentResult = { percentage: data.percentage };
        } else {
          currentResult = { reversed: true, previousPercentage: data?.previousPercentage ?? null };
        }
      } else if (!data?.reverseOnly) {
        currentBaseContribution = await evaluateRule(zenRule, { hwDone: data?.hwDone });
        currentResult = { hwDone: data?.hwDone ?? null };
        } else {
        currentResult = { reversed: true, previousHwDone: data?.previousHwDone ?? null };
      }
    } else if (type === 'quiz' || type === 'mock_exam') {
      if (!data?.reverseOnly && data?.percentage !== undefined && data?.percentage !== null) {
        currentBaseContribution = await evaluateRule(zenRule, { percentage: data.percentage });
        currentResult = { percentage: data.percentage };
          } else {
        currentResult = { reversed: true, previousPercentage: data?.previousPercentage ?? null };
      }
    }

    if (!isManual && !data?.reverseOnly && condition?.bonusRules?.length) {
      try {
        const projectedStudent = buildProjectedStudent(freshStudent, {
          type,
          data,
          lesson,
          source,
        });
        const bonusResult = calculateBonusPoints(condition, projectedStudent, type, lesson ?? null);
        currentBonusContribution = Number(bonusResult.bonusPoints || 0);
      } catch (error) {
        console.error('[SCORING] Bonus calculation failed, defaulting to 0:', error);
        currentBonusContribution = 0;
      }
    }

    const desiredTotalContribution = currentBaseContribution + currentBonusContribution;
    const requestedDelta = desiredTotalContribution - previousAwardedTotal;

    const isDeadlineSource =
      source.sourceKind === 'deadline_homework' || source.sourceKind === 'deadline_quiz';

    // Deadline events are one-shot: never re-score after state exists (revisits, rule changes).
    if (!data?.reverseOnly && previousState != null && isDeadlineSource) {
      return {
        success: true,
        idempotentNoOp: true,
        processId: null,
        processName: previousState.process_name || processName,
        pointsAdded: 0,
        requestedDelta: 0,
        basePoints: Number(previousState.current_deserved_base_points ?? currentBaseContribution),
        bonusPoints: Number(previousState.current_deserved_bonus_points ?? currentBonusContribution),
        previousScore: Number(freshStudent.score || 0),
        newScore: Number(freshStudent.score || 0),
        previousAwardedContribution: previousAwardedTotal,
        currentContribution: previousAwardedTotal,
        actualAppliedDelta: 0,
        awardedTotalAfterProcess: previousAwardedTotal,
        sourceKey: source.sourceKey,
      };
    }

    // Idempotent no-op: exact deadline/source already scored at this contribution.
    if (
      !data?.reverseOnly &&
      previousState != null &&
      requestedDelta === 0
    ) {
      return {
        success: true,
        idempotentNoOp: true,
        processId: null,
        processName: previousState.process_name || processName,
        pointsAdded: 0,
        requestedDelta: 0,
        basePoints: currentBaseContribution,
        bonusPoints: currentBonusContribution,
        previousScore: Number(freshStudent.score || 0),
        newScore: Number(freshStudent.score || 0),
        previousAwardedContribution: previousAwardedTotal,
        currentContribution: desiredTotalContribution,
        actualAppliedDelta: 0,
        awardedTotalAfterProcess: previousAwardedTotal,
        sourceKey: source.sourceKey,
      };
    }

    const currentScore = Number(freshStudent.score || 0);
    const desiredScore = currentScore + requestedDelta;
    const newScore = Math.max(0, desiredScore);
    const appliedDelta = newScore - currentScore;
    const awardedTotalAfterProcess = previousAwardedTotal + appliedDelta;

    const nextState = {
      version: Number(previousState?.version || 0) + 1,
      state_key: source.sourceKey,
      type,
      lesson: lesson || null,
      source_kind: source.sourceKind,
      source_id: source.sourceId,
      source_label: source.sourceLabel,
      current_result: currentResult,
      current_deserved_base_points: currentBaseContribution,
      current_deserved_bonus_points: currentBonusContribution,
      desired_total_points: desiredTotalContribution,
      awarded_base_points: appliedDelta === requestedDelta ? currentBaseContribution : previousAwardedBase,
      awarded_bonus_points: appliedDelta === requestedDelta ? currentBonusContribution : previousAwardedBonus,
      awarded_total_points: awardedTotalAfterProcess,
      last_requested_delta: requestedDelta,
      last_applied_delta: appliedDelta,
      process_name: processName,
      updated_at: new Date(),
      created_at: previousState?.created_at || new Date(),
    };

    const filter = {
      id: studentNumericId,
      score: currentScore,
    };
    if (previousState) {
      filter[`scoring_state.${source.stateKey}.version`] = previousState.version;
      } else {
      filter[`scoring_state.${source.stateKey}`] = { $exists: false };
    }

    const updateResult = await db.collection('students').updateOne(
      filter,
      {
        $set: {
          score: newScore,
          [`scoring_state.${source.stateKey}`]: nextState,
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      if (attempt === MAX_RETRIES) {
        throw new Error('Scoring update conflicted with another request. Please retry.');
      }
      continue;
    }

    const processId = `${studentNumericId}_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const historyEntry = {
      student_id: studentNumericId,
      process_id: processId,
      process_name: processName,
      process_lesson: lesson || null,
      type,
      source_key: source.sourceKey,
      source_kind: source.sourceKind,
      source_id: source.sourceId,
      source_label: source.sourceLabel,
      score_before_process: currentScore,
      score_after_process: newScore,
      score_added: appliedDelta,
      requested_delta: requestedDelta,
      applied_delta: appliedDelta,
      desired_total_points: desiredTotalContribution,
      previous_awarded_contribution: previousAwardedTotal,
      awarded_total_points: awardedTotalAfterProcess,
      awarded_base_points: nextState.awarded_base_points,
      awarded_bonus_points: nextState.awarded_bonus_points,
      base_points: currentBaseContribution,
      bonus_points: currentBonusContribution,
      bonus_lessons: Array.isArray(data?.bonusLessons) ? data.bonusLessons : [],
      data,
      state_version: nextState.version,
      timestamp: new Date(),
    };

    try {
      await db.collection('scoring_system_history').insertOne(historyEntry);
    } catch (historyError) {
      console.error('[SCORING] Failed to write history entry:', historyError);
    }

    // Attendance reversal should reverse exact awarded contributions for related homework/quiz entries.
    if (type === 'attendance' && data?.reverseOnly && lesson && !skipAttendanceAutoReverse) {
      const updatedStudent = await db.collection('students').findOne({ id: studentNumericId });
      const scoringState = updatedStudent?.scoring_state || {};
      const relatedStateEntries = Object.values(scoringState).filter((entry) => (
        entry &&
        entry.lesson === lesson &&
        ['homework', 'quiz'].includes(entry.type) &&
        Number(entry.awarded_total_points || 0) !== 0
      ));

      for (const entry of relatedStateEntries) {
        try {
          await applyScoringEvent({
            db,
            studentId: studentNumericId,
            type: entry.type,
            lesson,
            data: {
              reverseOnly: true,
              previousPercentage: entry.current_result?.percentage ?? null,
              previousHwDone: entry.current_result?.hwDone ?? null,
              autoReversedBy: 'attendance',
            },
            sourceInput: {
              kind: entry.source_kind,
              id: entry.source_id,
              label: entry.source_label,
            },
            skipAttendanceAutoReverse: true,
          });
        } catch (error) {
          console.error('[SCORING] Auto-reverse failed for related source:', entry.source_kind, entry.source_id, error);
        }
      }
    }

    return {
      success: true,
      processId,
      processName,
      pointsAdded: appliedDelta,
      requestedDelta,
      basePoints: currentBaseContribution,
      bonusPoints: currentBonusContribution,
      previousScore: currentScore,
      newScore,
      previousAwardedContribution: previousAwardedTotal,
      currentContribution: desiredTotalContribution,
      actualAppliedDelta: appliedDelta,
      awardedTotalAfterProcess,
      sourceKey: source.sourceKey,
    };
  }

  throw new Error('Unable to apply scoring event');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if scoring system is enabled (staff manual adjustments still apply)
  if (!SYSTEM_SCORING_SYSTEM && req.body?.type !== 'manual') {
    return res.status(200).json({
      success: true,
      pointsAdded: 0,
      basePoints: 0,
      bonusPoints: 0,
      previousScore: 0,
      newScore: 0,
      processId: null,
      message: 'Scoring system is disabled'
    });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (!['admin', 'developer', 'assistant', 'student'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const { studentId, type, data: requestData, lesson, source } = req.body;
    const data = requestData || {};

    if (user.role === 'student') {
      const studentIdFromToken = parseInt(user.assistant_id || user.id);
      if (studentIdFromToken !== parseInt(studentId)) {
        return res.status(403).json({ error: 'Forbidden: Students can only update their own score' });
      }
      if (type === 'manual') {
        return res.status(403).json({ error: 'Forbidden: Students cannot apply staff score adjustments' });
      }
    }

    if (!studentId || !type) {
      return res.status(400).json({ error: 'Student ID and type are required' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    await ensureHistoryIndexes(db);

    const result = await applyScoringEvent({
      db,
      studentId,
      type,
      lesson,
      data,
      sourceInput: source || null,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error calculating score:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    if (client) await client.close();
  }
}
