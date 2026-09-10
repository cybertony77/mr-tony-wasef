import Document, { Html, Head, Main, NextScript } from "next/document";
import {
  DEFAULT_SYSTEM_BACKGROUND,
  loadSystemBackgroundFromEnv,
} from "../lib/systemColors";
import { getServerSeoConfig } from "../lib/seoEnv.server";
import { absoluteMediaUrl, getDefaultDescription } from "../lib/seo";

function isYoutubeEmbedPath(ctx) {
  const path = String(ctx?.asPath || ctx?.pathname || ctx?.req?.url || "");
  return path.includes("/api/youtube/") || path.includes("/youtube-player/");
}

export default function MyDocument({
  systemBackground,
  youtubeEmbed,
  siteName,
  siteOrigin,
}) {
  const bg = youtubeEmbed ? "#000" : systemBackground || DEFAULT_SYSTEM_BACKGROUND;
  const name = siteName || "Attendance System";
  const defaultDesc = getDefaultDescription(name);
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

        {/* Theme & App Settings */}
        <meta name="theme-color" content={youtubeEmbed ? "#000000" : "#15cef3"} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={name} />
        <meta name="apple-touch-fullscreen" content="yes" />
        <meta name="application-name" content={name} />

        {/* Soft defaults; public pages set full SEO via SiteSeo */}
        <meta property="og:site_name" content={name} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:image" content={ogImage} />
        <meta name="description" content={defaultDesc} />

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

  let siteName = "Attendance System";
  let siteOrigin = "";
  try {
    const seo = getServerSeoConfig();
    siteName = seo.siteName;
    siteOrigin = seo.origin;
  } catch {
    /* keep defaults */
  }

  if (youtubeEmbed) {
    return {
      ...initialProps,
      systemBackground: "#000",
      youtubeEmbed: true,
      siteName,
      siteOrigin,
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
  };
};
