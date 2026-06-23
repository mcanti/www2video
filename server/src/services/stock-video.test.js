import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateSearchTerms,
  searchStockVideos,
  downloadStockVideo,
  findStockVideos,
  getEnabledProviders,
  isProviderEnabled,
  searchAllProviders,
} from './stock-video.js';

// ── Mock fetch ───────────────────────────────────────────────────
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ── Sample API response fixtures ──────────────────────────────────
const PEXELS_RESPONSE = {
  videos: [
    { id: 1, duration: 15, image: 'https://pexels.com/thumb1.jpg', user: { name: 'John Doe' },
      video_files: [{ width: 1920, height: 1080, link: 'https://pexels.com/video1.mp4' }, { width: 640, height: 360, link: 'https://pexels.com/video1_small.mp4' }] },
    { id: 2, duration: 5, image: 'https://pexels.com/thumb2.jpg', user: { name: 'Jane Doe' },
      video_files: [{ width: 1920, height: 1080, link: 'https://pexels.com/video2.mp4' }] },
  ],
};

const PIXABAY_RESPONSE = {
  hits: [
    { id: 101, duration: 12, previewURL: 'https://pixabay.com/thumb1.jpg', user: 'pixabay_user', tags: 'nature, forest',
      videos: { large: { url: 'https://pixabay.com/video1_large.mp4', width: 1920, height: 1080 }, medium: { url: 'https://pixabay.com/video1_medium.mp4', width: 1280, height: 720 } } },
    { id: 102, duration: 2, previewURL: 'https://pixabay.com/thumb2.jpg', user: 'another_user', tags: 'city',
      videos: { medium: { url: 'https://pixabay.com/video2.mp4', width: 1280, height: 720 } } },
  ],
};

