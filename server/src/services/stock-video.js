import { GoogleGenerativeAI } from '@google/generative-ai';
import { URL, URLSearchParams } from 'node:url';

// ── Gemini search terms generation ──────────────────────────────────

/**
 * Generate search terms for stock video queries using Gemini.
 * @param {string} subject - The main video subject/topic
 * @param {string} [script] - Optional narration text
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

  const context = [`Video subject: ${subject}`];
  if (script) context.push(`Narration script: ${script}`);

  const prompt = `You are a media search specialist. Based on the video subject and optional script below, generate 3-5 concise stock video search terms. Each term should be 1-4 words, describing visual scenes that would work as background video footage for this content. Pick diverse terms that cover different visual aspects of the topic.

${context.join('\n')}

Return ONLY a JSON array of strings, no markdown, no explanations. Example: ["ocean waves", "beach sunset", "sailing boat", "coastal road", "seagulls flying"]`;

  try {
    const result = await model.generateContent([{ text: prompt }]);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```(?:json)?\s*/gm, '').replace(/```\s*$/gm, '').trim();
    const terms = JSON.parse(cleaned);
    if (Array.isArray(terms) && terms.length > 0) return terms.slice(0, 5);
  } catch (err) {
    console.warn('[stock-video] Gemini search terms generation failed:', err.message);
  }

  return extractFallbackTerms(subject, script);
}

function extractFallbackTerms(subject, script) {
  const words = (subject + ' ' + script)
    .toLowerCase()
    .replace(/[^a-zăâîșț\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['this', 'that', 'with', 'from', 'your', 'will', 'have', 'been', 'were', 'they', 'their', 'what', 'about', 'which', 'would', 'could', 'should', 'there'].includes(w));

  const unique = [...new Set(words)].slice(0, 4);
  if (unique.length === 0) return [subject];
  return unique.map(w => `${w} video footage`);
}

// ── Provider config ──────────────────────────────────────────────

const PROVIDERS = {
  pexels: {
    name: 'Pexels',
    envKey: 'PEXELS_API_KEY',
    searchUrl: 'https://api.pexels.com/videos/search',
    headers: (apiKey) => ({ Authorization: apiKey }),
    parseResponse: (json, minDuration, width, height) => {
      const items = [];
      if (!json?.videos) return items;
      for (const v of json.videos) {
        if (v.duration < minDuration) continue;
        for (const file of v.video_files || []) {
          const w = parseInt(file.width, 10);
          const h = parseInt(file.height, 10);
          if (w >= width && h >= height && file.link) {
            items.push({ provider: 'pexels', url: file.link, duration: v.duration, width: w, height: h, thumbnail: v.image || null, user: v.user?.name || null, id: String(v.id), description: file.link });
            break;
          }
        }
        if (items.length === 0 || items[items.length - 1]?.id !== String(v.id)) {
          const first = v.video_files?.find(f => f.link);
          if (first) {
            items.push({ provider: 'pexels', url: first.link, duration: v.duration, width: parseInt(first.width, 10), height: parseInt(first.height, 10), thumbnail: v.image || null, user: v.user?.name || null, id: String(v.id), description: first.link });
          }
        }
      }
      return items;
    },
  },

  pixabay: {
    name: 'Pixabay',
    envKey: 'PIXABAY_API_KEY',
    searchUrl: 'https://pixabay.com/api/videos/',
    headers: () => ({}),
    parseResponse: (json, minDuration) => {
      const items = [];
      if (!json?.hits) return items;
      for (const v of json.hits) {
        if (v.duration < minDuration) continue;
        const videos = v.videos || {};
        const qualityOrder = ['large', 'medium', 'small', 'tiny'];
        for (const q of qualityOrder) {
          const file = videos[q];
          if (file?.url) {
            items.push({ provider: 'pixabay', url: file.url, duration: v.duration, width: parseInt(file.width, 10), height: parseInt(file.height, 10), thumbnail: v.previewURL || null, user: v.user || null, id: String(v.id), tags: v.tags || null });
            break;
          }
        }
      }
      return items;
    },
  },

  coverr: {
    name: 'Coverr',
    envKey: 'COVERR_API_KEY',
    searchUrl: 'https://api.coverr.co/videos',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseResponse: (json, minDuration) => {
      const items = [];
      if (!json?.hits) return items;
      for (const v of json.hits) {
        const duration = typeof v.duration === 'string' ? parseFloat(v.duration) : v.duration;
        if (duration < minDuration) continue;
        if (v.urls?.mp4_download) {
          items.push({ provider: 'coverr', url: v.urls.mp4_download, duration, width: v.width || 1920, height: v.height || 1080, thumbnail: v.thumbnail || v.urls?.poster || null, user: v.author?.name || null, id: v.id || String(v._id || ''), title: v.title || null });
        }
      }
      return items;
    },
  },
};

// ── Provider discovery ───────────────────────────────────────────

export function getEnabledProviders() {
  return Object.entries(PROVIDERS)
    .filter(([, cfg]) => process.env[cfg.envKey])
    .map(([id, cfg]) => ({ id, name: cfg.name, configured: true }));
}

export function isProviderEnabled(providerId) {
  const cfg = PROVIDERS[providerId];
  if (!cfg) return false;
  return !!process.env[cfg.envKey];
}

// ── Search (single provider) ─────────────────────────────────────

export async function searchStockVideos(providerId, query, options = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider) return { items: [], error: `Unknown provider: ${providerId}` };

  const apiKey = process.env[provider.envKey];
  if (!apiKey) return { items: [], error: `API key not configured for ${provider.name}. Set ${provider.envKey} in .env` };

  const perPage = Math.min(Math.max(options.perPage || 15, 1), 80);
  const minDuration = options.minDuration || 3;
  const width = options.width || 1920;
  const height = options.height || 1080;

  let url;
  switch (providerId) {
    case 'pexels': {
      const qs = new URLSearchParams({ query, per_page: String(perPage), orientation: width >= height ? 'landscape' : 'portrait' });
      url = `${provider.searchUrl}?${qs}`;
      break;
    }
    case 'pixabay': {
      const qs = new URLSearchParams({ q: query, video_type: 'all', per_page: String(perPage), key: apiKey });
      url = `${provider.searchUrl}?${qs}`;
      break;
    }
    case 'coverr': {
      const qs = new URLSearchParams({ query, page_size: String(perPage), urls: 'true', sort: 'popular' });
      url = `${provider.searchUrl}?${qs}`;
      break;
    }
    default:
      return { items: [], error: `Unsupported provider: ${providerId}` };
  }

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; www2video/1.0)', ...provider.headers(apiKey) };
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return { items: [], error: `${provider.name} API error (${response.status}): ${errorText.slice(0, 200)}` };
    }

    const json = await response.json();
    const items = provider.parseResponse(json, minDuration, width, height);
    return { items, meta: { total: items.length, provider: providerId, query } };
  } catch (err) {
    return { items: [], error: `${provider.name} search failed: ${err.message}` };
  }
}

// ── Search (all providers) ───────────────────────────────────────

export async function searchAllProviders(query, options = {}) {
  const enabled = getEnabledProviders();
  const results = await Promise.allSettled(enabled.map(p => searchStockVideos(p.id, query, options)));
  const items = [];
  const errors = [];

  results.forEach((result, idx) => {
    const provider = enabled[idx];
    if (result.status === 'fulfilled') {
      items.push(...result.value.items);
      if (result.value.error) errors.push({ provider: provider.id, error: result.value.error });
    } else {
      errors.push({ provider: provider.id, error: result.reason?.message || 'Unknown error' });
    }
  });

  return { items, errors };
}

// ── Download ─────────────────────────────────────────────────────

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

// ── Orchestrator ─────────────────────────────────────────────────

/**
 * Main orchestrator: generate search terms → query all stock providers → optionally download.
 *
 * @param {string} subject - The video subject/topic
 * @param {string} [script] - Optional narration text
 * @param {object} [options]
 * @param {number} [options.maxVideos=3] - Max videos to return total
 * @param {boolean} [options.download=false] - Whether to download files locally
 * @param {string} [options.downloadDir] - Directory to download into
 * @param {string} [options.provider] - Specific provider ID or 'all' for all enabled
 * @returns {Promise<{videos: Array, downloadDir: string|null}>}
 */
export async function findStockVideos(subject, script = '', options = {}) {
  const maxVideos = options.maxVideos || 3;
  const shouldDownload = options.download || false;
  const downloadDir = options.downloadDir || null;
  const providerId = options.provider || 'all';

  // Step 1: Generate search terms
  const terms = await generateSearchTerms(subject, script);
  console.log(`[stock-video] Search terms: ${terms.join(', ')}`);

  if (terms.length === 0) {
    console.log('[stock-video] No search terms generated, falling back');
    return { videos: [], downloadDir: null };
  }

  // Step 2: Search each term on the configured provider(s)
  const allVideos = [];
  const seenUrls = new Set();

  for (const term of terms) {
    if (allVideos.length >= maxVideos) break;

    let results;
    if (providerId === 'all') {
      results = await searchAllProviders(term, { perPage: 2, minDuration: options.minDuration || 3, width: options.width || 1920, height: options.height || 1080 });
      results = results.items || [];
    } else {
      results = await searchStockVideos(providerId, term, { perPage: 2, minDuration: options.minDuration || 3, width: options.width || 1920, height: options.height || 1080 });
      results = results.items || [];
    }

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
      const filename = `stock-${i}.mp4`;
      const localPath = await downloadStockVideo(video.url, downloadDir, filename);
      if (localPath) {
        video.localPath = localPath;
        video.compositionUrl = `stock/${filename}`;
      }
    }
  }

  return { videos: allVideos, downloadDir: localDir };
}

export default {
  generateSearchTerms,
  getEnabledProviders,
  isProviderEnabled,
  searchStockVideos,
  searchAllProviders,
  downloadStockVideo,
  findStockVideos,
};
