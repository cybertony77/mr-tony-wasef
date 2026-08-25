import {
  createDefaultStudentLesson,
  getStudentLesson,
  mergeStudentLesson,
} from './studentLessons';
import {
  buildHomeworkLessonMap,
  buildQuizLessonMap,
  canUpdateLessonHwDoneOnMiss,
  canUpdateLessonQuizDegreeOnMiss,
  isHomeworkItemCompleted,
  isQuizItemCompleted,
} from './itemCompletion';
import { applyScoringEvent, SYSTEM_SCORING_SYSTEM } from '../pages/api/scoring/calculate';

async function ensureLessonObject(db, student) {
  if (student.lessons && !Array.isArray(student.lessons) && typeof student.lessons === 'object') {
    return student.lessons;
  }
  await db.collection('students').updateOne(
    { id: student.id },
    { $set: { lessons: {} } },
  );
  return {};
}

async function ensureLessonRecord(db, student, lessonName) {
  let lessons = await ensureLessonObject(db, student);
  if (!getStudentLesson(lessons, lessonName)) {
    lessons = mergeStudentLesson(lessons, lessonName, createDefaultStudentLesson(lessonName));
    await db.collection('students').updateOne(
      { id: student.id },
      { $set: { lessons } },
    );
  }
  return lessons;
}

async function setLessonHwDoneFalse(db, studentId, lessonName, { allowUpdate }) {
  if (!allowUpdate) {
    return { updated: false, reason: 'lesson_state_preserved' };
  }

  const student = await db.collection('students').findOne({ id: studentId });
  if (!student) throw new Error('Student not found');

  const lessons = await ensureLessonRecord(db, student, lessonName);
  const lessonData = getStudentLesson(lessons, lessonName);
  if (lessonData?.hwDone === false) {
    return { updated: false, reason: 'already_marked_missed' };
  }

  const nextLessons = mergeStudentLesson(lessons, lessonName, { hwDone: false });
  await db.collection('students').updateOne(
    { id: studentId },
    { $set: { lessons: nextLessons } },
  );
  return { updated: true, reason: 'marked_missed' };
}

async function setLessonQuizMissed(db, studentId, lessonName, { allowUpdate }) {
  if (!allowUpdate) {
    return { updated: false, reason: 'lesson_state_preserved' };
  }

  const student = await db.collection('students').findOne({ id: studentId });
  if (!student) throw new Error('Student not found');

  const lessons = await ensureLessonRecord(db, student, lessonName);
  const lessonData = getStudentLesson(lessons, lessonName);
  if (lessonData?.quizDegree === "Didn't Attend The Quiz") {
    return { updated: false, reason: 'already_marked_missed' };
  }

  const nextLessons = mergeStudentLesson(lessons, lessonName, {
    quizDegree: "Didn't Attend The Quiz",
  });
  await db.collection('students').updateOne(
    { id: studentId },
    { $set: { lessons: nextLessons } },
  );
  return { updated: true, reason: 'marked_missed' };
}

/**
 * Idempotent deadline homework processing.
 * Completion + scoring keyed by exact homeworkId.
 */
export async function processDeadlineHomework({ db, studentId, homeworkId, lesson }) {
  const lessonName = String(lesson || '').trim();
  const itemId = String(homeworkId);
  if (!lessonName || !itemId) {
    throw new Error('homeworkId and lesson are required');
  }

  const numericStudentId = parseInt(studentId, 10);
  const student = await db.collection('students').findOne({ id: numericStudentId });
  if (!student) throw new Error('Student not found');

  const lessonByHomeworkId = await buildHomeworkLessonMap(db, student);

  if (isHomeworkItemCompleted(student, itemId, lessonName, lessonByHomeworkId)) {
    return {
      success: true,
      skipped: true,
      skipReason: 'homework_already_completed',
      lessonUpdated: false,
      scoring: null,
    };
  }

  const allowLessonUpdate = canUpdateLessonHwDoneOnMiss(
    student,
    itemId,
    lessonName,
    lessonByHomeworkId,
  );
  const lessonResult = await setLessonHwDoneFalse(db, numericStudentId, lessonName, {
    allowUpdate: allowLessonUpdate,
  });

  let scoring = null;
  if (SYSTEM_SCORING_SYSTEM) {
    scoring = await applyScoringEvent({
      db,
      studentId: numericStudentId,
      type: 'homework',
      lesson: lessonName,
      data: { hwDone: false },
      sourceInput: {
        kind: 'deadline_homework',
        id: itemId,
        label: lessonName,
      },
    });
  }

  return {
    success: true,
    skipped: false,
    lessonUpdated: lessonResult.updated,
    lessonUpdateReason: lessonResult.reason,
    scoring,
    alreadyProcessed: scoring?.idempotentNoOp === true,
    pointsAdded: scoring?.pointsAdded ?? 0,
  };
}

/**
 * Idempotent deadline quiz processing.
 * Completion + scoring keyed by exact quizId.
 */
export async function processDeadlineQuiz({ db, studentId, quizId, lesson }) {
  const lessonName = String(lesson || '').trim();
  const itemId = String(quizId);
  if (!lessonName || !itemId) {
    throw new Error('quizId and lesson are required');
  }

  const numericStudentId = parseInt(studentId, 10);
  const student = await db.collection('students').findOne({ id: numericStudentId });
  if (!student) throw new Error('Student not found');

  const lessonByQuizId = await buildQuizLessonMap(db, student);

  if (isQuizItemCompleted(student, itemId, lessonName, lessonByQuizId)) {
    return {
      success: true,
      skipped: true,
      skipReason: 'quiz_already_completed',
      lessonUpdated: false,
      scoring: null,
    };
  }

  const allowLessonUpdate = canUpdateLessonQuizDegreeOnMiss(
    student,
    itemId,
    lessonName,
    lessonByQuizId,
  );
  const lessonResult = await setLessonQuizMissed(db, numericStudentId, lessonName, {
    allowUpdate: allowLessonUpdate,
  });

  let scoring = null;
  if (SYSTEM_SCORING_SYSTEM) {
    scoring = await applyScoringEvent({
      db,
      studentId: numericStudentId,
      type: 'quiz',
      lesson: lessonName,
      data: { percentage: 0 },
      sourceInput: {
        kind: 'deadline_quiz',
        id: itemId,
        label: lessonName,
      },
    });
  }

  return {
    success: true,
    skipped: false,
    lessonUpdated: lessonResult.updated,
    lessonUpdateReason: lessonResult.reason,
    scoring,
    alreadyProcessed: scoring?.idempotentNoOp === true,
    pointsAdded: scoring?.pointsAdded ?? 0,
  };
}