const COVERR_RESPONSE = {
  hits: [
    { _id: 'abc123', duration: 8, width: 1920, height: 1080, thumbnail: 'https://coverr.co/thumb1.jpg', author: { name: 'Coverr Author' }, title: 'Ocean Waves',
      urls: { mp4_download: 'https://coverr.co/video1.mp4', poster: 'https://coverr.co/poster1.jpg' } },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────

function deleteAllKeys() {
  delete process.env.PEXELS_API_KEY;
  delete process.env.PIXABAY_API_KEY;
  delete process.env.COVERR_API_KEY;
}

// ── generateSearchTerms ─────────────────────────────────────────

describe('generateSearchTerms', () => {
  it('falls back to subject-derived terms when no GEMINI_API_KEY', async () => {
    const terms = await generateSearchTerms('ocean sunset', 'beautiful waves');
    expect(Array.isArray(terms)).toBe(true);
    expect(terms.length).toBeGreaterThan(0);
    terms.forEach(t => expect(typeof t).toBe('string'));
  });

  it('handles empty script gracefully', async () => {
    const terms = await generateSearchTerms('mountain');
    expect(Array.isArray(terms)).toBe(true);
    expect(terms.length).toBeGreaterThan(0);
  });

  it('handles very short subject gracefully', async () => {
    const terms = await generateSearchTerms('AI');
    expect(Array.isArray(terms)).toBe(true);
    expect(terms.some(t => t.toLowerCase().includes('ai'))).toBe(true);
  });
});

// ── getEnabledProviders ─────────────────────────────────────────

describe('getEnabledProviders', () => {
  beforeEach(() => { deleteAllKeys(); });

  it('returns empty array when no keys configured', () => {
    expect(getEnabledProviders()).toEqual([]);
  });

  it('returns providers that have keys configured', () => {
    process.env.PEXELS_API_KEY='pk';
    process.env.COVERR_API_KEY='ck';
    const result = getEnabledProviders();
    expect(result).toHaveLength(2);
    expect(result.map(p => p.id)).toEqual(expect.arrayContaining(['pexels', 'coverr']));
    result.forEach(p => expect(p.configured).toBe(true));
  });
});

// ── isProviderEnabled ───────────────────────────────────────────

describe('isProviderEnabled', () => {
  beforeEach(() => { deleteAllKeys(); });

  it('returns false for unknown provider', () => {
    expect(isProviderEnabled('unknown')).toBe(false);
  });

  it('returns false when no key', () => {
    expect(isProviderEnabled('pexels')).toBe(false);
  });

  it('returns true when key is set', () => {
    process.env.PEXELS_API_KEY='pk';
    expect(isProviderEnabled('pexels')).toBe(true);
  });
});

// ── searchStockVideos ───────────────────────────────────────────

describe('searchStockVideos', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    deleteAllKeys();
  });

  it('returns error for unknown provider', async () => {
    const result = await searchStockVideos('unknown', 'test');
    expect(result.items).toEqual([]);
    expect(result.error).toContain('Unknown provider');
  });

  it('returns error when API key is missing', async () => {
    const result = await searchStockVideos('pexels', 'test');
    expect(result.items).toEqual([]);
    expect(result.error).toContain('API key not configured');
  });

  it('searches Pexels successfully', async () => {
    process.env.PEXELS_API_KEY='pk';
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => PEXELS_RESPONSE });

    const result = await searchStockVideos('pexels', 'nature', { minDuration: 3 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].provider).toBe('pexels');
    expect(result.items[0].url).toBe('https://pexels.com/video1.mp4');

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('api.pexels.com/videos/search');
    expect(callUrl).toContain('query=nature');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('pk');
  });

  it('searches Pixabay successfully', async () => {
    process.env.PIXABAY_API_KEY='pixk';
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => PIXABAY_RESPONSE });

    const result = await searchStockVideos('pixabay', 'forest', { minDuration: 3 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].provider).toBe('pixabay');
    expect(result.items[0].url).toBe('https://pixabay.com/video1_large.mp4');

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('pixabay.com/api/videos/');
    expect(callUrl).toContain('key=pixk');
  });

  it('searches Coverr successfully', async () => {
    process.env.COVERR_API_KEY='ck';
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => COVERR_RESPONSE });

    const result = await searchStockVideos('coverr', 'ocean', { minDuration: 3 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].provider).toBe('coverr');
    expect(result.items[0].url).toBe('https://coverr.co/video1.mp4');

    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer ck');
  });

  it('handles API errors gracefully', async () => {
    process.env.PEXELS_API_KEY='pk';
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Invalid API key' });
    const result = await searchStockVideos('pexels', 'test');
    expect(result.items).toEqual([]);
    expect(result.error).toContain('401');
  });

  it('handles network errors gracefully', async () => {
    process.env.PEXELS_API_KEY='pk';
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
    const result = await searchStockVideos('pexels', 'test');
    expect(result.items).toEqual([]);
    expect(result.error).toContain('Network timeout');
  });
});

// ── searchAllProviders ─────────────────────────────────────────

describe('searchAllProviders', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    deleteAllKeys();
  });

  it('returns empty when no providers configured', async () => {
    const result = await searchAllProviders('test');
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('searches all configured providers', async () => {
    process.env.PEXELS_API_KEY='pk';
    process.env.PIXABAY_API_KEY='pixk';

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => PEXELS_RESPONSE });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => PIXABAY_RESPONSE });

    const result = await searchAllProviders('nature');
    expect(result.items).toHaveLength(3);
    expect(result.errors).toEqual([]);
  });
});

// ── downloadStockVideo ──────────────────────────────────────────

describe('downloadStockVideo', () => {
  it('returns null for invalid URL', async () => {
    const result = await downloadStockVideo('https://invalid.example/video.mp4', '/tmp', 'test.mp4');
    expect(result).toBeNull();
  });
});

// ── findStockVideos ─────────────────────────────────────────────

describe('findStockVideos', () => {
  it('returns empty videos array when no API keys set', async () => {
    const result = await findStockVideos('ocean sunset', 'beautiful waves');
    expect(result).toHaveProperty('videos');
    expect(Array.isArray(result.videos)).toBe(true);
    expect(result.videos.length).toBe(0);
  });

  it('returns empty videos array for empty subject', async () => {
    const result = await findStockVideos('');
    expect(result.videos.length).toBe(0);
  });
});
