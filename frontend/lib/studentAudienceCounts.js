/**
 * Audience counts for Zoom / Google Meet course + course-type targeting.
 */

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function buildStudentAudienceCounts(students = []) {
  const list = Array.isArray(students) ? students : [];
  const byCourse = Object.create(null);
  const byType = Object.create(null);
  const byCourseAndType = Object.create(null);
  let total = 0;

  for (const s of list) {
    total += 1;
    const course = String(s?.course ?? '').trim();
    const type = String(s?.courseType ?? '').trim();
    const courseKey = norm(course);
    const typeKey = norm(type);

    if (courseKey) {
      byCourse[courseKey] = (byCourse[courseKey] || 0) + 1;
    }
    if (typeKey) {
      byType[typeKey] = (byType[typeKey] || 0) + 1;
    }
    if (courseKey || typeKey) {
      const both = `${courseKey}||${typeKey}`;
      byCourseAndType[both] = (byCourseAndType[both] || 0) + 1;
    }
  }

  return { byCourse, byType, byCourseAndType, total };
}

/** Students with this course (or all students when course is "All"). */
export function getCourseStudentCount(counts, courseName) {
  if (!counts) return 0;
  const key = norm(courseName);
  if (!key) return 0;
  if (key === 'all') return counts.total || 0;
  return counts.byCourse[key] || 0;
}

/**
 * Students with this course type.
 * When a specific course is selected (not All/empty), counts course + type together.
 */
export function getCourseTypeStudentCount(counts, courseName, courseType) {
  if (!counts) return 0;
  const typeKey = norm(courseType);
  if (!typeKey) return 0;
  const courseKey = norm(courseName);
  if (!courseKey || courseKey === 'all') {
    return counts.byType[typeKey] || 0;
  }
  return counts.byCourseAndType[`${courseKey}||${typeKey}`] || 0;
}

/** Same matching rules as join-zoom/google student APIs. */
export function countMeetingAudience(students, course, courseType, isNational = false) {
  const list = Array.isArray(students) ? students : [];
  const meetingCourse = norm(course);
  const meetingType = isNational ? '' : norm(courseType);

  return list.filter((s) => {
    const studentCourse = norm(s?.course);
    const courseMatch = meetingCourse === 'all' || meetingCourse === studentCourse;
    if (!courseMatch) return false;
    if (!meetingType) return true;
    return norm(s?.courseType) === meetingType;
  }).length;
}

export function formatStudentCountLabel(count) {
  const n = Number(count);
  const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
  return `${safe} ${safe === 1 ? 'student' : 'students'}`;
}
