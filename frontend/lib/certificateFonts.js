/**
 * Certificate fonts — Google Fonts only (UI + PNG).
 * System fonts were falling back to sans-serif; every option here has a
 * downloadable TTF for preview/PNG parity.
 */

function gs(slug, weight = 400) {
  return `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@5.2.5/latin-${weight}-normal.ttf`;
}

/**
 * @typedef {{
 *   name: string,
 *   google: string,
 *   cssFamily?: string,
 *   fontsource: string,
 *   weight?: number,
 * }} CertFont
 */

/** @type {CertFont[]} */
export const CERTIFICATE_FONTS = [
  // ——— Modern sans ———
  { name: 'Roboto', google: 'Roboto:wght@400;700', fontsource: 'roboto', weight: 700 },
  { name: 'Open Sans', google: 'Open Sans:wght@400;700', fontsource: 'open-sans', weight: 700 },
  { name: 'Montserrat', google: 'Montserrat:wght@400;700', fontsource: 'montserrat', weight: 700 },
  { name: 'Lato', google: 'Lato:wght@400;700', fontsource: 'lato', weight: 700 },
  { name: 'Poppins', google: 'Poppins:wght@400;700', fontsource: 'poppins', weight: 700 },
  { name: 'Nunito', google: 'Nunito:wght@400;700', fontsource: 'nunito', weight: 700 },
  { name: 'Raleway', google: 'Raleway:wght@400;700', fontsource: 'raleway', weight: 700 },
  { name: 'Ubuntu', google: 'Ubuntu:wght@400;700', fontsource: 'ubuntu', weight: 700 },
  { name: 'Oswald', google: 'Oswald:wght@400;700', fontsource: 'oswald', weight: 700 },
  { name: 'Inter', google: 'Inter:wght@400;700', fontsource: 'inter', weight: 700 },
  { name: 'Source Sans 3', google: 'Source Sans 3:wght@400;700', fontsource: 'source-sans-3', weight: 700 },
  { name: 'Work Sans', google: 'Work Sans:wght@400;700', fontsource: 'work-sans', weight: 700 },
  { name: 'Rubik', google: 'Rubik:wght@400;700', fontsource: 'rubik', weight: 700 },
  { name: 'Mukta', google: 'Mukta:wght@400;700', fontsource: 'mukta', weight: 700 },
  { name: 'Josefin Sans', google: 'Josefin Sans:wght@400;700', fontsource: 'josefin-sans', weight: 700 },
  { name: 'Quicksand', google: 'Quicksand:wght@400;700', fontsource: 'quicksand', weight: 700 },
  { name: 'Cabin', google: 'Cabin:wght@400;700', fontsource: 'cabin', weight: 700 },
  { name: 'Barlow', google: 'Barlow:wght@400;700', fontsource: 'barlow', weight: 700 },
  { name: 'Manrope', google: 'Manrope:wght@400;700', fontsource: 'manrope', weight: 700 },
  { name: 'DM Sans', google: 'DM Sans:wght@400;700', fontsource: 'dm-sans', weight: 700 },
  { name: 'Outfit', google: 'Outfit:wght@400;700', fontsource: 'outfit', weight: 700 },
  { name: 'Figtree', google: 'Figtree:wght@400;700', fontsource: 'figtree', weight: 700 },
  { name: 'Plus Jakarta Sans', google: 'Plus Jakarta Sans:wght@400;700', fontsource: 'plus-jakarta-sans', weight: 700 },
  { name: 'Sora', google: 'Sora:wght@400;700', fontsource: 'sora', weight: 700 },
  { name: 'Space Grotesk', google: 'Space Grotesk:wght@400;700', fontsource: 'space-grotesk', weight: 700 },

  // ——— Elegant / premium serif ———
  { name: 'Playfair Display', google: 'Playfair Display:wght@400;700', fontsource: 'playfair-display', weight: 700 },
  { name: 'Playfair Display SC', google: 'Playfair Display SC:wght@400;700', fontsource: 'playfair-display-sc', weight: 700 },
  { name: 'Cormorant Garamond', google: 'Cormorant Garamond:wght@400;700', fontsource: 'cormorant-garamond', weight: 700 },
  { name: 'Cormorant', google: 'Cormorant:wght@400;700', fontsource: 'cormorant', weight: 700 },
  { name: 'Cormorant Infant', google: 'Cormorant Infant:wght@400;700', fontsource: 'cormorant-infant', weight: 700 },
  { name: 'EB Garamond', google: 'EB Garamond:wght@400;700', fontsource: 'eb-garamond', weight: 700 },
  { name: 'Libre Baskerville', google: 'Libre Baskerville:wght@400;700', fontsource: 'libre-baskerville', weight: 700 },
  { name: 'Libre Caslon Text', google: 'Libre Caslon Text:wght@400;700', fontsource: 'libre-caslon-text', weight: 700 },
  { name: 'Libre Caslon Display', google: 'Libre Caslon Display', fontsource: 'libre-caslon-display', weight: 400 },
  { name: 'Lora', google: 'Lora:wght@400;700', fontsource: 'lora', weight: 700 },
  { name: 'Merriweather', google: 'Merriweather:wght@400;700', fontsource: 'merriweather', weight: 700 },
  { name: 'Spectral', google: 'Spectral:wght@400;700', fontsource: 'spectral', weight: 700 },
  { name: 'Cardo', google: 'Cardo:wght@400;700', fontsource: 'cardo', weight: 700 },
  { name: 'Crimson Text', google: 'Crimson Text:wght@400;700', fontsource: 'crimson-text', weight: 700 },
  { name: 'Crimson Pro', google: 'Crimson Pro:wght@400;700', fontsource: 'crimson-pro', weight: 700 },
  { name: 'Source Serif 4', google: 'Source Serif 4:wght@400;700', fontsource: 'source-serif-4', weight: 700 },
  { name: 'Noto Serif', google: 'Noto Serif:wght@400;700', fontsource: 'noto-serif', weight: 700 },
  { name: 'PT Serif', google: 'PT Serif:wght@400;700', fontsource: 'pt-serif', weight: 700 },
  { name: 'Bitter', google: 'Bitter:wght@400;700', fontsource: 'bitter', weight: 700 },
  { name: 'Domine', google: 'Domine:wght@400;700', fontsource: 'domine', weight: 700 },
  { name: 'Vollkorn', google: 'Vollkorn:wght@400;700', fontsource: 'vollkorn', weight: 700 },
  { name: 'Josefin Slab', google: 'Josefin Slab:wght@400;700', fontsource: 'josefin-slab', weight: 700 },
  { name: 'Roboto Slab', google: 'Roboto Slab:wght@400;700', fontsource: 'roboto-slab', weight: 700 },
  { name: 'Zilla Slab', google: 'Zilla Slab:wght@400;700', fontsource: 'zilla-slab', weight: 700 },
  { name: 'Old Standard TT', google: 'Old Standard TT:wght@400;700', fontsource: 'old-standard-tt', weight: 700 },
  { name: 'Sorts Mill Goudy', google: 'Sorts Mill Goudy', fontsource: 'sorts-mill-goudy', weight: 400 },
  { name: 'Unna', google: 'Unna:wght@400;700', fontsource: 'unna', weight: 700 },
  { name: 'Prata', google: 'Prata', fontsource: 'prata', weight: 400 },
  { name: 'Marcellus', google: 'Marcellus', fontsource: 'marcellus', weight: 400 },
  { name: 'Marcellus SC', google: 'Marcellus SC', fontsource: 'marcellus-sc', weight: 400 },
  { name: 'Italiana', google: 'Italiana', fontsource: 'italiana', weight: 400 },
  { name: 'Tenor Sans', google: 'Tenor Sans', fontsource: 'tenor-sans', weight: 400 },
  { name: 'Poiret One', google: 'Poiret One', fontsource: 'poiret-one', weight: 400 },
  { name: 'Oranienbaum', google: 'Oranienbaum', fontsource: 'oranienbaum', weight: 400 },
  { name: 'Gilda Display', google: 'Gilda Display', fontsource: 'gilda-display', weight: 400 },
  { name: 'Bodoni Moda', google: 'Bodoni Moda:wght@400;700', fontsource: 'bodoni-moda', weight: 700 },
  { name: 'Instrument Serif', google: 'Instrument Serif', fontsource: 'instrument-serif', weight: 400 },
  { name: 'DM Serif Display', google: 'DM Serif Display', fontsource: 'dm-serif-display', weight: 400 },
  { name: 'DM Serif Text', google: 'DM Serif Text', fontsource: 'dm-serif-text', weight: 400 },
  { name: 'Fraunces', google: 'Fraunces:wght@400;700', fontsource: 'fraunces', weight: 700 },
  { name: 'Libre Bodoni', google: 'Libre Bodoni:wght@400;700', fontsource: 'libre-bodoni', weight: 700 },

  // ——— Luxury / premium display ———
  { name: 'Cinzel', google: 'Cinzel:wght@400;700', fontsource: 'cinzel', weight: 700 },
  { name: 'Cinzel Decorative', google: 'Cinzel Decorative:wght@400;700', fontsource: 'cinzel-decorative', weight: 700 },
  { name: 'Forum', google: 'Forum', fontsource: 'forum', weight: 400 },
  { name: 'Philosopher', google: 'Philosopher:wght@400;700', fontsource: 'philosopher', weight: 700 },
  { name: 'El Messiri', google: 'El Messiri:wght@400;700', fontsource: 'el-messiri', weight: 700 },
  { name: 'Alegreya', google: 'Alegreya:wght@400;700', fontsource: 'alegreya', weight: 700 },
  { name: 'Alegreya SC', google: 'Alegreya SC:wght@400;700', fontsource: 'alegreya-sc', weight: 700 },
  { name: 'Bellefair', google: 'Bellefair', fontsource: 'bellefair', weight: 400 },
  { name: 'Fahkwang', google: 'Fahkwang:wght@400;700', fontsource: 'fahkwang', weight: 700 },
  { name: 'Syncopate', google: 'Syncopate:wght@400;700', fontsource: 'syncopate', weight: 700 },
  { name: 'Orbitron', google: 'Orbitron:wght@400;700', fontsource: 'orbitron', weight: 700 },
  { name: 'Audiowide', google: 'Audiowide', fontsource: 'audiowide', weight: 400 },
  { name: 'Bebas Neue', google: 'Bebas Neue', fontsource: 'bebas-neue', weight: 400 },
  { name: 'Anton', google: 'Anton', fontsource: 'anton', weight: 400 },
  { name: 'Abril Fatface', google: 'Abril Fatface', fontsource: 'abril-fatface', weight: 400 },
  { name: 'Righteous', google: 'Righteous', fontsource: 'righteous', weight: 400 },
  { name: 'Comfortaa', google: 'Comfortaa:wght@400;700', fontsource: 'comfortaa', weight: 700 },
  { name: 'Yeseva One', google: 'Yeseva One', fontsource: 'yeseva-one', weight: 400 },
  { name: 'UnifrakturMaguntia', google: 'UnifrakturMaguntia', fontsource: 'unifrakturmaguntia', weight: 400 },
  { name: 'MedievalSharp', google: 'MedievalSharp', fontsource: 'medievalsharp', weight: 400 },

  // ——— Elegant scripts & signatures ———
  { name: 'Tangerine', google: 'Tangerine:wght@400;700', fontsource: 'tangerine', weight: 700 },
  { name: 'Great Vibes', google: 'Great Vibes', fontsource: 'great-vibes', weight: 400 },
  { name: 'Allura', google: 'Allura', fontsource: 'allura', weight: 400 },
  { name: 'Alex Brush', google: 'Alex Brush', fontsource: 'alex-brush', weight: 400 },
  { name: 'Sacramento', google: 'Sacramento', fontsource: 'sacramento', weight: 400 },
  { name: 'Pinyon Script', google: 'Pinyon Script', fontsource: 'pinyon-script', weight: 400 },
  { name: 'Parisienne', google: 'Parisienne', fontsource: 'parisienne', weight: 400 },
  { name: 'Italianno', google: 'Italianno', fontsource: 'italianno', weight: 400 },
  { name: 'Mr Dafoe', google: 'Mr Dafoe', fontsource: 'mr-dafoe', weight: 400 },
  { name: 'Mr De Haviland', google: 'Mr De Haviland', fontsource: 'mr-de-haviland', weight: 400 },
  { name: 'Mrs Saint Delafield', google: 'Mrs Saint Delafield', fontsource: 'mrs-saint-delafield', weight: 400 },
  { name: 'Miss Fajardose', google: 'Miss Fajardose', fontsource: 'miss-fajardose', weight: 400 },
  { name: 'Petit Formal Script', google: 'Petit Formal Script', fontsource: 'petit-formal-script', weight: 400 },
  { name: 'Rouge Script', google: 'Rouge Script', fontsource: 'rouge-script', weight: 400 },
  { name: 'Clicker Script', google: 'Clicker Script', fontsource: 'clicker-script', weight: 400 },
  { name: 'Euphoria Script', google: 'Euphoria Script', fontsource: 'euphoria-script', weight: 400 },
  { name: 'Bilbo Swash Caps', google: 'Bilbo Swash Caps', fontsource: 'bilbo-swash-caps', weight: 400 },
  { name: 'Arizonia', google: 'Arizonia', fontsource: 'arizonia', weight: 400 },
  { name: 'Dawning of a New Day', google: 'Dawning of a New Day', fontsource: 'dawning-of-a-new-day', weight: 400 },
  { name: 'Norican', google: 'Norican', fontsource: 'norican', weight: 400 },
  { name: 'Niconne', google: 'Niconne', fontsource: 'niconne', weight: 400 },
  { name: 'Style Script', google: 'Style Script', fontsource: 'style-script', weight: 400 },
  { name: 'Imperial Script', google: 'Imperial Script', fontsource: 'imperial-script', weight: 400 },
  { name: 'Mea Culpa', google: 'Mea Culpa', fontsource: 'mea-culpa', weight: 400 },
  { name: 'Birthstone', google: 'Birthstone', fontsource: 'birthstone', weight: 400 },
  { name: 'Birthstone Bounce', google: 'Birthstone Bounce:wght@400;500', fontsource: 'birthstone-bounce', weight: 400 },
  { name: 'Carattere', google: 'Carattere', fontsource: 'carattere', weight: 400 },
  { name: 'Whisper', google: 'Whisper', fontsource: 'whisper', weight: 400 },
  { name: 'Explora', google: 'Explora', fontsource: 'explora', weight: 400 },
  { name: 'Grey Qo', google: 'Grey Qo', fontsource: 'grey-qo', weight: 400 },
  { name: 'Qwigley', google: 'Qwigley', fontsource: 'qwigley', weight: 400 },
  { name: 'Passions Conflict', google: 'Passions Conflict', fontsource: 'passions-conflict', weight: 400 },
  { name: 'Waterfall', google: 'Waterfall', fontsource: 'waterfall', weight: 400 },
  { name: 'Inspiration', google: 'Inspiration', fontsource: 'inspiration', weight: 400 },
  { name: 'Corinthia', google: 'Corinthia:wght@400;700', fontsource: 'corinthia', weight: 400 },
  { name: 'Ballet', google: 'Ballet', fontsource: 'ballet', weight: 400 },
  { name: 'Dancing Script', google: 'Dancing Script:wght@400;700', fontsource: 'dancing-script', weight: 400 },
  { name: 'Pacifico', google: 'Pacifico', fontsource: 'pacifico', weight: 400 },
  { name: 'Satisfy', google: 'Satisfy', fontsource: 'satisfy', weight: 400 },
  { name: 'Caveat', google: 'Caveat:wght@400;700', fontsource: 'caveat', weight: 400 },
  { name: 'Homemade Apple', google: 'Homemade Apple', fontsource: 'homemade-apple', weight: 400 },
  { name: 'Indie Flower', google: 'Indie Flower', fontsource: 'indie-flower', weight: 400 },
  { name: 'Patrick Hand', google: 'Patrick Hand', fontsource: 'patrick-hand', weight: 400 },
  { name: 'Shadows Into Light', google: 'Shadows Into Light', fontsource: 'shadows-into-light', weight: 400 },
  { name: 'Kalam', google: 'Kalam:wght@400;700', fontsource: 'kalam', weight: 400 },
  { name: 'Yellowtail', google: 'Yellowtail', fontsource: 'yellowtail', weight: 400 },
  { name: 'Lobster', google: 'Lobster', fontsource: 'lobster', weight: 400 },
  { name: 'Lobster Two', google: 'Lobster Two:wght@400;700', fontsource: 'lobster-two', weight: 400 },
  { name: 'Cookie', google: 'Cookie', fontsource: 'cookie', weight: 400 },
  { name: 'Courgette', google: 'Courgette', fontsource: 'courgette', weight: 400 },
  { name: 'Marck Script', google: 'Marck Script', fontsource: 'marck-script', weight: 400 },
  { name: 'Rochester', google: 'Rochester', fontsource: 'rochester', weight: 400 },
  { name: 'Kaushan Script', google: 'Kaushan Script', fontsource: 'kaushan-script', weight: 400 },
  { name: 'Amatic SC', google: 'Amatic SC:wght@400;700', fontsource: 'amatic-sc', weight: 700 },
  { name: 'Covered By Your Grace', google: 'Covered By Your Grace', fontsource: 'covered-by-your-grace', weight: 400 },
  { name: 'Gloria Hallelujah', google: 'Gloria Hallelujah', fontsource: 'gloria-hallelujah', weight: 400 },
  { name: 'Permanent Marker', google: 'Permanent Marker', fontsource: 'permanent-marker', weight: 400 },
];

