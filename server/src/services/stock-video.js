/**
 * Stock Video Service — search stock footage across multiple providers.
 *
 * Providers:
 *   - Pexels  (https://www.pexels.com/api/)
 *   - Pixabay  (https://pixabay.com/api/docs/)
 *   - Coverr   (https://api.coverr.co/docs/)
 *
 * Each provider reads its API key from environment variables.
 */

import { URL, URLSearchParams } from 'node:url';

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
          // Match aspect ratio approximately — prefer exact, fall back to closest
          if (w >= width && h >= height && file.link) {
            items.push({
              provider: 'pexels',
              url: file.link,
              duration: v.duration,
              width: w,
              height: h,
              thumbnail: v.image || null,
              user: v.user?.name || null,
              id: String(v.id),
            });
            break;
          }
        }
        // Fallback: if no exact match, take first available file
        if (items.length === 0 || items[items.length - 1]?.id !== String(v.id)) {
          const first = v.video_files?.find(f => f.link);
          if (first) {
            items.push({
              provider: 'pexels',
              url: first.link,
              duration: v.duration,
              width: parseInt(first.width, 10),
              height: parseInt(first.height, 10),
              thumbnail: v.image || null,
              user: v.user?.name || null,
              id: String(v.id),
            });
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
    parseResponse: (json, minDuration, _width, _height) => {
      const items = [];
      if (!json?.hits) return items;
      for (const v of json.hits) {
        if (v.duration < minDuration) continue;
        const videos = v.videos || {};
        // Pixabay returns videos keyed by quality label (large, medium, small, tiny)
        // Prefer largest, fall back sequentially
        const qualityOrder = ['large', 'medium', 'small', 'tiny'];
        for (const q of qualityOrder) {
          const file = videos[q];
          if (file?.url) {
            items.push({
              provider: 'pixabay',
              url: file.url,
              duration: v.duration,
              width: parseInt(file.width, 10),
              height: parseInt(file.height, 10),
              thumbnail: v.previewURL || null,
              user: v.user || null,
              id: String(v.id),
              tags: v.tags || null,
            });
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
    parseResponse: (json, minDuration, _width, _height) => {
      const items = [];
      if (!json?.hits) return items;
      for (const v of json.hits) {
        const duration = typeof v.duration === 'string' ? parseFloat(v.duration) : v.duration;
        if (duration < minDuration) continue;
        if (v.urls?.mp4_download) {
          items.push({
            provider: 'coverr',
            url: v.urls.mp4_download,
            duration,
            width: v.width || 1920,
            height: v.height || 1080,
            thumbnail: v.thumbnail || v.urls?.poster || null,
            user: v.author?.name || null,
            id: v.id || String(v._id || ''),
            title: v.title || null,
          });
        }
      }
      return items;
    },
  },
};

/**
 * Check which providers have API keys configured.
 * Returns a list of enabled provider objects.
 */
export function getEnabledProviders() {
  return Object.entries(PROVIDERS)
    .filter(([, cfg]) => process.env[cfg.envKey])
    .map(([id, cfg]) => ({ id, name: cfg.name, configured: true }));
}

/**
 * Check if a specific provider is enabled.
 */
export function isProviderEnabled(providerId) {
  const cfg = PROVIDERS[providerId];
  if (!cfg) return false;
  return !!process.env[cfg.envKey];
}

/**
 * Search stock videos from a specific provider.
 *
 * @param {string}  providerId   - 'pexels' | 'pixabay' | 'coverr'
 * @param {string}  query        - Search term
 * @param {object}  [options]
 * @param {number}  [options.perPage=15]
 * @param {number}  [options.minDuration=3]
 * @param {number}  [options.width=1920]
 * @param {number}  [options.height=1080]
 * @returns {Promise<{items: Array, error?: string}>}
 */
export async function searchStockVideos(providerId, query, options = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return { items: [], error: `Unknown provider: ${providerId}` };
  }

  const apiKey = process.env[provider.envKey];
  if (!apiKey) {
    return { items: [], error: `API key not configured for ${provider.name}. Set ${provider.envKey} in .env` };
  }

  const perPage = Math.min(Math.max(options.perPage || 15, 1), 80);
  const minDuration = options.minDuration || 3;
  const width = options.width || 1920;
  const height = options.height || 1080;

  // Build search params per provider
  let url;
  switch (providerId) {
    case 'pexels': {
      const qs = new URLSearchParams({
        query,
        per_page: String(perPage),
        orientation: width >= height ? 'landscape' : 'portrait',
      });
      url = `${provider.searchUrl}?${qs}`;
      break;
    }
    case 'pixabay': {
      const qs = new URLSearchParams({
        q: query,
        video_type: 'all',
        per_page: String(perPage),
        key: apiKey,
      });
      url = `${provider.searchUrl}?${qs}`;
      break;
    }
    case 'coverr': {
      const qs = new URLSearchParams({
        query,
        page_size: String(perPage),
        urls: 'true',
        sort: 'popular',
      });
      url = `${provider.searchUrl}?${qs}`;
      break;
    }
    default:
      return { items: [], error: `Unsupported provider: ${providerId}` };
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; www2video/1.0)',
      ...provider.headers(apiKey),
    };

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        items: [],
        error: `${provider.name} API error (${response.status}): ${errorText.slice(0, 200)}`,
      };
    }

    const json = await response.json();
    const items = provider.parseResponse(json, minDuration, width, height);

    return { items, meta: { total: items.length, provider: providerId, query } };
  } catch (err) {
    return { items: [], error: `${provider.name} search failed: ${err.message}` };
  }
}

/**
 * Search across all enabled providers, returning merged results.
 */
export async function searchAllProviders(query, options = {}) {
  const enabled = getEnabledProviders();
  const results = await Promise.allSettled(
    enabled.map(p => searchStockVideos(p.id, query, options))
  );

  const items = [];
  const errors = [];

  results.forEach((result, idx) => {
    const provider = enabled[idx];
    if (result.status === 'fulfilled') {
      items.push(...result.value.items);
      if (result.value.error) {
        errors.push({ provider: provider.id, error: result.value.error });
      }
    } else {
      errors.push({ provider: provider.id, error: result.reason?.message || 'Unknown error' });
    }
  });

  return { items, errors };
}

export default {
  getEnabledProviders,
  isProviderEnabled,
  searchStockVideos,
  searchAllProviders,
};
