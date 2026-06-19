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
 * Extract brand tokens from rendered HTML more thoroughly
 * Returns colors, fonts, theme color, and title/description
 */
export function extractBrandTokens(html) {
  const colors = new Set();
  const fonts = new Set();
  let themeColor = null;
  let title = '';
  let description = '';

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

  // Extract Google Fonts
  const gfRegex = /fonts\.googleapis\.com\/css2\?family=([^&'"]+)/g;
  while ((match = gfRegex.exec(html)) !== null) {
    const families = match[1].split('&family=');
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

  return {
    colors: Array.from(colors).slice(0, 8),
    fonts: Array.from(fonts).slice(0, 4),
    themeColor,
    title,
    description,
  };
}
