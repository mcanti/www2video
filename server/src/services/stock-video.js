import { GoogleGenerativeAI } from '@google/generative-ai';

const PEXELS_BASE = 'https://api.pexels.com/v1/videos';

/**
 * Generate search terms for stock video queries using Gemini.
 * Takes the video subject and optional narration text (script) and returns
 * 3-5 concise search terms suitable for a stock video API.
 *
 * @param {string} subject - The main video subject/topic
 * @param {string} [script] - Optional narration text to derive terms from
 * @returns {Promise<string[]>} Array of search terms
 */
export async function generateSearchTerms(subject, script = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[stock-video] GEMINI_API_KEY not set, using subject as fallback term');
    return extractFallbackTerms(subject, script);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

  const context = [
    `Video subject: ${subject}`,
  ];
  if (script) {
    context.push(`Narration script: ${script}`);
  }

  const prompt = `You are a media search specialist. Based on the video subject and optional script below, generate 3-5 concise stock video search terms. Each term should be 1-4 words, describing visual scenes that would work as background video footage for this content. Pick diverse terms that cover different visual aspects of the topic.

${context.join('\n')}

Return ONLY a JSON array of strings, no markdown, no explanations. Example: ["ocean waves", "beach sunset", "sailing boat", "coastal road", "seagulls flying"]`;

  try {
    const result = await model.generateContent([{ text: prompt }]);
    const text = result.response.text().trim();
    // Try to parse as JSON array
    const cleaned = text
      .replace(/^```(?:json)?\s*/gm, '')
      .replace(/```\s*$/gm, '')
      .trim();
    const terms = JSON.parse(cleaned);
    if (Array.isArray(terms) && terms.length > 0) {
      return terms.slice(0, 5);
    }
  } catch (err) {
    console.warn('[stock-video] Gemini search terms generation failed:', err.message);
  }

  return extractFallbackTerms(subject, script);
}

/**
 * Fallback: derive terms directly from the subject text
 */
function extractFallbackTerms(subject, script) {
  const words = (subject + ' ' + script)
    .toLowerCase()
    .replace(/[^a-zăâîșț\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['this', 'that', 'with', 'from', 'your', 'will', 'have', 'been', 'were', 'they', 'their', 'what', 'about', 'which', 'would', 'could', 'should', 'there'].includes(w));

  // Take unique words, dedupe, return as pairs
  const unique = [...new Set(words)].slice(0, 4);
  if (unique.length === 0) return [subject];
  return unique.map(w => `${w} video footage`);
}

/**
 * Search Pexels for stock videos matching a query.
 *
 * @param {string} query - Search term
 * @param {number} [perPage=3] - Videos per query (max 80)
 * @param {object} [options]
 * @param {'tiny'|'medium'|'large'} [options.size] - Optional size filter
 * @param {'landscape'|'portrait'|'square'} [options.orientation] - Optional orientation
 * @returns {Promise<Array<{url: string, thumbnail: string, width: number, height: number, duration: number, description: string}>>}
 */
export async function searchPexelsVideos(query, perPage = 3, options = {}) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn('[stock-video] PEXELS_API_KEY not set, skipping stock video search');
    return [];
  }

  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(perPage, 5)),
  });
  if (options.orientation) params.set('orientation', options.orientation);
  if (options.size) params.set('size', options.size);

  try {
    const response = await fetch(`${PEXELS_BASE}/search?${params}`, {
      headers: {
        Authorization: apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[stock-video] Pexels API error: ${response.status} for query "${query}"`);
      return [];
    }

    const data = await response.json();
    if (!data.videos || data.videos.length === 0) return [];

    // Return the highest-quality video file for each result
    return data.videos.map(video => {
      // Pick the largest available video file (prefer HD)
      const files = video.video_files || [];
      // Sort by quality: prefer higher width
      files.sort((a, b) => (b.width || 0) - (a.width || 0));

      const bestFile = files[0];
      if (!bestFile || !bestFile.link) return null;

      return {
        url: bestFile.link,
        thumbnail: video.image || '',
        width: bestFile.width || video.width || 0,
        height: bestFile.height || video.height || 0,
        duration: video.duration || 0,
        // Pexels doesn't provide descriptions natively, use the query as context
        description: query,
        site: 'pexels',
      };
    }).filter(Boolean).slice(0, perPage);
  } catch (err) {
    console.warn(`[stock-video] Pexels search error for "${query}":`, err.message);
    return [];
  }
}

/**
 * Download a stock video file to the local filesystem.
 *
 * @param {string} url - The video download URL
 * @param {string} destDir - Destination directory
 * @param {string} filename - Filename to save as
 * @returns {Promise<string|null>} Absolute path to the downloaded file, or null on failure
 */
export async function downloadStockVideo(url, destDir, filename) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      console.warn(`[stock-video] Download failed: ${response.status} for ${url}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const fs = await import('fs/promises');
    const path = await import('path');
    await fs.mkdir(destDir, { recursive: true });
    const filePath = path.join(destDir, filename);
    await fs.writeFile(filePath, buffer);
    console.log(`[stock-video] Downloaded: ${filePath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
    return filePath;
  } catch (err) {
    console.warn(`[stock-video] Download error for ${url}:`, err.message);
    return null;
  }
}

/**
 * Main orchestrator: generate search terms, query Pexels, return results.
 *
 * @param {string} subject - The video subject/topic
 * @param {string} [script] - Optional narration text
 * @param {object} [options]
 * @param {number} [options.maxVideos=3] - Max videos to return total
 * @param {boolean} [options.download=false] - Whether to download files locally
 * @param {string} [options.downloadDir] - Directory to download into
 * @returns {Promise<{videos: Array, downloadDir: string|null}>}
 */
export async function findStockVideos(subject, script = '', options = {}) {
  const maxVideos = options.maxVideos || 3;
  const shouldDownload = options.download || false;
  const downloadDir = options.downloadDir || null;

  // Step 1: Generate search terms
  const terms = await generateSearchTerms(subject, script);
  console.log(`[stock-video] Search terms: ${terms.join(', ')}`);

  if (terms.length === 0) {
    console.log('[stock-video] No search terms generated, falling back');
    return { videos: [], downloadDir: null };
  }

  // Step 2: Search each term on Pexels
  const allVideos = [];
  const seenUrls = new Set();

  for (const term of terms) {
    if (allVideos.length >= maxVideos) break;
    const results = await searchPexelsVideos(term, 2);
    for (const video of results) {
      if (!seenUrls.has(video.url) && allVideos.length < maxVideos) {
        seenUrls.add(video.url);
        allVideos.push(video);
      }
    }
  }

  console.log(`[stock-video] Found ${allVideos.length} stock videos`);

  // Step 3: Optionally download
  let localDir = null;
  if (shouldDownload && allVideos.length > 0 && downloadDir) {
    localDir = downloadDir;
    for (let i = 0; i < allVideos.length; i++) {
      const video = allVideos[i];
      const ext = '.mp4'; // Pexels typically serves mp4
      const filename = `stock-${i}${ext}`;
      const localPath = await downloadStockVideo(video.url, downloadDir, filename);
      if (localPath) {
        video.localPath = localPath;
        // Replace remote URL with local relative path for the composition
        video.compositionUrl = `stock/${filename}`;
      }
    }
  }

  return { videos: allVideos, downloadDir: localDir };
}
