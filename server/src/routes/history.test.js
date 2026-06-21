import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import initSqlJs from 'sql.js';

/**
 * Integration tests for history routes.
 * Uses a single temp SQLite DB shared across all tests in this file.
 */

const tempDir = '/tmp/www2video-history-test-' + Date.now();
const dbPath = path.join(tempDir, 'www2video.db');

beforeAll(async () => {
  await fs.mkdir(tempDir, { recursive: true });
  process.env.DB_PATH = dbPath;

  // Create fresh DB with schema
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      status TEXT DEFAULT 'generating',
      quality TEXT DEFAULT '1080p',
      source_url TEXT,
      error TEXT,
      brand_colors TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  const data = db.export();
  await fs.writeFile(dbPath, Buffer.from(data));
  db.close();
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function seedVideos(rows) {
  const SQL = await initSqlJs();
  const buf = await fs.readFile(dbPath);
  const db = new SQL.Database(buf);
  // Clear existing
  db.run('DELETE FROM videos');
  for (const row of rows) {
    db.run(
      `INSERT INTO videos (id, prompt, status, quality, source_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, row.prompt, row.status, row.quality || '1080p', row.source_url || null, row.created_at]
    );
  }
  const data = db.export();
  await fs.writeFile(dbPath, Buffer.from(data));
  db.close();
}

describe('History API — GET /api/history', () => {
  it('returns empty array when no videos exist', async () => {
    await seedVideos([]);
    const { default: router } = await import('../routes/history.js');
    const app = express();
    app.use('/api', router);

    const res = await request(app).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns videos ordered by created_at DESC', async () => {
    await seedVideos([
      { id: 'id-1', prompt: 'First video', status: 'done', created_at: '2025-01-01' },
      { id: 'id-2', prompt: 'Second video', status: 'generating', created_at: '2025-06-01' },
      { id: 'id-3', prompt: 'Third video', status: 'error', created_at: '2025-03-15' },
    ]);

    const { default: router } = await import('../routes/history.js?seed');
    const app = express();
    app.use('/api', router);

    const res = await request(app).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].id).toBe('id-2');
    expect(res.body[1].id).toBe('id-3');
    expect(res.body[2].id).toBe('id-1');
  });

  it('returns correct fields for each video', async () => {
    await seedVideos([
      { id: 'test-id', prompt: 'Test prompt', status: 'done', quality: '720p', source_url: 'https://example.com', created_at: '2025-06-01' },
    ]);

    const { default: router } = await import('../routes/history.js?fields');
    const app = express();
    app.use('/api', router);

    const res = await request(app).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      id: 'test-id',
      prompt: 'Test prompt',
      status: 'done',
      quality: '720p',
      source_url: 'https://example.com',
    });
  });
});

describe('History API — DELETE /api/video/:id', () => {
  it('deletes existing video and returns ok', async () => {
    await seedVideos([
      { id: 'vid-to-delete', prompt: 'Delete me', status: 'done', created_at: '2025-01-01' },
    ]);

    const { default: router } = await import('../routes/history.js?del');
    const app = express();
    app.use('/api', router);

    const res = await request(app).delete('/api/video/vid-to-delete');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const listRes = await request(app).get('/api/history');
    expect(listRes.body).toHaveLength(0);
  });

  it('deleting non-existent video still returns ok (no-op)', async () => {
    await seedVideos([]);

    const { default: router } = await import('../routes/history.js?del2');
    const app = express();
    app.use('/api', router);

    const res = await request(app).delete('/api/video/nonexistent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('History API — POST /api/video/:id/re-render', () => {
  it('returns 404 for non-existent video', async () => {
    await seedVideos([]);

    const { default: router } = await import('../routes/history.js?rerender');
    const app = express();
    app.use(express.json());
    app.use('/api', router);

    // Use a try/catch since re-render might fail on the background import
    const res = await request(app)
      .post('/api/video/nonexistent/re-render')
      .send({ prompt: 'test' });

    // The route should 404 before trying background gen
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