/** Legacy saved names → Google Font option name */
const LEGACY_FONT_ALIASES = {
  Arial: 'Roboto',
  Helvetica: 'Inter',
  'Times New Roman': 'Merriweather',
  Georgia: 'Libre Baskerville',
  Verdana: 'Open Sans',
  Tahoma: 'Nunito',
  'Trebuchet MS': 'Cabin',
  'Courier New': 'Roboto',
  'Lucida Sans': 'Lato',
  'Lucida Console': 'Ubuntu',
  'Palatino Linotype': 'Cardo',
  'Book Antiqua': 'Libre Baskerville',
  Garamond: 'EB Garamond',
  'Comic Sans MS': 'Indie Flower',
  Impact: 'Anton',
  'Segoe UI': 'Inter',
  Calibri: 'Carlito',
  Cambria: 'Merriweather',
  Candara: 'Open Sans',
  Consolas: 'Ubuntu',
  Constantia: 'Lora',
  Corbel: 'Barlow',
  'Franklin Gothic Medium': 'Oswald',
  'Century Gothic': 'Montserrat',
  'Brush Script MT': 'Alex Brush',
  Copperplate: 'Cinzel',
  Papyrus: 'Cinzel Decorative',
  'Segoe Print': 'Patrick Hand',
  'Segoe Script': 'Dancing Script',
  'Lucida Handwriting': 'Homemade Apple',
  'Freestyle Script': 'Satisfy',
  'Edwardian Script ITC': 'Great Vibes',
  'French Script MT': 'Parisienne',
  Vivaldi: 'Pinyon Script',
  Mistral: 'Courgette',
  Handwriting: 'Dancing Script',
};

