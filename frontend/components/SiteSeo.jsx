import Head from 'next/head';
import {
  absoluteMediaUrl,
  absoluteUrl,
  buildPageTitle,
  getDefaultDescription,
  getSiteName,
  getSiteOrigin,
  truncateMeta,
} from '../lib/seo';

function asJsonLd(data) {
  if (!data) return [];
  return Array.isArray(data) ? data.filter(Boolean) : [data];
}

/**
 * Pages Router SEO head.
 * Title template: "Page Title | SYSTEM_NAME"
 *
 * Pass siteName / origin from system config on the client when env vars
 * are not available in the browser.
 */
export default function SiteSeo({
  title,
  description,
  path = '/',
  image,
  type = 'website',
  keywords,
  noindex = false,
  /** When true, omit canonical (e.g. private signed URLs) */
  omitCanonical = false,
  jsonLd,
  siteName: siteNameProp,
  origin: originProp,
}) {
  const siteName = getSiteName(siteNameProp);
  const origin = getSiteOrigin(originProp);
  const fullTitle = buildPageTitle(title, siteName);
  const metaDescription = truncateMeta(
    description || getDefaultDescription(siteName)
  );
  const canonical = absoluteUrl(path, origin);
  const ogImage = absoluteMediaUrl(image || '/logo.png', origin);
  const robots = noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large';
  const keywordContent = Array.isArray(keywords)
    ? keywords.filter(Boolean).join(', ')
    : String(keywords || '').trim();
  const schemas = asJsonLd(jsonLd);

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      {keywordContent ? <meta name="keywords" content={keywordContent} /> : null}
      <meta key="robots" name="robots" content={robots} />
      <meta key="googlebot" name="googlebot" content={robots} />
      {!noindex && !omitCanonical ? (
        <link key="canonical" rel="canonical" href={canonical} />
      ) : null}

      <meta property="og:site_name" content={siteName} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      {!noindex && !omitCanonical ? (
        <meta property="og:url" content={canonical} />
      ) : null}
      <meta property="og:locale" content="en_US" />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={String(title || siteName)} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImage} />

      {schemas.map((schema, index) => (
        <script
          // eslint-disable-next-line react/no-danger
          key={`jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </Head>
  );
}
