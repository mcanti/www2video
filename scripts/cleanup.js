#!/usr/bin/env node

/**
 * www2video Auto-Cleanup Job
 * Removes projects and render files older than MAX_AGE_DAYS (default 7).
 * Run: node scripts/cleanup.js
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import initSqlJs from 'sql.js';

const MAX_AGE_DAYS = parseInt(process.env.MAX_AGE_DAYS || '7', 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const DB_PATH = process.env.DB_PATH || '/app/server/data/www2video.db';
const RENDERS_DIR = process.env.RENDERS_DIR || '/app/server/renders';

async function main() {
  console.log(`[cleanup] Starting (max age: ${MAX_AGE_DAYS} days)...`);

  const SQL = await initSqlJs();
  let db;
  try {
    const buf = await fs.readFile(DB_PATH);
    db = new SQL.Database(buf);
  } catch {
    console.log('[cleanup] No DB found.');
    return;
  }

  const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
  console.log(`[cleanup] Cutoff: ${cutoff}`);

  const stmt = db.prepare(
    "SELECT id, composition_path, render_path, tts_path FROM videos WHERE (status = 'ready' OR status = 'failed') AND created_at < ?"
  );
  stmt.bind([cutoff]);

  const toDelete = [];
  while (stmt.step()) toDelete.push(stmt.getAsObject());
  stmt.free();

  console.log(`[cleanup] Found ${toDelete.length} old videos`);

  let deletedFiles = 0;
  let freedBytes = 0;

  for (const video of toDelete) {
    for (const p of [video.composition_path, video.render_path, video.tts_path]) {
      if (p) {
        try {
          const stat = await fs.stat(p).catch(() => null);
          if (stat) {
            await fs.rm(p, { recursive: true, force: true });
            freedBytes += stat.size;
            deletedFiles++;
          }
        } catch {}
      }
    }
    db.run('DELETE FROM videos WHERE id = ?', [video.id]);
  }

  // Clean orphaned render dirs
  if (existsSync(RENDERS_DIR)) {
    const entries = await fs.readdir(RENDERS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const p = path.join(RENDERS_DIR, entry.name);
      try {
        const stat = await fs.stat(p);
        if (Date.now() - stat.mtimeMs > MAX_AGE_MS) {
          const cs = db.prepare("SELECT 1 FROM videos WHERE composition_path = ? OR render_path LIKE ?");
          cs.bind([p, `${p}%`]);
          const hasRef = cs.step();
          cs.free();
          if (!hasRef) {
            await fs.rm(p, { recursive: true, force: true });
            freedBytes += stat.size;
            deletedFiles++;
          }
        }
      } catch {}
    }
  }

  const data = db.export();
  const tmpPath = DB_PATH + '.tmp.cleanup';
  await fs.writeFile(tmpPath, Buffer.from(data));
  await fs.rename(tmpPath, DB_PATH);
  db.close();

  console.log(`[cleanup] Done. Deleted ${deletedFiles} files, freed ${(freedBytes/1024/1024).toFixed(2)} MB`);
}

main().catch(err => {
  console.error('[cleanup] Error:', err.message);
  process.exit(1);
});
