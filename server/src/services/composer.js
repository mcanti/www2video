import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generate a HyperFrames composition HTML from a natural language prompt
 * Retries on transient failures (503, 429)
 */
export async function composeFromPrompt(prompt, options = {}) {
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

  let duration = parseInt(options.duration) || 10;
  duration = Math.min(Math.max(duration, 1), 120);
  const width = options.width || 1280;
  const height = options.height || 720;

  const systemPrompt = `You are a HyperFrames composition expert. Generate ONLY the HTML content for a video composition.

IMPORTANT — You MUST follow the HyperFrames pattern EXACTLY:

## Structure
- Root: <div id="root" data-composition-id="main" data-start="0" data-width="${width}" data-height="${height}" data-duration="N" style="position:relative; width:${width}px; height:${height}px; overflow:hidden; background:#...;">
- Every SCENE is a DIRECT child of #root
\- Each scene is a <section id="scene-0" class="clip" data-start="0" data-duration="M" data-track-index="1" style="position:absolute; inset:0; ...">
- Nested inside this section goes the scene's content using whatever layout makes sense (flexbox, grid, text, images, etc.)
- Sequential scenes: scene-0 starts at 0, scene-1 starts at previous scene's data-duration, etc.
- Include <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script> in <head>
- GSAP timeline: const tl = gsap.timeline({ paused: true }); window.__timelines["main"] = tl;
- GSAP targets use CSS selectors like tl.from("#scene-0 h1", { ... })
- NO exit animations — the clip lifecycle handles hiding scenes
- Use ONLY entrance animations (gsap.from)
- Animations: 0.3-0.6s duration, vary eases (power2.out, power3.out, back.out, etc.)
- First animation offset by 0.1-0.3s
- Deterministic: no Math.random(), no Date.now()

## Visual Style
- Dark background with accent color
- Professional typography matching the subject
- Font sizes: headlines 42px+, body 18px+, labels 14px+
- Use ONLY real font names: Arial, Georgia, Impact, Tahoma, Times New Roman, Trebuchet MS, Verdana, Courier New, Comic Sans MS
- NEVER use CSS variables like var(--font-body) or var(--primary-font) in font-family
- Padding inside scenes: 80px minimum on all sides

## CRITICAL Rules
- class="clip" goes ONLY on direct children of #root (scene sections)
- Elements INSIDE a scene section do NOT have class="clip"
- Every clip has: id, class="clip", data-start, data-duration, data-track-index
- Root has: id="root", data-composition-id="main", data-width="${width}", data-height="${height}", data-duration
- position: absolute; inset: 0 on every scene clip section
- Output ONLY the complete HTML starting with <!DOCTYPE html>, ending with </html>
- NO markdown fences, NO backticks, NO explanations, NO code blocks
- NO audio or video elements in the HTML (we add them separately)
- NOTĂ: Watermark-ul logo e adăugat automat de sistem — NU include imagini de logo sau watermark în HTML`;

  const userPrompt = `Create a ${duration}-second video composition for: ${prompt}

The total duration is EXACTLY ${duration} seconds. If there are multiple scenes, their durations must add up to ${duration}.`;

  const brandSection = [];
  if (options.brandColors) {
    brandSection.push(`Brand color palette: ${JSON.stringify(options.brandColors)}. Use these as accent colors.`);
  }
  if (options.brandFonts) {
    brandSection.push(`Use these fonts if available: ${JSON.stringify(options.brandFonts)}. Fall back to real font names if not.`);
  }
  if (options.websiteName) {
    brandSection.push(`Website/brand name: ${options.websiteName}. Include it in the content.`);
  }
  if (options.themeColor) {
    brandSection.push(`Primary brand color: ${options.themeColor}. Use this as the main accent color in the video.`);
  }
  if (options.narrationText) {
    brandSection.push(`Text content to include: ${options.narrationText}`);
  }

  const fullPrompt = brandSection.length > 0
    ? `${userPrompt}\n\n${brandSection.join('\n')}`
    : userPrompt;

  // Retry up to 3 times with backoff on 503/429
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: fullPrompt },
      ]);
      let html = result.response.text();

      // Clean stubborn markdown fences
      html = html.replace(/^```html?\s*/gm, '');
      html = html.replace(/^```\s*$/gm, '');
      html = html.replace(/```/g, '');
      html = html.trim();

      // Extract actual HTML if wrapped oddly
      if (!html.startsWith('<!DOCTYPE html') && !html.startsWith('<html')) {
        const match = html.match(/<!DOCTYPE html[\s\S]*?<\/html>/i);
        if (match) html = match[0];
      }

      // Fix 1: Ensure root div has data-width/data-height/data-duration/data-composition-id
      if (!html.includes('data-width=')) {
        html = html.replace(
          /<div[^>]*id="root"[^>]*>/i,
          (match) => {
            let fixed = match;
            if (!fixed.includes('data-width=')) fixed = fixed.replace('id="root"', `id="root" data-width="${width}" data-height="${height}"`);
            if (!fixed.includes('data-composition-id=')) fixed = fixed.replace('data-width=', 'data-composition-id="main" data-width=');
            if (!fixed.includes('data-duration=')) fixed = fixed.replace(`data-height="${height}"`, `data-height="${height}" data-duration="${duration}"`);
            return fixed;
          }
        );
      }

      // Fix 2: Ensure <head> has GSAP script
      if (!html.includes('gsap.min.js') && !html.includes('gsap@')) {
        html = html.replace(
          '</head>',
          `  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>\n</head>`
        );
      }

      // Fix 3: Ensure GSAP timeline with window.__timelines["main"] exists
      if (!html.includes('window.__timelines')) {
        // Find the last </script> before </body> and inject timeline
        html = html.replace(
          /(<\/script>)\s*<\/body>/i,
          `$1
    <script>
      window.__timelines = window.__timelines || {};
      const mainTl = gsap.timeline({ paused: true });
      window.__timelines["main"] = mainTl;
    </script>
  </body>`
        );
      }

      // Fix 4: Ensure clip sections have correct class and positioning
      // Gemini might use display:flex on the scene instead of position:absolute
      html = html.replace(
        /<(section|div)([^>]*class="clip[^"]*"[^>]*?)style="([^"]*)"/g,
        (match, tag, before, style) => {
          if (style.includes('position:absolute') || style.includes('position: absolute')) return match;
          return `<${tag}${before}style="position:absolute; inset:0; ${style}"`;
        }
      );

      // Fix 5: Add position:absolute to root style if missing
      html = html.replace(
        /<div([^>]*id="root"[^>]*?)style="([^"]*)"/,
        (match, before, style) => {
          if (style.includes('position:relative') || style.includes('position: relative')) return match;
          return `<div${before}style="position:relative; ${style}"`;
        }
      );

      // Fix 6: Ensure data-duration on root matches requested duration
      html = html.replace(
        /(data-duration=)"(\d+)"/,
        (match, attr, val) => {
          return `${attr}"${duration}"`;
        }
      );

      // Fix 6b: Ensure data-width and data-height on root match requested dimensions
      html = html.replace(
        /(<div[^>]*id="root"[^>]*?)data-width="(\d+)"/,
        (match, before, val) => `${before}data-width="${width}"`
      );
      html = html.replace(
        /(<div[^>]*id="root"[^>]*?)data-height="(\d+)"/,
        (match, before, val) => `${before}data-height="${height}"`
      );

      // Fix 7: Strip .clip opacity:0 — NOT a HyperFrames convention, breaks GSAP from()
      html = html.replace(/\.clip\s*\{\s*opacity\s*:\s*0\s*;?\s*\}\s*\/\*?\s*HyperFrames will manage visibility\s*\*?\//gi, '');
      html = html.replace(/\.clip\s*\{\s*opacity\s*:\s*0\s*;?\s*\}/gi, '');

      // Fix 8: Ensure root has data-start="0" (HyperFrames expects it)
      if (!html.match(/<div[^>]*id="root"[^>]*data-start=/i)) {
        html = html.replace(
          /(<div[^>]*id="root"[^>]*?)>/i,
          (match, before) => `${before} data-start="0">`
        );
      }

      // Fix 9: Ensure body has bg matching root background (fallback for clip edges)
      const rootBgMatch = html.match(/background:\s*(#[a-fA-F0-9]{3,6})/);
      if (rootBgMatch) {
        const rootBg = rootBgMatch[1];
        html = html.replace(
          /(<body[^>]*>)/i,
          (match, tag) => `${tag}\n<div id="bg-fallback" style="position:fixed;inset:0;background:${rootBg};z-index:-1;"></div>`
        );
      }

      // Fix 10: Add watermark overlay if not already present
      const WATERMARK_URL = 'https://cognitum.ro/assets/logo-inv.png';
      if (!html.includes('watermark')) {
        html = html.replace(
          '</body>',
          `  <img src="${WATERMARK_URL}" style="position:absolute;bottom:20px;right:20px;width:100px;opacity:0.5;z-index:999;pointer-events:none;" alt="watermark" />\n</body>`
        );
      }

      return html;
    } catch (err) {
      lastError = err;
      const isRetryable = err.message?.includes('503') || err.message?.includes('429') || err.message?.includes('500');
      if (isRetryable && attempt < 2) {
        const delay = (attempt + 1) * 5000;
        console.log(`[composer] Gemini ${err.message?.slice(0, 50)}... retry ${attempt + 1}/3 in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

/**
 * Extract visual identity from CSS/HTML content
 * Returns design tokens
 */
export function extractDesignTokens(html, cssContent) {
  const colors = new Set();
  const fonts = new Set();

  // Extract hex colors
  const hexRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  let match;
  while ((match = hexRegex.exec(html || '')) !== null) {
    const color = match[0].toLowerCase();
    // Skip common neutral colors
    if (!['#000', '#000000', '#fff', '#ffffff', '#333', '#666', '#999', '#ccc'].includes(color)) {
      colors.add(color);
    }
  }
  while ((match = hexRegex.exec(cssContent || '')) !== null) {
    const color = match[0].toLowerCase();
    if (!['#000', '#000000', '#fff', '#ffffff', '#333', '#666', '#999', '#ccc'].includes(color)) {
      colors.add(color);
    }
  }

  // Extract Google Fonts
  const gfRegex = /fonts\.googleapis\.com\/css2\?family=([^&\"]+)/g;
  while ((match = gfRegex.exec(html || '')) !== null) {
    const families = match[1].split('&family=');
    families.forEach(f => {
      fonts.add(decodeURIComponent(f).split(':')[0].replace(/\+/g, ' '));
    });
  }

  return {
    colors: Array.from(colors).slice(0, 6),
    fonts: Array.from(fonts).slice(0, 3),
  };
}

/**
 * Generate TTS audio narration using Gemini
 * Returns base64-encoded audio content
 */
export async function generateTTS(text, voice = 'Kore') {
  // Use Google Cloud Text-to-Speech via dedicated service
  try {
    const { generateTTS: gcloudTTS } = await import('../services/tts.js');
    return await gcloudTTS(text, voice);
  } catch (err) {
    console.error('[composer] TTS error:', err.message);
    return { text: err.message };
  }
}

/**
 * Generate subtitles in WebVTT format
 * @param {string} text - Narration text to split into subtitle cues
 * @param {number} totalDuration - Total video duration in seconds
 * @returns {string} WebVTT content
 */
export function generateSubtitles(text, totalDuration = 10) {
  // Split text into sentences
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) {
    return 'WEBVTT\n\n';
  }

  const durationPerSentence = totalDuration / sentences.length;
  const lines = ['WEBVTT', ''];

  sentences.forEach((sentence, i) => {
    const start = i * durationPerSentence;
    const end = Math.min((i + 1) * durationPerSentence, totalDuration);

    const fmt = (secs) => {
      const totalMs = Math.round(secs * 1000);
      const h = Math.floor(totalMs / 3600000);
      const m = Math.floor((totalMs % 3600000) / 60000);
      const s = Math.floor((totalMs % 60000) / 1000);
      const ms = totalMs % 1000;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };

    lines.push(`${i + 1}`);
    lines.push(`${fmt(start)} --> ${fmt(end)}`);
    lines.push(sentence);
    lines.push('');
  });

  return lines.join('\n');
}
