/**
 * Allowlisted public student payload — never spread the full Mongo document.
 * Includes fields the parent public link UI needs; excludes internal/admin-only data.
 */
export function toPublicStudentPayload(student, extras = {}) {
  if (!student) return null;

  const lessons = student.lessons && typeof student.lessons === 'object' ? student.lessons : {};

  return {
    id: student.id,
    name: student.name ?? null,
    phone: student.phone ?? null,
    parents_phone: student.parents_phone ?? student.parentsPhone ?? null,
    parentsPhone: student.parentsPhone ?? student.parents_phone ?? null,
    grade: student.grade ?? null,
    course: student.course ?? null,
    courseType: student.courseType ?? null,
    school: student.school ?? null,
    center: student.center ?? null,
    gender: student.gender ?? null,
    account_state: student.account_state ?? null,
    lessons,
    score: student.score ?? null,
    payment: student.payment
      ? {
          numberOfSessions: student.payment.numberOfSessions ?? null,
          amount: student.payment.amount ?? null,
        }
      : null,
    profile_picture: student.profile_picture ?? null,
    homework_video_lessons: extras.homework_video_lessons ?? [],
  };
}
