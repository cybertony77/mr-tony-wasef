/**
 * Egypt/Cairo display datetime: "11/07/2026 at 02:34 PM"
 */
export function formatCertificateDateTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const period = get('dayPeriod');
  return `${day}/${month}/${year} at ${hour}:${minute} ${period}`;
}

export function parseStudentsCsv(students) {
  if (!students) return [];
  if (Array.isArray(students)) {
    return students.map((id) => String(id).trim()).filter(Boolean);
  }
  return String(students)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function studentsCsvFromIds(ids) {
  const unique = [...new Set((ids || []).map((id) => String(id).trim()).filter(Boolean))];
  return unique.join(', ');
}

export function studentHasCertificate(studentsField, studentId) {
  const ids = parseStudentsCsv(studentsField);
  const target = String(studentId);
  return ids.some((id) => id === target || Number(id) === Number(target));
}

/** Normalize stored certificate_image to a Cloudinary public_id under certificates/ */
export function normalizeCertificateImagePublicId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('certificates/')) return raw;
  // Signed/delivery URLs — extract public id after /upload/.../
  const uploadMatch = raw.match(/\/upload\/(?:[^/]+\/)*v\d+\/(.+?)(?:\.[a-z0-9]+)?(?:\?|$)/i);
  if (uploadMatch?.[1]) {
    const id = decodeURIComponent(uploadMatch[1]);
    return id.startsWith('certificates/') ? id : `certificates/${id}`;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) {
    return '';
  }
  return raw.includes('/') ? raw : `certificates/${raw}`;
}
