import { describe, it, expect } from 'vitest';
import { extractBrandTokens } from './website-scraper.js';

describe('extractBrandTokens', () => {
  it('extracts title from <title> tag', () => {
    const html = '<html><head><title>My Website</title></head><body></body></html>';
    const result = extractBrandTokens(html);
    expect(result.title).toBe('My Website');
  });

  it('extracts meta description', () => {
    const html = '<meta name="description" content="A great website about things">';
    const result = extractBrandTokens(html);
    expect(result.description).toBe('A great website about things');
  });

  it('extracts theme-color meta tag', () => {
    const html = '<meta name="theme-color" content="#6c63ff">';
    const result = extractBrandTokens(html);
    expect(result.themeColor).toBe('#6c63ff');
    expect(result.colors).toContain('#6c63ff');
  });

  it('extracts hex colors from inline styles', () => {
    const html = `
      <div style="background:#ff6600"></div>
      <span style="color:#22c55e"></span>
      <div style="border:1px solid #000"></div>
    `;
    const result = extractBrandTokens(html);
    expect(result.colors).toEqual(expect.arrayContaining(['#ff6600', '#22c55e']));
    // Neutral colors are skipped
    expect(result.colors).not.toEqual(expect.arrayContaining(['#000']));
  });

  it('extracts Google Fonts', () => {
    // Single family= param
    const html = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700">';
    const result = extractBrandTokens(html);
    expect(result.fonts).toEqual(expect.arrayContaining(['Inter']));
  });

  it('extracts fonts from inline font-family styles', () => {
    const html = '<div style="font-family: Arial, sans-serif">text</div>';
    const result = extractBrandTokens(html);
    expect(result.fonts).toEqual(expect.arrayContaining(['Arial']));
  });

  it('limits colors to 8 and fonts to 4', () => {
    const spans = Array.from({ length: 15 }, (_, i) =>
      `<span style="color:#${String(i).repeat(6)}"></span>`
    ).join('');
    const result = extractBrandTokens(spans);
    expect(result.colors.length).toBeLessThanOrEqual(8);
    expect(result.fonts.length).toBeLessThanOrEqual(4);
  });

  it('returns empty strings when no title/description found', () => {
    const result = extractBrandTokens('<html><body></body></html>');
    expect(result.title).toBe('');
    expect(result.description).toBe('');
    expect(result.themeColor).toBeNull();
  });

  // ---- Logo extraction tests (existing) ----

  it('logo: extracts favicon from <link rel="icon">', () => {
    const html = '<link rel="icon" href="/favicon.ico">';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBe('https://example.com/favicon.ico');
  });

  it('logo: extracts favicon from <link rel="shortcut icon">', () => {
    const html = '<link rel="shortcut icon" href="/assets/favicon.png">';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBe('https://example.com/assets/favicon.png');
  });

  it('logo: extracts favicon with href before rel attribute', () => {
    const html = '<link href="/favicon.ico" rel="icon">';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBe('https://example.com/favicon.ico');
  });

  it('logo: extracts apple-touch-icon', () => {
    const html = '<link rel="apple-touch-icon" href="/apple-icon.png">';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBe('https://example.com/apple-icon.png');
  });

  it('logo: prefers rel="icon" over apple-touch-icon (priority order)', () => {
    const html = `
      <link rel="apple-touch-icon" href="/apple-icon.png">
      <link rel="icon" href="/favicon.ico">
    `;
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBe('https://example.com/favicon.ico');
  });

  it('logo: extracts og:image meta tag', () => {
    const html = '<meta property="og:image" content="https://example.com/og-image.jpg">';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBe('https://example.com/og-image.jpg');
  });

  it('logo: extracts twitter:image meta tag', () => {
    const html = '<meta name="twitter:image" content="https://example.com/twitter-card.png">';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBe('https://example.com/twitter-card.png');
  });

  it('logo: prefers favicon over og:image (priority order)', () => {
    const html = `
      <meta property="og:image" content="https://example.com/og-image.jpg">
      <link rel="icon" href="/favicon.ico">
    `;
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBe('https://example.com/favicon.ico');
  });

  it('logo: handles absolute favicon URLs', () => {
    const html = '<link rel="icon" href="https://cdn.example.com/favicon.ico">';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBe('https://cdn.example.com/favicon.ico');
  });

  it('logo: returns null logoUrl when no icon/logo found', () => {
    const html = '<html><head><title>No icon</title></head><body></body></html>';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.logoUrl).toBeNull();
  });

  it('logo: keeps relative URL when no baseUrl provided', () => {
    const html = '<link rel="icon" href="/favicon.ico">';
    const result = extractBrandTokens(html);
    expect(result.logoUrl).toBe('/favicon.ico');
  });

  it('handles HTML-encoded ampersands in Google Fonts URLs', () => {
    const html = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400&amp;display=swap">';
    const result = extractBrandTokens(html);
    expect(result.fonts).toEqual(expect.arrayContaining(['Inter']));
  });

  // ---- Favicon-specific extraction (browser tab icon) ----

  it('favicon: extracts faviconUrl from <link rel="icon">', () => {
    const html = '<link rel="icon" href="/favicon.ico">';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.faviconUrl).toBe('https://example.com/favicon.ico');
  });

  it('favicon: returns null when no favicon present', () => {
    const html = '<html><head><title>No icon</title></head><body></body></html>';
    const result = extractBrandTokens(html, 'https://example.com');
    expect(result.faviconUrl).toBeNull();
  });

  // ---- Google Fonts URL extraction ----

  it('googleFonts: extracts full Google Fonts URLs', () => {
    const html = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto:wght@400&display=swap" rel="stylesheet">';
    const result = extractBrandTokens(html);
    expect(result.googleFontsUrls).toContain(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto:wght@400&display=swap'
    );
    expect(result.fonts).toEqual(expect.arrayContaining(['Inter', 'Roboto']));
  });

  it('googleFonts: deduplicates URLs', () => {
    const html = `
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400" rel="preload">
    `;
    const result = extractBrandTokens(html);
    expect(result.googleFontsUrls.length).toBe(1);
  });
});
