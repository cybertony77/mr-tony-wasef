/**
 * Sort students A–Z by name (case-insensitive). Safe for empty/undefined lists.
 */
export function sortStudentsByName(students) {
  if (!Array.isArray(students) || students.length <= 1) {
    return Array.isArray(students) ? [...students] : [];
  }
  return [...students].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  );
}
