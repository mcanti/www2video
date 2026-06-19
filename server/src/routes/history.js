import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import initSqlJs from 'sql.js';

const router = Router();

const DB_PATH = process.env.DB_PATH || path.resolve('/app/server/data', 'www2video.db');

let _SQL = null;
async function getSQL() {
  if (!_SQL) _SQL = await initSqlJs();
  return _SQL;
}

async function queryAll(sql, params = []) {
  const SQL = await getSQL();
  let db;
  try {
    const buf = await fs.readFile(DB_PATH);
    db = new SQL.Database(buf);
  } catch {
    return [];
  }
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  db.close();
  return rows;
}

// GET /api/history
router.get('/history', async (req, res) => {
  try {
    const rows = await queryAll(
      'SELECT id, prompt, status, quality, source_url, error, created_at FROM videos ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/video/:id
router.delete('/video/:id', async (req, res) => {
  try {
    const SQL = await getSQL();
    const buf = await fs.readFile(DB_PATH);
    const db = new SQL.Database(buf);
    db.run('DELETE FROM videos WHERE id = ?', [req.params.id]);
    const data = db.export();
    await fs.writeFile(DB_PATH, Buffer.from(data));
    db.close();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/video/:id/re-render
router.post('/video/:id/re-render', async (req, res) => {
  try {
    const SQL = await getSQL();
    const buf = await fs.readFile(DB_PATH);
    const db = new SQL.Database(buf);

    const stmt = db.prepare('SELECT * FROM videos WHERE id = ?');
    stmt.bind([req.params.id]);
    let video = null;
    if (stmt.step()) video = stmt.getAsObject();
    stmt.free();

    if (!video) {
      db.close();
      return res.status(404).json({ error: 'Not found' });
    }

    const newId = crypto.randomUUID();
    const newPrompt = req.body.prompt || video.prompt;
    db.run(`INSERT INTO videos (id, prompt, status, source_url, brand_colors) VALUES (?, ?, 'generating', ?, ?)`,
      [newId, newPrompt, video.source_url, video.brand_colors]);
    const data = db.export();
    await fs.writeFile(DB_PATH, Buffer.from(data));
    db.close();

    // Import and trigger background gen (dynamic to avoid circular)
    const { generateInBackground, generateFromWebsite } = await import('./video.js');
    if (video.source_url) {
      generateFromWebsite(newId, video.source_url, newPrompt);
    } else {
      generateInBackground(newId, newPrompt, {});
    }

    res.status(202).json({ videoId: newId, status: 'generating' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
