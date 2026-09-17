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
 * Meta tags use stable `key`s so they replace _document defaults
 * (critical for WhatsApp / crawler link previews).
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
      <meta key="description" name="description" content={metaDescription} />
      {keywordContent ? (
        <meta key="keywords" name="keywords" content={keywordContent} />
      ) : null}
      <meta key="robots" name="robots" content={robots} />
      <meta key="googlebot" name="googlebot" content={robots} />
      {!noindex && !omitCanonical ? (
        <link key="canonical" rel="canonical" href={canonical} />
      ) : null}

      <meta key="og:site_name" property="og:site_name" content={siteName} />
      <meta key="og:type" property="og:type" content={type} />
      <meta key="og:title" property="og:title" content={fullTitle} />
      <meta
        key="og:description"
        property="og:description"
        content={metaDescription}
      />
      {!noindex && !omitCanonical ? (
        <meta key="og:url" property="og:url" content={canonical} />
      ) : null}
      <meta key="og:locale" property="og:locale" content="en_US" />
      <meta key="og:image" property="og:image" content={ogImage} />
      <meta
        key="og:image:alt"
        property="og:image:alt"
        content={String(title || siteName)}
      />

      <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
      <meta key="twitter:title" name="twitter:title" content={fullTitle} />
      <meta
        key="twitter:description"
        name="twitter:description"
        content={metaDescription}
      />
      <meta key="twitter:image" name="twitter:image" content={ogImage} />

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
