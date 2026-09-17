import Document, { Html, Head, Main, NextScript } from "next/document";
import {
  DEFAULT_SYSTEM_BACKGROUND,
  loadSystemBackgroundFromEnv,
} from "../lib/systemColors";
import { getServerSeoConfig } from "../lib/seoEnv.server";
import {
  absoluteMediaUrl,
  buildPageTitle,
  getPageSeo,
  normalizeSeoPath,
} from "../lib/seo";

function isYoutubeEmbedPath(ctx) {
  const path = String(ctx?.asPath || ctx?.pathname || ctx?.req?.url || "");
  return path.includes("/api/youtube/") || path.includes("/youtube-player/");
}

function resolveRequestPath(ctx) {
  const raw = String(ctx?.asPath || ctx?.pathname || ctx?.req?.url || "/");
  return normalizeSeoPath(raw);
}

export default function MyDocument({
  systemBackground,
  youtubeEmbed,
  siteName,
  siteOrigin,
  pageSeo,
}) {
  const bg = youtubeEmbed ? "#000" : systemBackground || DEFAULT_SYSTEM_BACKGROUND;
  const name = siteName || "Attendance System";
  const seo = pageSeo || getPageSeo("/", name);
  const fullTitle = buildPageTitle(seo.title, name);
  const ogImage = absoluteMediaUrl("/logo.png", siteOrigin);

  return (
    <Html lang="en" style={youtubeEmbed ? { background: "#000" } : undefined}>
      <Head>
        {youtubeEmbed ? (
          <style
            dangerouslySetInnerHTML={{
              __html: `
                :root { --system-page-bg: #000 !important; }
                html, body, #__next {
                  margin: 0 !important;
                  padding: 0 !important;
                  min-height: 100% !important;
                  background: #000 !important;
                  background-image: none !important;
                  background-attachment: scroll !important;
                  overflow: hidden !important;
                  color: #fff !important;
                }
              `,
            }}
          />
        ) : (
          <>
            {/* Render-blocking: first paint uses env SYSTEM_COLORS (no wrong-color flash) */}
            <link rel="stylesheet" href="/api/system/colors.css" />
            <style
              dangerouslySetInnerHTML={{
                __html: `:root{--system-page-bg:${bg};}html,body{background:var(--system-page-bg);background-attachment:fixed;}`,
              }}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `(function(){try{var b=${JSON.stringify(bg)};document.documentElement.style.setProperty('--system-page-bg',b);sessionStorage.setItem('system-page-bg',b);}catch(e){}})();`,
              }}
            />
          </>
        )}

        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Font Awesome */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css"
        />

        {/* Theme & App Settings — page-level SiteSeo overrides titles/descriptions */}
        <meta name="theme-color" content={youtubeEmbed ? "#000000" : "#1FA8DC"} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={name} />
        <meta name="apple-touch-fullscreen" content="yes" />
        <meta name="application-name" content={name} />

        {/*
          Path-specific SSR defaults for crawlers (WhatsApp, etc.).
          Stable keys let SiteSeo replace these on hydrate / navigation.
        */}
        <meta key="description" name="description" content={seo.description} />
        <meta key="og:site_name" property="og:site_name" content={name} />
        <meta key="og:type" property="og:type" content="website" />
        <meta key="og:locale" property="og:locale" content="en_US" />
        <meta key="og:title" property="og:title" content={fullTitle} />
        <meta key="og:description" property="og:description" content={seo.description} />
        <meta key="og:image" property="og:image" content={ogImage} />

        {/* Camera Permission Policy */}
        <meta httpEquiv="Permissions-Policy" content="camera=(self)" />

        {/* Icons for iOS */}
        <link rel="apple-touch-icon" href="/icons/apple-icon-180.png" />
      </Head>
      <body style={youtubeEmbed ? { background: "#000", margin: 0 } : undefined}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

MyDocument.getInitialProps = async (ctx) => {
  const initialProps = await Document.getInitialProps(ctx);
  const youtubeEmbed = isYoutubeEmbedPath(ctx);
  const requestPath = resolveRequestPath(ctx);

  let siteName = "Attendance System";
  let siteOrigin = "";
  try {
    const seo = getServerSeoConfig();
    siteName = seo.siteName;
    siteOrigin = seo.origin;
  } catch {
    /* keep defaults */
  }

  const pageSeo = getPageSeo(requestPath, siteName);

  if (youtubeEmbed) {
    return {
      ...initialProps,
      systemBackground: "#000",
      youtubeEmbed: true,
      siteName,
      siteOrigin,
      pageSeo,
    };
  }

  let systemBackground = DEFAULT_SYSTEM_BACKGROUND;
  try {
    systemBackground = loadSystemBackgroundFromEnv();
  } catch {
    /* keep default */
  }
  return {
    ...initialProps,
    systemBackground,
    youtubeEmbed: false,
    siteName,
    siteOrigin,
    pageSeo,
  };
};