// Drop broken legacy alias targets that aren't in the list
if (!CERTIFICATE_FONTS.some((f) => f.name === 'Carlito')) {
  LEGACY_FONT_ALIASES.Calibri = 'Roboto';
}

export const CERTIFICATE_FONT_NAMES = CERTIFICATE_FONTS.map((f) => f.name);

const byName = new Map(CERTIFICATE_FONTS.map((f) => [f.name, f]));

export function resolveCertificateFontName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'Roboto';
  if (byName.has(raw)) return raw;
  const alias = LEGACY_FONT_ALIASES[raw];
  if (alias && byName.has(alias)) return alias;
  return 'Roboto';
}

export function getCertificateFont(name) {
  const resolved = resolveCertificateFontName(name);
  return byName.get(resolved) || byName.get('Roboto');
}

/** CSS font-family value for preview / select */
export function fontCssFamily(name) {
  const font = getCertificateFont(name);
  const family = font?.cssFamily || font?.name || 'Roboto';
  const isScript = /Script|Vibes|Satisfy|Caveat|Pacifico|Handwriting|Apple|Flower|Yellowtail|Allura|Brush|Sacramento|Lobster|Tangerine|Cookie|Courgette|Parisienne|Italianno|Dafoe|Rochester|Marck|Haviland|Delafield|Fajardose|Rouge|Clicker|Euphoria|Bilbo|Arizonia|Norican|Niconne|Imperial|Culpa|Birthstone|Carattere|Whisper|Explora|Qwigley|Passions|Waterfall|Inspiration|Corinthia|Ballet|Kaushan|Amatic|Grace|Gloria|Marker|Dawning/i.test(
    `${font.name} ${font.cssFamily || ''} ${font.google}`
  );
  if (isScript) {
    return `'${family}', cursive`;
  }
  return `'${family}', sans-serif`;
}

