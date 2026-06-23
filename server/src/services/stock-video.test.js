import { describe, it, expect, vi } from 'vitest';
import { generateSearchTerms, searchPexelsVideos, downloadStockVideo, findStockVideos } from './stock-video.js';

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
    // Should fallback to subject itself
    expect(terms.some(t => t.toLowerCase().includes('ai'))).toBe(true);
  });
});

describe('searchPexelsVideos', () => {
  it('returns empty array when no PEXELS_API_KEY', async () => {
    const results = await searchPexelsVideos('ocean');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('respects perPage parameter', async () => {
    const results = await searchPexelsVideos('ocean', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

describe('downloadStockVideo', () => {
  it('returns null for invalid URL', async () => {
    const result = await downloadStockVideo('https://invalid.example/video.mp4', '/tmp', 'test.mp4');
    expect(result).toBeNull();
  });
});

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
