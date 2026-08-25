import {
  DEFAULT_SYSTEM_BACKGROUND,
  loadSystemBackgroundFromEnv,
  parseSystemBackground,
} from '../../../lib/systemColors';

/**
 * Render-blocking CSS for SYSTEM_COLORS.
 * Linked from _document so the first paint already uses the env background.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  let background = DEFAULT_SYSTEM_BACKGROUND;
  try {
    background = loadSystemBackgroundFromEnv();
  } catch {
    background = parseSystemBackground(process.env.SYSTEM_COLORS);
  }

  const css = `:root{--system-page-bg:${background}!important;}html,body{background:var(--system-page-bg)!important;background-attachment:fixed!important;}`;

  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  return res.status(200).send(css);
}