export function fontWeightFor(name) {
  const font = getCertificateFont(name);
  return font?.weight || 700;
}

/**
 * Google Fonts CSS URLs (chunked — long single URLs can fail).
 * @returns {string[]}
 */
export function getCertificateGoogleFontsHrefs() {
  const families = [];
  const seen = new Set();
  CERTIFICATE_FONTS.forEach((f) => {
    if (!f.google || seen.has(f.google)) return;
    seen.add(f.google);
    families.push(`family=${String(f.google).replace(/ /g, '+')}`);
  });

  const chunkSize = 12;
  const hrefs = [];
  for (let i = 0; i < families.length; i += chunkSize) {
    const chunk = families.slice(i, i + chunkSize);
    hrefs.push(`https://fonts.googleapis.com/css2?${chunk.join('&')}&display=swap`);
  }
  return hrefs;
}

/** @deprecated use getCertificateGoogleFontsHrefs */
export function getCertificateGoogleFontsHref() {
  return getCertificateGoogleFontsHrefs()[0] || '';
}

/** Inject all certificate Google Font stylesheets into document.head */
export function ensureCertificateGoogleFontsLoaded() {
  if (typeof document === 'undefined') return;
  getCertificateGoogleFontsHrefs().forEach((href, index) => {
    const id = `certificate-google-fonts-${index}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });
}

function fontFileUrlFor(font) {
  if (!font?.fontsource) return null;
  const weight = font.weight === 700 ? 700 : 400;
  // Prefer 400 for opentype path drawing (most script fonts are 400-only)
  const tryWeights = weight === 700 ? [400, 700] : [400, 700];
  // Return primary weight URL; loader may fall back
  return gs(font.fontsource, tryWeights[0]);
}

/** Public URL for a downloadable TTF used by preview + PNG generation */
export function getFontFileUrl(fontName) {
  const font = getCertificateFont(fontName);
  return fontFileUrlFor(font);
}

/**
 * Resolve a TTF buffer for SVG embedding (server-side PNG generation).
 */
export async function loadGoogleFontBuffer(fontName) {
  const font = getCertificateFont(fontName);
  const family = font?.cssFamily || font?.name || 'Roboto';
  const slug = font?.fontsource;

  const tryUrls = [];
  if (slug) {
    tryUrls.push(gs(slug, 400));
    if (font.weight === 700) tryUrls.push(gs(slug, 700));
  }

  for (const directUrl of tryUrls) {
    try {
      const fontRes = await fetch(directUrl);
      if (fontRes.ok) {
        const buffer = Buffer.from(await fontRes.arrayBuffer());
        return { buffer, format: 'truetype', family };
      }
    } catch {
      /* try next */
    }
  }

  // Fallback: scrape Google Fonts CSS for a file URL
  if (!font?.google) return null;

  const familyParam = font.google.includes(':') ? font.google : `${font.google}:wght@400`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${String(familyParam).replace(/ /g, '+')}&display=swap`;

  try {
    const cssRes = await fetch(cssUrl, {
      headers: {
        // Request TTF-capable CSS (older UA gets ttf/woff)
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();

    const urlMatch =
      css.match(/src:\s*url\(([^)]+\.(?:ttf|otf))\)/i) ||
      css.match(/src:\s*url\(([^)]+\.woff2?)\)/i);
    if (!urlMatch?.[1]) return null;

    const fontUrl = urlMatch[1].replace(/['"]/g, '');
    const fontRes = await fetch(fontUrl);
    if (!fontRes.ok) return null;
    const buffer = Buffer.from(await fontRes.arrayBuffer());
    const format = fontUrl.includes('.woff2')
      ? 'woff2'
      : fontUrl.includes('.woff')
        ? 'woff'
        : fontUrl.includes('.otf')
          ? 'opentype'
          : 'truetype';

    return { buffer, format, family };
  } catch {
    return null;
  }
}
