export function getHomeworkVideoLessonsForStudent(sessions, student, nationalSystem) {
  if (!Array.isArray(sessions) || !student) return [];

  const studentCourse = String(student.course || '').trim().toLowerCase();
  const studentCourseType = String(student.courseType || '').trim().toLowerCase();

  return [...new Set(
    sessions
      .filter((session) => {
        const lesson = String(session?.lesson || '').trim();
        if (!lesson) return false;

        const sessionState = session.state || session.account_state || 'Activated';
        if (sessionState === 'Deactivated') return false;

        const sessionCourse = String(session.course || '').trim().toLowerCase();
        const sessionCourseType = String(session.courseType || '').trim().toLowerCase();
        const courseMatches =
          sessionCourse === 'all' || (studentCourse && sessionCourse === studentCourse);
        const courseTypeMatches =
          nationalSystem ||
          !sessionCourseType ||
          !studentCourseType ||
          sessionCourseType === studentCourseType;

        return courseMatches && courseTypeMatches;
      })
      .map((session) => String(session.lesson).trim())
  )];
}
