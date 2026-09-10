import {
  absoluteUrl,
  INDEXABLE_PATHS,
} from '../lib/seo';
import { getServerSeoConfig } from '../lib/seoEnv.server';

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc, changefreq = 'weekly', priority = '0.7') {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function SiteMap() {
  return null;
}

export async function getServerSideProps({ res }) {
  const { origin } = getServerSeoConfig();

  // ONLY genuinely public indexable routes — never student_info or signed URLs
  const priorityByPath = {
    '/': '1.0',
    '/welcome': '0.9',
    '/sign-up': '0.8',
    '/leave-a-review': '0.7',
    '/contact_assistants': '0.6',
    '/contact_developer': '0.5',
  };

  const urls = INDEXABLE_PATHS.map((path) =>
    urlEntry(
      absoluteUrl(path, origin),
      path === '/' || path === '/welcome' ? 'weekly' : 'monthly',
      priorityByPath[path] || '0.5'
    )
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=86400'
  );
  res.write(xml);
  res.end();

  return { props: {} };
}

export default SiteMap;
