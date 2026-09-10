import { absoluteUrl } from '../lib/seo';
import { getServerSeoConfig } from '../lib/seoEnv.server';

function Robots() {
  return null;
}

export async function getServerSideProps({ res }) {
  const { origin } = getServerSeoConfig();
  const sitemapUrl = absoluteUrl('/sitemap.xml', origin);

  const body = `# ${origin}
User-agent: *
Allow: /
Allow: /sign-up
Allow: /welcome
Allow: /leave-a-review
Allow: /contact_assistants
Allow: /contact_developer
Allow: /logo.png
Allow: /icons/

# Private / authenticated / sensitive areas (robots.txt is NOT security)
Disallow: /dashboard
Disallow: /dashboard/
Disallow: /student_dashboard
Disallow: /student_dashboard/
Disallow: /manage_assistants
Disallow: /manage_assistants/
Disallow: /subscription_dashboard
Disallow: /subscription_dashboard/
Disallow: /edit_my_profile
Disallow: /forgot_password
Disallow: /student_not_found
Disallow: /youtube-player
Disallow: /youtube-player/
Disallow: /api/

Sitemap: ${sitemapUrl}
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, stale-while-revalidate=604800'
  );
  res.write(body);
  res.end();

  return { props: {} };
}

export default Robots;
