import { ObjectId } from 'mongodb';
import { getStudentLesson } from './studentLessons';

export function isQuizScoreText(value) {
  if (value == null || value === '') return false;
  if (value === 'No Quiz' || value === "Didn't Attend The Quiz") return false;
  const str = String(value).trim();
  return /\d+\s*\/\s*\d+/.test(str) || /^\d+$/.test(str);
}

export function hasOnlineHomeworkResult(student, homeworkId) {
  return (student.online_homeworks || []).some(
    (entry) => String(entry?.homework_id ?? '') === String(homeworkId),
  );
}

export function hasOnlineQuizResult(student, quizId) {
  return (student.online_quizzes || []).some(
    (entry) => String(entry?.quiz_id ?? '') === String(quizId),
  );
}

export function isClassroomHomeworkComplete(student, lessonName) {
  const lessonData = getStudentLesson(student?.lessons, lessonName);
  if (!lessonData) return false;
  if (lessonData.hwDone === true) return true;
  const degree = lessonData.homework_degree;
  return degree != null && String(degree).trim() !== '';
}

export function isClassroomQuizComplete(student, lessonName) {
  const qd = getStudentLesson(student?.lessons, lessonName)?.quizDegree;
  if (qd === 'No Quiz') return true;
  return isQuizScoreText(qd);
}

function hasOtherOnlineHomeworkCompletedForLesson(student, lessonName, homeworkId, lessonByHomeworkId) {
  return (student.online_homeworks || []).some((entry) => {
    const id = String(entry?.homework_id ?? '');
    if (!id || id === String(homeworkId)) return false;
    return lessonByHomeworkId.get(id) === lessonName;
  });
}

function hasOtherOnlineQuizCompletedForLesson(student, lessonName, quizId, lessonByQuizId) {
  return (student.online_quizzes || []).some((entry) => {
    const id = String(entry?.quiz_id ?? '');
    if (!id || id === String(quizId)) return false;
    return lessonByQuizId.get(id) === lessonName;
  });
}

/**
 * Whether this exact homework item is completed (online submission or classroom for this lesson).
 * Does NOT treat lessons[lesson].hwDone from another item in the same lesson as completion.
 */
export function isHomeworkItemCompleted(student, homeworkId, lessonName, lessonByHomeworkId = new Map()) {
  const lesson = String(lessonName || '').trim();
  if (!lesson) return false;

  if (hasOnlineHomeworkResult(student, homeworkId)) return true;

  if (hasOtherOnlineHomeworkCompletedForLesson(student, lesson, homeworkId, lessonByHomeworkId)) {
    return false;
  }

  return isClassroomHomeworkComplete(student, lesson);
}

/**
 * Whether this exact quiz item is completed (online submission or classroom for this lesson).
 */
export function isQuizItemCompleted(student, quizId, lessonName, lessonByQuizId = new Map()) {
  const lesson = String(lessonName || '').trim();
  if (!lesson) return false;

  if (hasOnlineQuizResult(student, quizId)) return true;

  if (hasOtherOnlineQuizCompletedForLesson(student, lesson, quizId, lessonByQuizId)) {
    return false;
  }

  return isClassroomQuizComplete(student, lesson);
}

/** Safe to write lessons[lesson].hwDone = false without clobbering another item's completion. */
export function canUpdateLessonHwDoneOnMiss(student, homeworkId, lessonName, lessonByHomeworkId = new Map()) {
  const lesson = String(lessonName || '').trim();
  if (!lesson) return false;
  if (hasOtherOnlineHomeworkCompletedForLesson(student, lesson, homeworkId, lessonByHomeworkId)) {
    return false;
  }
  if (isClassroomHomeworkComplete(student, lesson)) return false;
  return true;
}

/** Safe to write lessons[lesson].quizDegree = "Didn't Attend The Quiz" without clobbering another quiz. */
export function canUpdateLessonQuizDegreeOnMiss(student, quizId, lessonName, lessonByQuizId = new Map()) {
  const lesson = String(lessonName || '').trim();
  if (!lesson) return false;
  if (hasOtherOnlineQuizCompletedForLesson(student, lesson, quizId, lessonByQuizId)) {
    return false;
  }
  const qd = getStudentLesson(student?.lessons, lesson)?.quizDegree;
  if (isQuizScoreText(qd) || qd === 'No Quiz') return false;
  return true;
}

function toObjectId(value) {
  try {
    if (value == null || value === '') return null;
    if (value instanceof ObjectId) return value;
    return new ObjectId(String(value));
  } catch {
    return null;
  }
}

export async function buildHomeworkLessonMap(db, student) {
  const map = new Map();
  const ids = [...new Set(
    (student.online_homeworks || [])
      .map((entry) => entry?.homework_id)
      .filter((id) => id != null && String(id).trim() !== ''),
  )];
  if (!ids.length) return map;

  const objectIds = ids.map(toObjectId).filter(Boolean);
  if (!objectIds.length) return map;

  const docs = await db.collection('homeworks')
    .find({ _id: { $in: objectIds } })
    .project({ lesson: 1 })
    .toArray();

  for (const doc of docs) {
    map.set(String(doc._id), String(doc.lesson || '').trim());
  }
  return map;
}

export async function buildQuizLessonMap(db, student) {
  const map = new Map();
  const ids = [...new Set(
    (student.online_quizzes || [])
      .map((entry) => entry?.quiz_id)
      .filter((id) => id != null && String(id).trim() !== ''),
  )];
  if (!ids.length) return map;

  const objectIds = ids.map(toObjectId).filter(Boolean);
  if (!objectIds.length) return map;

  const docs = await db.collection('quizzes')
    .find({ _id: { $in: objectIds } })
    .project({ lesson: 1 })
    .toArray();

  for (const doc of docs) {
    map.set(String(doc._id), String(doc.lesson || '').trim());
  }
  return map;
}
