import Head from "next/head";
import { useRouter } from "next/router";
import YoutubePlayerCore from "../../components/YoutubePlayerCore";

const YT_ID_RE = /^[a-zA-Z0-9_-]{6,20}$/;

function firstQuery(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseVideoId(router) {
  const fromQuery = String(firstQuery(router.query?.videoId) || "").trim();
  if (YT_ID_RE.test(fromQuery)) return fromQuery;

  const path = String(router.asPath || "").split("?")[0];
  const match = path.match(/\/(?:api\/youtube|youtube-player)\/([^/]+)/i);
  if (!match?.[1]) return "";
  try {
    const id = decodeURIComponent(match[1]).trim();
    return YT_ID_RE.test(id) ? id : "";
  } catch {
    return "";
  }
}

function parseSearchParam(asPath, key) {
  const q = String(asPath || "").split("?")[1] || "";
  if (!q) return "";
  try {
    return new URLSearchParams(q).get(key) || "";
  } catch {
    return "";
  }
}

/**
 * Bare embed shell served at /api/youtube/[videoId] via rewrite.
 * Keeps youtube.com out of the parent page's iframe src.
 */
export default function YoutubePlayerEmbedPage() {
  const router = useRouter();

  const youtubeVideoId = parseVideoId(router);

  const tfRaw = firstQuery(router.query?.tf) || parseSearchParam(router.asPath, "tf");
  const tfNum = Number(tfRaw);
  const thresholdFraction =
    Number.isFinite(tfNum) && tfNum > 0 && tfNum <= 1 ? tfNum : 0.1;

  const watermarkText =
    firstQuery(router.query?.wm) || parseSearchParam(router.asPath, "wm") || undefined;

  const hwRaw = String(
    firstQuery(router.query?.hw) || parseSearchParam(router.asPath, "hw") || ""
  );
  const hideWatermark = hwRaw === "1" || hwRaw === "true";

  return (
    <>
      <Head>
        <title>Video</title>
        <meta name="robots" content="noindex,nofollow" />
        <style>{`
          html, body, #__next {
            margin: 0 !important;
            padding: 0 !important;
            background: #000 !important;
            background-image: none !important;
            min-height: 100% !important;
            overflow: hidden !important;
          }
        `}</style>
      </Head>
      <div
        style={{
          position: "fixed",
          inset: 0,
          margin: 0,
          padding: 0,
          background: "#000",
          overflow: "hidden",
        }}
      >
        {youtubeVideoId ? (
          <YoutubePlayerCore
            youtubeVideoId={youtubeVideoId}
            thresholdFraction={thresholdFraction}
            watermarkText={watermarkText}
            hideWatermark={hideWatermark}
            notifyParent
            style={{
              width: "100%",
              height: "100%",
              maxHeight: "100%",
              aspectRatio: "auto",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
              fontSize: 14,
            }}
          >
            Invalid video
          </div>
        )}
      </div>
    </>
  );
}

YoutubePlayerEmbedPage.isYoutubeEmbedShell = true;
