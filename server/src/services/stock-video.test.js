import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getEnabledProviders,
  isProviderEnabled,
  searchStockVideos,
  searchAllProviders,
} from './stock-video.js';

// ── Mock fetch ───────────────────────────────────────────────────
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ── Sample API response fixtures ──────────────────────────────────
const PEXELS_RESPONSE = {
  videos: [
    {
      id: 1,
      duration: 15,
      image: 'https://pexels.com/thumb1.jpg',
      user: { name: 'John Doe' },
      video_files: [
        { width: 1920, height: 1080, link: 'https://pexels.com/video1.mp4' },
        { width: 640, height: 360, link: 'https://pexels.com/video1_small.mp4' },
      ],
    },
    {
      id: 2,
      duration: 5,
      image: 'https://pexels.com/thumb2.jpg',
      user: { name: 'Jane Doe' },
      video_files: [
        { width: 1920, height: 1080, link: 'https://pexels.com/video2.mp4' },
      ],
    },
  ],
};

const PIXABAY_RESPONSE = {
  hits: [
    {
      id: 101,
      duration: 12,
      previewURL: 'https://pixabay.com/thumb1.jpg',
      user: 'pixabay_user',
      tags: 'nature, forest',
      videos: {
        large: { url: 'https://pixabay.com/video1_large.mp4', width: 1920, height: 1080 },
        medium: { url: 'https://pixabay.com/video1_medium.mp4', width: 1280, height: 720 },
      },
    },
    {
      id: 102,
      duration: 2, // below minDuration
      previewURL: 'https://pixabay.com/thumb2.jpg',
      user: 'another_user',
      tags: 'city',
      videos: {
        medium: { url: 'https://pixabay.com/video2.mp4', width: 1280, height: 720 },
      },
    },
  ],
};

const COVERR_RESPONSE = {
  hits: [
    {
      _id: 'abc123',
      duration: 8,
      width: 1920,
      height: 1080,
      thumbnail: 'https://coverr.co/thumb1.jpg',
      author: { name: 'Coverr Author' },
      title: 'Ocean Waves',
      urls: { mp4_download: 'https://coverr.co/video1.mp4', poster: 'https://coverr.co/poster1.jpg' },
    },
  ],
};

describe('getEnabledProviders', () => {
  beforeEach(() => {
    delete process.env.PEXELS_API_KEY;
    delete process.env.PIXABAY_API_KEY;
    delete process.env.COVERR_API_KEY;
  });

  it('returns empty array when no keys configured', () => {
    const result = getEnabledProviders();
    expect(result).toEqual([]);
  });

  it('returns providers that have keys configured', () => {
    process.env.PEXELS_API_KEY = 'pexels_key_123';
    process.env.COVERR_API_KEY = 'coverr_key_456';
    const result = getEnabledProviders();
    expect(result).toHaveLength(2);
    expect(result.map(p => p.id)).toEqual(expect.arrayContaining(['pexels', 'coverr']));
    expect(result.map(p => p.name)).toEqual(expect.arrayContaining(['Pexels', 'Coverr']));
    result.forEach(p => expect(p.configured).toBe(true));
  });
});

describe('isProviderEnabled', () => {
  beforeEach(() => {
    delete process.env.PEXELS_API_KEY;
  });

  it('returns false for unknown provider', () => {
    expect(isProviderEnabled('unknown')).toBe(false);
  });

  it('returns false when no key', () => {
    expect(isProviderEnabled('pexels')).toBe(false);
  });

  it('returns true when key is set', () => {
    process.env.PEXELS_API_KEY = 'key';
    expect(isProviderEnabled('pexels')).toBe(true);
  });
});

describe('searchStockVideos', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.PEXELS_API_KEY;
    delete process.env.PIXABAY_API_KEY;
    delete process.env.COVERR_API_KEY;
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
    process.env.PEXELS_API_KEY='pexels_key_123';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PEXELS_RESPONSE,
    });

    const result = await searchStockVideos('pexels', 'nature', { minDuration: 3 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].provider).toBe('pexels');
    expect(result.items[0].url).toBe('https://pexels.com/video1.mp4');
    expect(result.items[0].duration).toBe(15);
    expect(result.items[0].user).toBe('John Doe');

    // Verify fetch was called with the right URL
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('api.pexels.com/videos/search');
    expect(callUrl).toContain('query=nature');

    // Verify auth header
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('pexels_key_123');
  });

  it('searches Pixabay successfully', async () => {
    process.env.PIXABAY_API_KEY='pixabay_key_456';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PIXABAY_RESPONSE,
    });

    const result = await searchStockVideos('pixabay', 'forest', { minDuration: 3 });
    // Only the first video (12s) passes minDuration filter; second is 2s
    expect(result.items).toHaveLength(1);
    expect(result.items[0].provider).toBe('pixabay');
    expect(result.items[0].url).toBe('https://pixabay.com/video1_large.mp4');

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('pixabay.com/api/videos/');
    expect(callUrl).toContain('q=forest');
    // API key is passed as query param for Pixabay
    expect(callUrl).toContain('key=pixabay_key_456');
  });

  it('searches Coverr successfully', async () => {
    process.env.COVERR_API_KEY='coverr_key_789';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => COVERR_RESPONSE,
    });

    const result = await searchStockVideos('coverr', 'ocean', { minDuration: 3 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].provider).toBe('coverr');
    expect(result.items[0].url).toBe('https://coverr.co/video1.mp4');
    expect(result.items[0].duration).toBe(8);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer coverr_key_789');

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('api.coverr.co/videos');
    expect(callUrl).toContain('query=ocean');
  });

  it('handles API errors gracefully', async () => {
    process.env.PEXELS_API_KEY = 'test_key';
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    });

    const result = await searchStockVideos('pexels', 'test');
    expect(result.items).toEqual([]);
    expect(result.error).toContain('401');
  });

  it('handles network errors gracefully', async () => {
    process.env.PEXELS_API_KEY = 'test_key';
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await searchStockVideos('pexels', 'test');
    expect(result.items).toEqual([]);
    expect(result.error).toContain('Network timeout');
  });
});

describe('searchAllProviders', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.PEXELS_API_KEY;
    delete process.env.PIXABAY_API_KEY;
    delete process.env.COVERR_API_KEY;
  });

  it('returns empty when no providers are configured', async () => {
    const result = await searchAllProviders('test');
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('searches all configured providers', async () => {
    process.env.PEXELS_API_KEY = 'pex_key';
    process.env.PIXABAY_API_KEY = 'pix_key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PEXELS_RESPONSE,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PIXABAY_RESPONSE,
    });

    const result = await searchAllProviders('nature');
    // Pexels: 2 items, Pixabay: 1 item (2nd filtered by minDuration=3 default)
    expect(result.items).toHaveLength(3);
    expect(result.errors).toEqual([]);
  });
});
