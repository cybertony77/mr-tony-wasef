/**
 * MongoDB dotted update paths treat "." as nesting.
 * A lesson named "1. tester" must be stored as lessons["1. tester"], never via
 * $set { "lessons.1. tester.attended": true } (that creates lessons["1"][" tester"]).
 */

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** True if value looks like a student lesson record (not a nested corruption map). */
export function isStudentLessonRecord(value) {
  if (!isPlainObject(value)) return false;
  return (
    'attended' in value ||
    'hwDone' in value ||
    'quizDegree' in value ||
    'homework_degree' in value ||
    'message_state' in value ||
    'lastAttendance' in value ||
    'paid' in value
  );
}

export function createDefaultStudentLesson(lessonName, overrides = {}) {
  return {
    lesson: lessonName,
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
    ...overrides,
  };
}

/**
 * Read lesson data for a lesson name, recovering from dotted-path corruption
 * (e.g. "1. tester" wrongly stored as lessons["1"][" tester"]).
 */
export function getStudentLesson(lessons, lessonName) {
  if (!isPlainObject(lessons) || lessonName == null || lessonName === '') return null;

  const direct = lessons[lessonName];
  if (isStudentLessonRecord(direct)) return direct;

  if (typeof lessonName === 'string' && lessonName.includes('.')) {
    const parts = lessonName.split('.');
    let node = lessons;
    for (const part of parts) {
      if (!isPlainObject(node)) return null;
      node = node[part];
    }
    if (isStudentLessonRecord(node)) return node;
  }

  return null;
}

/**
 * Remove nested corruption produced by Mongo dotted paths for this lesson name.
 * Does not remove a real lesson whose name is a prefix (e.g. lesson "1").
 */
function pruneCorruptedLessonNest(lessons, lessonName) {
  if (!isPlainObject(lessons) || typeof lessonName !== 'string' || !lessonName.includes('.')) {
    return;
  }

  const parts = lessonName.split('.');
  if (parts.length < 2) return;

  const stack = [];
  let node = lessons;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!isPlainObject(node) || !(part in node)) return;
    stack.push({ parent: node, key: part });
    node = node[part];
  }

  const leaf = stack[stack.length - 1];
  if (!isStudentLessonRecord(leaf.parent[leaf.key]) && leaf.parent[leaf.key] !== undefined) {
    // leaf may still be the corrupted lesson record
  }
  if (!isStudentLessonRecord(node) && !isPlainObject(node)) return;

  // Delete leaf key
  delete leaf.parent[leaf.key];

  // Prune empty parents, but never delete a real lesson record at the top level
  for (let i = stack.length - 2; i >= 0; i--) {
    const { parent, key } = stack[i];
    const child = parent[key];
    if (!isPlainObject(child)) break;
    if (isStudentLessonRecord(child)) break;
    if (Object.keys(child).length === 0) {
      delete parent[key];
    } else {
      break;
    }
  }
}

/**
 * Return a new lessons object with `lessonName` set to merged lesson data.
 * Always uses a literal object key (safe for names containing ".").
 */
export function mergeStudentLesson(lessons, lessonName, patch = {}) {
  const next = isPlainObject(lessons) ? { ...lessons } : {};
  pruneCorruptedLessonNest(next, lessonName);

  const prev = getStudentLesson(lessons, lessonName) || createDefaultStudentLesson(lessonName);
  next[lessonName] = {
    ...prev,
    ...patch,
    lesson: lessonName,
  };
  return next;
}

/**
 * Build a Mongo $set payload that updates one lesson safely (whole lessons map).
 */
export function studentLessonsSetUpdate(lessons, lessonName, patch = {}) {
  return { lessons: mergeStudentLesson(lessons, lessonName, patch) };
}
