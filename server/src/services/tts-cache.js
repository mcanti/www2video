import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger.js';

/**
 * TTS Caching Layer.
 * Caches generated WAV audio by MD5(text + voice) to avoid re-calling Vertex AI.
 * Stores audio on disk (in a cache dir) and tracks entries in SQLite.
 */

function hashKey(text, voice) {
  return crypto.createHash('md5').update(`${voice}:${text}`).digest('hex');
}

/**
 * Check if TTS audio for the given text+voice exists in cache.
 * Returns WAV Buffer if cached, null otherwise.
 */
export async function getCachedTTS(text, voice, db, cacheDir) {
  try {
    const key = hashKey(text, voice);
    const stmt = db.prepare('SELECT cached FROM tts_cache WHERE cache_key = ?');
    stmt.bind([key]);
    let cached = 0;
    if (stmt.step()) cached = stmt.getAsObject().cached;
    stmt.free();

    if (!cached) return null;

    const filePath = path.join(cacheDir, `${key}.wav`);
    try {
      return await fs.readFile(filePath);
    } catch {
      return null;
    }
  } catch (err) {
    logger.warn({ err }, 'TTS cache read error');
    return null;
  }
}

/**
 * Store TTS audio in cache.
 */
export async function cacheTTS(text, voice, audioBuffer, db, cacheDir) {
  try {
    const key = hashKey(text, voice);
    const filePath = path.join(cacheDir, `${key}.wav`);

    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(filePath, audioBuffer);

    db.run(
      'INSERT OR REPLACE INTO tts_cache (cache_key, cached) VALUES (?, 1)',
      [key]
    );

    logger.info({ cacheKey: key.slice(0, 12), size: audioBuffer.length }, 'TTS cached');
  } catch (err) {
    logger.warn({ err }, 'TTS cache write error');
  }
}

/**
 * Create the tts_cache table if it doesn't exist.
 */
export function initTTSCacheTable(db) {
  try {
    db.run(`CREATE TABLE IF NOT EXISTS tts_cache (
      cache_key TEXT PRIMARY KEY,
      cached INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch {}
}

export { hashKey };
