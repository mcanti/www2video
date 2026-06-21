import { execFile } from 'child_process';

const CHROME_PATH = process.env.CHROME_HEADLESS_SHELL_PATH || '/usr/local/bin/chrome-headless-shell';

/**
 * Fetch the fully-rendered DOM from a URL using Chrome headless.
 * This handles SPAs and JS-rendered content.
 */
export async function fetchRenderedDOM(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless',
      '--dump-dom',
      `--virtual-time-budget=5000`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      url,
    ];

    execFile(CHROME_PATH, args, {
      timeout,
      maxBuffer: 5 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }, (err, stdout) => {
      if (err) {
        reject(new Error(`Chrome headless failed: ${err.message?.slice(0, 200)}`));
        return;
      }
      resolve(stdout || '');
    });
  });
}

/**
 * Normalize a potentially-relative URL to absolute using baseUrl as base.
 * Returns null if href is empty. If no baseUrl, returns href as-is.
 */
function resolveUrl(href, baseUrl) {
  if (!href) return null;
  if (!baseUrl) return href;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

/**
 * Extract brand tokens from rendered HTML more thoroughly.
 * Returns colors, fonts, theme color, title, description, and logoUrl.
 * @param {string} html - Rendered HTML content
 * @param {string} [baseUrl] - Base URL for resolving relative URLs
 */
export function extractBrandTokens(html, baseUrl = null) {
  const colors = new Set();
  const fonts = new Set();
  let themeColor = null;
  let title = '';
  let description = '';
  let logoUrl = null;
  let faviconUrl = null;
  const googleFontsUrls = [];

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();

  // Extract <meta name="description">
  const descMatch = html.match(/<meta\s+name="description"[^>]+content="([^"]+)"/i);
  if (descMatch) description = descMatch[1].trim();

  // Extract <meta name="theme-color">
  const themeMatch = html.match(/<meta\s+name="theme-color"[^>]+content="([^"]+)"/i);
  if (themeMatch) themeColor = themeMatch[1].trim();

  // Extract all hex colors from inline styles and style blocks
  const hexRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  let match;
  while ((match = hexRegex.exec(html)) !== null) {
    const color = match[0].toLowerCase();
    if (!['#000', '#000000', '#fff', '#ffffff', '#333', '#666', '#999', '#ccc', '#f00', '#ff0000'].includes(color)) {
      colors.add(color);
    }
  }

  // If we have a theme-color, make sure it's first
  if (themeColor) colors.add(themeColor.toLowerCase());

  // Extract Google Fonts — preserve the full CSS URL for <link> injection
  const gfUrlRegex = /https?:\/\/fonts\.googleapis\.com\/css2?\?[^"'\s<>]+/gi;
  while ((match = gfUrlRegex.exec(html)) !== null) {
    const url = match[0].replace(/&amp;/g, '&');
    if (!googleFontsUrls.includes(url)) {
      googleFontsUrls.push(url);
    }
  }

  // Extract Google Fonts family names
  const gfRegex = /fonts\.googleapis\.com\/css2?\?family=([^"'\s<>]+)/g;
  while ((match = gfRegex.exec(html)) !== null) {
    const families = match[1].replace(/&amp;/g, '&').split('&family=');
    families.forEach(f => {
      fonts.add(decodeURIComponent(f).split(':')[0].replace(/\+/g, ' '));
    });
  }

  // Extract font-family from inline styles
  const fontRegex = /font-family:\s*['"]?([^'";,}]+)['"]?/gi;
  while ((match = fontRegex.exec(html)) !== null) {
    const font = match[1].trim();
    if (font && !font.includes('inherit') && !font.includes('initial') && !font.startsWith('--')) {
      fonts.add(font);
    }
  }

  // Extract logo URL — priority: favicon → apple-touch-icon → og:image → twitter:image
  const faviconCandidates = [];
  const iconRegex = /<link\s+[^>]*?(?:rel="([^"]*)"[^>]*?href="([^"]*)"|href="([^"]*)"[^>]*?rel="([^"]*)")[^>]*?>/gi;
  while ((match = iconRegex.exec(html)) !== null) {
    const rel = (match[1] || match[4] || '').toLowerCase();
    const href = match[2] || match[3] || '';
    if (!href) continue;
    if (rel === 'icon' || rel === 'shortcut icon') {
      faviconCandidates.push({ priority: 1, href });
    } else if (rel === 'apple-touch-icon') {
      faviconCandidates.push({ priority: 2, href });
    } else if (rel === 'apple-touch-icon-precomposed') {
      faviconCandidates.push({ priority: 3, href });
    }
  }
  faviconCandidates.sort((a, b) => a.priority - b.priority);
  if (faviconCandidates.length > 0) {
    faviconUrl = resolveUrl(faviconCandidates[0].href, baseUrl);
    logoUrl = faviconUrl;
  }

  // Fallback: og:image meta tag
  if (!logoUrl) {
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch) logoUrl = resolveUrl(ogMatch[1], baseUrl);
  }

  // Fallback: twitter:image meta tag
  if (!logoUrl) {
    const twMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (twMatch) logoUrl = resolveUrl(twMatch[1], baseUrl);
  }

  return {
    colors: Array.from(colors).slice(0, 8),
    fonts: Array.from(fonts).slice(0, 4),
    themeColor,
    title,
    description,
    logoUrl,
    faviconUrl,
    googleFontsUrls,
  };
}
