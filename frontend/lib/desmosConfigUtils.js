export function desmosConfigKey(course, courseType) {
  const c = String(course ?? '').trim().toLowerCase();
  const t = String(courseType ?? '').trim().toLowerCase();
  return `${c}::${t}`;
}

export function resolveStudentCourse(student) {
  if (!student) return '';
  return String(student.course || student.grade || '').trim();
}

export function filterDesmosConfigItems(items, isNational) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (String(item.courseType ?? '').trim().toLowerCase() === 'both') return false;
    if (isNational && item.courseType) return false;
    return Boolean(String(item.course ?? '').trim());
  });
}

export function buildDefaultDesmosConfig(courses, courseTypes, isNational) {
  const list = Array.isArray(courses) ? courses.filter(Boolean) : [];
  if (list.length === 0) return [];

  if (isNational) {
    return list.map((course) => ({
      course: String(course).trim(),
      courseType: null,
      enabled: true,
    }));
  }

  const types = Array.isArray(courseTypes) ? courseTypes.filter(Boolean) : [];
  const items = [];
  for (const course of list) {
    for (const courseType of types) {
      items.push({
        course: String(course).trim(),
        courseType: String(courseType).trim(),
        enabled: true,
      });
    }
  }
  return items;
}

export function mergeDesmosConfig(defaults, stored) {
  const storedMap = new Map(
    (Array.isArray(stored) ? stored : []).map((item) => [
      desmosConfigKey(item.course, item.courseType),
      item,
    ])
  );

  return defaults.map((item) => {
    const saved = storedMap.get(desmosConfigKey(item.course, item.courseType));
    if (!saved) return item;
    return {
      ...item,
      enabled: saved.enabled !== false,
    };
  });
}

export function normalizeDesmosConfigItem(item, isNational = false) {
  const course = String(item?.course ?? '').trim();
  if (!course) return null;

  if (isNational) {
    return {
      course,
      courseType: null,
      enabled: item?.enabled !== false,
    };
  }

  const rawType = item?.courseType;
  if (String(rawType ?? '').trim().toLowerCase() === 'both') return null;

  const courseType =
    rawType === null || rawType === undefined || String(rawType).trim() === ''
      ? null
      : String(rawType).trim();

  if (!courseType) return null;

  return {
    course,
    courseType,
    enabled: item?.enabled !== false,
  };
}

/**
 * Show Desmos when desmos_integrations is on and a matching enabled config row exists.
 * Empty DB config defaults to visible (open) for all courses/grades.
 */
export function isDesmosVisibleForStudent(items, studentCourse, studentCourseType, isNational) {
  const course = String(studentCourse ?? '').trim().toLowerCase();
  if (!course) return false;

  const list = filterDesmosConfigItems(items, isNational);
  if (list.length === 0) return true;

  const enabledItems = list.filter((item) => item.enabled !== false);
  if (enabledItems.length === 0) return false;

  const studentType = String(studentCourseType ?? '').trim().toLowerCase();

  return enabledItems.some((item) => {
    if (String(item.course ?? '').trim().toLowerCase() !== course) return false;
    if (isNational) return true;

    const entryType = String(item.courseType ?? '').trim().toLowerCase();
    if (!entryType) return false;
    if (!studentType) return false;
    return entryType === studentType;
  });
}

export function formatCourseTypeLabel(courseType) {
  if (!courseType) return '';
  const str = String(courseType);
  return str.charAt(0).toUpperCase() + str.slice(1);
}
