/** @param {string | null | undefined} url */
export function toYoutubeEmbed(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/,
  ];
  for (const p of patterns) {
    const m = u.match(p);
    if (m?.[1]) {
      return `/api/youtube/${encodeURIComponent(m[1])}?hw=1`;
    }
  }
  return null;
}

export function formatScheduleCourse(course) {
  const c = (course || '').trim();
  if (c.toLowerCase() === 'all') return 'Basics';
  return c || '—';
}

export function formatScheduleLocation(centerName, location) {
  const name = (centerName || '').trim();
  if (name.toLowerCase() === 'online') return 'Online';
  const loc = (location || '').trim();
  return loc || 'No Location';
}

/** @param {string} name */
export function socialIconSrc(name) {
  const n = (name || '').trim().toLowerCase();
  if (n.includes('facebook')) return '/facebook.svg';
  if (n.includes('instagram')) return '/instagram.svg';
  if (n.includes('tiktok')) return '/tiktok.svg';
  if (n.includes('telegram')) return '/telegram.svg';
  if (n.includes('youtube')) return '/youtube.svg';
  if (n.includes('snapchat')) return '/snapchat.svg';
  if (n.includes('whatsapp')) return '/whatsapp.svg';
  if (n.includes('drive')) return '/drive.svg';
  if (n.includes('website')) return '/online2.svg';
  return '/link2.svg';
}

export function isWhatsAppLinkName(name) {
  return (name || '').trim().toLowerCase().includes('whatsapp');
}

export function formatTeached(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return null;
  const v = Number(n);
  return `${v.toLocaleString('en-US')}+`;
}

export function formatYears(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return null;
  return String(Number(n));
}

/** @param {Array<{ name?: string, location?: string, grades?: Array<unknown> }>} centers */
export function buildCenterScheduleRows(centers) {
  const rows = [];
  if (!Array.isArray(centers)) return rows;
  centers.forEach((center) => {
    if (!center?.grades?.length) return;
    center.grades.forEach((gradeData) => {
      if (!gradeData?.timings?.length) return;
      gradeData.timings.forEach((timing) => {
        const rawCourse = gradeData.course || gradeData.grade || '';
        const centerName = center.name || '';
        rows.push({
          center: centerName,
          course: rawCourse,
          courseType: gradeData.courseType || '',
          day: timing.day,
          time: `${timing.time} ${timing.period || ''}`.trim(),
          location: center.location || null,
          course_display:
            String(rawCourse).trim().toLowerCase() === 'all' ? 'Basics' : rawCourse || '—',
          location_display:
            String(centerName).trim().toLowerCase() === 'online'
              ? 'Online'
              : (center.location && String(center.location).trim()) || 'No Location',
        });
      });
    });
  });
  return rows;
}
