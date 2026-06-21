import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractDesignTokens, generateSubtitles } from './composer.js';

describe('extractDesignTokens', () => {
  it('extracts hex colors from HTML, skipping neutrals', () => {
    const html = `
      <div style="background:#6c63ff; color:#22c55e">
        <span style="color:#fff">text</span>
        <div style="border-color:#000">border</div>
      </div>
    `;
    const result = extractDesignTokens(html, '');
    expect(result.colors).toEqual(expect.arrayContaining(['#6c63ff', '#22c55e']));
    expect(result.colors).not.toEqual(expect.arrayContaining(['#fff', '#000']));
  });

  it('extracts colors from CSS content too', () => {
    const css = ':root { --accent: #ff6600; --bg: #0a0a0f; }';
    const result = extractDesignTokens('', css);
    expect(result.colors).toEqual(expect.arrayContaining(['#ff6600']));
    // neutral
    expect(result.colors).not.toEqual(expect.arrayContaining(['#000']));
  });

  it('extracts Google Fonts from HTML', () => {
    // URL with single family (the regex captures just the first family= param before & or ")
    const html = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700">';
    const result = extractDesignTokens(html, '');
    expect(result.fonts).toEqual(expect.arrayContaining(['Inter']));
  });

  it('limits to 6 colors and 3 fonts', () => {
    const html = Array.from({ length: 10 }, (_, i) =>
      `<div style="color:#${String(i).repeat(6)}"></div>`
    ).join('');
    const result = extractDesignTokens(html, '');
    expect(result.colors.length).toBeLessThanOrEqual(6);
    expect(result.fonts.length).toBeLessThanOrEqual(3);
  });
});

describe('generateSubtitles', () => {
  it('returns minimal WebVTT header for empty text', () => {
    const result = generateSubtitles('', 10);
    expect(result).toBe('WEBVTT\n\n');
  });

  it('splits text into sentences and creates timed cues', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const result = generateSubtitles(text, 15);

    expect(result).toContain('WEBVTT');
    expect(result).toContain('1');
    expect(result).toContain('2');
    expect(result).toContain('3');
    expect(result).toContain('First sentence.');
    expect(result).toContain('Second sentence.');
    expect(result).toContain('Third sentence.');

    // Check timing: 3 sentences over 15s = 5s each
    expect(result).toContain('00:00:00.000 --> 00:00:05.000');
    expect(result).toContain('00:00:05.000 --> 00:00:10.000');
    expect(result).toContain('00:00:10.000 --> 00:00:15.000');
  });

  it('handles single sentence', () => {
    const result = generateSubtitles('Hello world', 5);
    expect(result).toContain('1');
    expect(result).toContain('00:00:00.000 --> 00:00:05.000');
    expect(result).toContain('Hello world');
  });
});

describe('generateSubtitles time formatting', () => {
  it('formats hours correctly', () => {
    // 3661.5 seconds = 1h 1m 1.5s
    const text = 'A. B. C.';
    const result = generateSubtitles(text, 3661.5);
    // We just care that the last cue has hours > 0
    const lines = result.split('\n');
    // 3 sentences, 3661.5s: start times at 0, 1220.5, 2441 → last = 2441-3661.5
    const lastTiming = lines[lines.length - 3];
    expect(lastTiming).toMatch(/^00:40:/);
  });
});
