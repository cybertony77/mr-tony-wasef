const DESMOS_API_VERSION = 'v1.12';

let loadPromise = null;
let loadedApiKey = null;

/**
 * Load Desmos calculator.js once (shared endpoint for all calculator types).
 * Official v1.12: https://www.desmos.com/api/v1.12/calculator.js?apiKey=...
 * Do NOT load geometry.js separately.
 */
export function loadDesmosApi(apiKey) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Desmos API requires a browser'));
  }

  const key = String(apiKey || '').trim();
  if (!key) {
    return Promise.reject(new Error('Missing DESMOS_API_KEY'));
  }

  if (window.Desmos?.GraphingCalculator && loadedApiKey === key) {
    return Promise.resolve(window.Desmos);
  }

  if (loadPromise && loadedApiKey === key) {
    return loadPromise;
  }

  loadedApiKey = key;
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-desmos-api="true"]');
    if (existing && window.Desmos?.GraphingCalculator) {
      existing.dataset.loaded = 'true';
      resolve(window.Desmos);
      return;
    }

    if (existing && existing.dataset.loaded !== 'true') {
      const onLoad = () => {
        if (window.Desmos?.GraphingCalculator) resolve(window.Desmos);
        else {
          loadedApiKey = null;
          loadPromise = null;
          reject(new Error('Desmos API loaded but constructors are unavailable'));
        }
      };
      const onError = () => {
        loadedApiKey = null;
        loadPromise = null;
        reject(new Error('Failed to load Desmos API'));
      };
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', onError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.desmos.com/api/${DESMOS_API_VERSION}/calculator.js?apiKey=${encodeURIComponent(key)}`;
    script.async = true;
    script.dataset.desmosApi = 'true';
    script.onload = () => {
      script.dataset.loaded = 'true';
      if (window.Desmos?.GraphingCalculator) {
        resolve(window.Desmos);
      } else {
        loadedApiKey = null;
        loadPromise = null;
        reject(new Error('Desmos API loaded but GraphingCalculator is unavailable'));
      }
    };
    script.onerror = () => {
      loadedApiKey = null;
      loadPromise = null;
      script.remove();
      reject(new Error('Failed to load Desmos calculator.js'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export const DESMOS_CALC_TYPES = [
  { id: 'graphing', label: 'Graphing' },
  { id: 'scientific', label: 'Scientific' },
  { id: 'four_function', label: 'Four Function' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'geometry', label: 'Geometry' },
  { id: '3d', label: '3D' },
];

const SHARED_OPTIONS = {
  border: false,
  autosize: true,
  fontSize: 16,
  projectorMode: false,
};

/**
 * Create the selected calculator via official constructors on window.Desmos.
 * Geometry: Desmos.Geometry(element) — NOT GeometryCalculator.
 */
export function createDesmosCalculator(Desmos, element, type) {
  if (!Desmos || !element) {
    throw new Error('Desmos calculator requires Desmos API and a container element');
  }

  switch (type) {
    case 'scientific': {
      if (typeof Desmos.ScientificCalculator !== 'function') {
        throw new Error('Scientific calculator is not enabled for this API key');
      }
      return Desmos.ScientificCalculator(element, { ...SHARED_OPTIONS });
    }
    case 'four_function': {
      if (typeof Desmos.FourFunctionCalculator !== 'function') {
        throw new Error('Four Function calculator is not enabled for this API key');
      }
      return Desmos.FourFunctionCalculator(element, { ...SHARED_OPTIONS });
    }
    case 'matrix': {
      if (typeof Desmos.MatrixCalculator === 'function') {
        return Desmos.MatrixCalculator(element, { ...SHARED_OPTIONS });
      }
      if (typeof Desmos.ScientificCalculator === 'function') {
        return Desmos.ScientificCalculator(element, { ...SHARED_OPTIONS });
      }
      throw new Error('Matrix calculator is not available for this API key');
    }
    case 'geometry': {
      if (typeof Desmos.Geometry !== 'function') {
        throw new Error('Geometry calculator is not enabled for this API key');
      }
      return Desmos.Geometry(element, {
        ...SHARED_OPTIONS,
        keypad: true,
        settingsMenu: true,
        zoomButtons: true,
        authorFeatures: false,
      });
    }
    case '3d': {
      if (typeof Desmos.Calculator3D !== 'function') {
        throw new Error('3D calculator is not enabled for this API key');
      }
      return Desmos.Calculator3D(element, {
        ...SHARED_OPTIONS,
        keypad: true,
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
        authorFeatures: false,
      });
    }
    case 'graphing':
    default: {
      if (typeof Desmos.GraphingCalculator !== 'function') {
        throw new Error('Graphing calculator is unavailable');
      }
      return Desmos.GraphingCalculator(element, {
        ...SHARED_OPTIONS,
        keypad: true,
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
        expressionsCollapsed: false,
        authorFeatures: false,
        pasteGraphLink: false,
      });
    }
  }
}

/** Label Desmos-created iframes for accessibility / window naming. */
export function labelDesmosIframes(container, title = 'Desmos Calculator') {
  if (!container) return;
  const iframes = container.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    iframe.setAttribute('title', title);
    iframe.setAttribute('name', title);
    iframe.setAttribute('aria-label', title);
  });
}
