import { Router } from 'express';
import { createEngine } from '../services/hyperframes.js';
import { composeFromPrompt, extractDesignTokens, generateTTS, generateSubtitles } from '../services/composer.js';
import { fetchRenderedDOM, extractBrandTokens } from '../services/website-scraper.js';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import initSqlJs from 'sql.js';

const router = Router();

const DB_PATH = process.env.DB_PATH || path.resolve('/app/server/data', 'www2video.db');
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.resolve('/app/server/data', 'projects');

let _SQL = null;
async function getSQL() {
  if (!_SQL) _SQL = await initSqlJs();
  return _SQL;
}

async function getDb() {
  const SQL = await getSQL();
  let db;
  try {
    const buf = await fs.readFile(DB_PATH);
    db = new SQL.Database(buf);
  } catch {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    status TEXT DEFAULT 'generating',
    progress TEXT DEFAULT '{}',
    quality TEXT DEFAULT 'draft',
    composition_path TEXT,
    render_path TEXT,
    tts_path TEXT,
    image_paths TEXT,
    source_url TEXT,
    brand_colors TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  // Ensure progress column exists for older DBs
  try { db.run('ALTER TABLE videos ADD COLUMN progress TEXT DEFAULT \'{}\''); } catch {}
  try { db.run('ALTER TABLE videos ADD COLUMN debug_info TEXT DEFAULT \'{}\''); } catch {}
  return db;
}

async function saveAndClose(db) {
  const data = db.export();
  const buffer = Buffer.from(data);
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  // Atomic write: write to temp file, then rename
  const tmpPath = DB_PATH + '.tmp.' + Date.now();
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, DB_PATH);
  db.close();
}

function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

async function updateProgress(videoId, step, message, pct) {
  const progress = JSON.stringify({ step, message, pct });
  try {
    const db = await getDb();
    db.run('UPDATE videos SET progress = ?, updated_at = datetime(\'now\') WHERE id = ?', [progress, videoId]);
    await saveAndClose(db);
  } catch {}
}

async function updateDebug(videoId, info) {
  try {
    const db = await getDb();
    // Read existing debug_info and merge (use prepare, not exec — exec ignores params)
    let existing = {};
    try {
      const stmt = db.prepare('SELECT debug_info FROM videos WHERE id = ?');
      stmt.bind([videoId]);
      if (stmt.step()) {
        existing = JSON.parse(stmt.getAsObject().debug_info || '{}');
      }
      stmt.free();
    } catch (e) {
      console.error('[updateDebug] read error:', e.message);
    }
    const merged = { ...existing, ...info, _updated: new Date().toISOString() };
    db.run('UPDATE videos SET debug_info = ?, updated_at = datetime(\'now\') WHERE id = ?', [JSON.stringify(merged), videoId]);
    await saveAndClose(db);
  } catch (e) {
    console.error('[updateDebug] error:', e.message);
  }
}

// POST /api/video/generate
router.post('/generate', async (req, res) => {
  try {
    const { prompt, options = {} } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const db = await getDb();
    const videoId = crypto.randomUUID();
    const quality = options.quality || 'draft';
    const duration = Math.min(Math.max(parseInt(options.duration) || 10, 1), 120);
    const audioPrompt = options.audioPrompt || '';
    const sourceUrl = options.sourceUrl || '';
    const initialProgress = JSON.stringify({ step: 'queued', message: 'In queue...', pct: 0 });

    if (sourceUrl) {
      db.run(`INSERT INTO videos (id, prompt, quality, status, source_url, progress) VALUES (?, ?, ?, 'generating', ?, ?)`,
        [videoId, prompt, quality, sourceUrl, initialProgress]);
    } else {
      db.run(`INSERT INTO videos (id, prompt, quality, status, progress) VALUES (?, ?, ?, 'generating', ?)`,
        [videoId, prompt, quality, initialProgress]);
    }
    await saveAndClose(db);

    generateInBackground(videoId, prompt, { ...options, duration, audioPrompt, sourceUrl });

    res.status(202).json({
      videoId,
      status: 'generating',
      progress: { step: 'queued', message: 'In queue...', pct: 0 },
    });
  } catch (err) {
    console.error('[generate] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video/:id/status
router.get('/:id/status', async (req, res) => {
  try {
    const db = await getDb();
    const video = queryOne(db, 'SELECT * FROM videos WHERE id = ?', [req.params.id]);
    await saveAndClose(db);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    let progress = { step: video.status, message: '', pct: 0 };
    try { progress = JSON.parse(video.progress || '{}'); } catch {}

    let debugInfo = null;
    try { debugInfo = JSON.parse(video.debug_info || '{}'); } catch {}

    res.json({
      videoId: video.id,
      status: video.status,
      progress,
      debugInfo,
      prompt: video.prompt,
      previewUrl: video.status === 'ready' ? `/api/video/${video.id}/preview` : null,
      downloadUrl: video.status === 'ready' ? `/api/video/${video.id}/download` : null,
      error: video.error,
      createdAt: video.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video/:id/preview
router.get('/:id/preview', async (req, res) => {
  try {
    const db = await getDb();
    const video = queryOne(db, 'SELECT * FROM videos WHERE id = ?', [req.params.id]);
    await saveAndClose(db);

    if (!video) return res.status(404).json({ error: 'Not found' });
    if (video.status !== 'ready') return res.status(400).json({ error: 'Video not ready yet' });
    if (!video.composition_path) return res.status(400).json({ error: 'No composition path' });

    const htmlPath = path.join(video.composition_path, 'index.html');
    const html = await fs.readFile(htmlPath, 'utf-8');
    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const db = await getDb();
    const video = queryOne(db, 'SELECT * FROM videos WHERE id = ?', [req.params.id]);
    await saveAndClose(db);

    if (!video) return res.status(404).json({ error: 'Not found' });
    if (video.status !== 'ready') return res.status(400).json({ error: 'Video not ready yet' });
    if (!video.render_path || !existsSync(video.render_path)) {
      return res.status(404).json({ error: 'Render file not found' });
    }

    res.download(video.render_path, `www2video-${video.id.slice(0, 8)}.mp4`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /api/video/tts
router.post('/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const result = await generateTTS(text);
    if (result instanceof ArrayBuffer || result instanceof Buffer) {
      res.set('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(result));
    } else {
      res.json({ text: result.text || result });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/video/subtitles
router.post('/subtitles', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const vtt = await generateSubtitles(text);
    res.set('Content-Type', 'text/vtt');
    res.send(vtt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Background generation with detailed progress
async function generateInBackground(videoId, prompt, options) {
  try {
    const duration = options.duration || 10;
    const audioPrompt = options.audioPrompt || '';

    // --- Website scraping (optional, when sourceUrl is provided) ---
    let brandColors = null;
    let brandFonts = null;
    let websiteName = null;
    let themeColor = null;
    let enrichedPrompt = prompt;

    if (options.sourceUrl) {
      await updateProgress(videoId, 'fetching_website', '🌐 Se preia site-ul...', 1);
      let renderedHTML = '';
      try {
        renderedHTML = await fetchRenderedDOM(options.sourceUrl);
      } catch {
        try {
          const response = await fetch(options.sourceUrl, { signal: AbortSignal.timeout(10000) });
          renderedHTML = await response.text();
        } catch {}
      }

      await updateProgress(videoId, 'extracting_identity', '🎨 Se extrage identitatea vizuală...', 2);
      const tokens = extractBrandTokens(renderedHTML);
      themeColor = tokens.themeColor || (tokens.colors.length > 0 ? tokens.colors[0] : null);
      brandColors = tokens.colors;
      brandFonts = tokens.fonts;

      if (tokens.title) {
        enrichedPrompt = `Create a promotional video for: ${tokens.title} (${options.sourceUrl})\n\n${enrichedPrompt}`;
      }
      if (tokens.description) {
        enrichedPrompt += `\n\nAbout: ${tokens.description}`;
      }
      websiteName = tokens.title || new URL(options.sourceUrl).hostname;

      // Save brand colors to DB immediately
      const dbBrand = await getDb();
      dbBrand.run('UPDATE videos SET brand_colors = ? WHERE id = ?', [JSON.stringify(tokens.colors), videoId]);
      await saveAndClose(dbBrand);
    }

    await updateProgress(videoId, 'initializing', '📁 Se pregătește proiectul...', 5);
    await fs.mkdir(PROJECTS_DIR, { recursive: true });

    const { engine, workDir } = await createEngine(PROJECTS_DIR);
    await updateProgress(videoId, 'initialized', '📁 Proiect creat', 8);

    await updateProgress(videoId, 'generating_composition', '🤖 Se generează conținutul video...', 10);
    await engine.init('blank');
    await updateProgress(videoId, 'composition_ai', '🤖 Conținut generat cu AI', 15);

    const compositionOptions = { ...options, duration };
    if (brandColors) compositionOptions.brandColors = brandColors;
    if (brandFonts) compositionOptions.brandFonts = brandFonts;
    if (websiteName) compositionOptions.websiteName = websiteName;
    if (themeColor) compositionOptions.themeColor = themeColor;

    const html = await composeFromPrompt(enrichedPrompt, compositionOptions);
    await updateDebug(videoId, { composition_html: html.substring(0, 5000) });
    await updateProgress(videoId, 'composition_done', '✅ Conținut generat', 30);

    await engine.writeComposition(html);
    await updateProgress(videoId, 'writing_composition', '💾 Se salvează...', 33);

    // Generate TTS audio if audioPrompt provided or auto-generate
    let ttsPath = null;
    let narrationText = audioPrompt;
    if (!narrationText.trim() && options.useAudio) {
      // Auto-generate narration from video prompt
      await updateProgress(videoId, 'generating_audio', '🎵 Se creează textul audio...', 33);
      try {
        const genAI = new (await import('@google/generative-ai')).GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const result = await model.generateContent([
          { text: 'Generate 3-5 sentences for a professional voiceover narration script (in Romanian) for this video. The sentences should flow naturally from one to the next. Return ONLY the spoken text, no formatting. Total: 40-80 words.' },
          { text: `Video content: ${enrichedPrompt}` },
        ]);
        narrationText = result.response.text().trim();
        console.log('[generate] auto-narration:', narrationText.slice(0, 100));
        await updateDebug(videoId, { auto_narration: narrationText });
        await updateProgress(videoId, 'generating_audio', '🎵 Text audio creat', 34);
      } catch (e) {
        console.error('[generate] auto-narration error:', e.message);
      }
    }

    if (narrationText.trim()) {
      await updateProgress(videoId, 'generating_audio', '🎵 Se generează audio...', 35);
      try {
        const audioDir = path.join(workDir, 'audio');
        await fs.mkdir(audioDir, { recursive: true });
        const audioResult = await generateTTS(narrationText);
        if (audioResult instanceof ArrayBuffer || audioResult instanceof Buffer) {
          ttsPath = path.join(audioDir, 'narration.mp3');
          await fs.writeFile(ttsPath, Buffer.from(audioResult));
          await updateProgress(videoId, 'audio_done', '🎵 Audio generat', 38);
        } else {
          await updateProgress(videoId, 'audio_skip', '⚠️ Audio text-only (fallback)', 38);
        }
      } catch (e) {
        console.error('[generate] TTS error:', e.message);
        await updateProgress(videoId, 'audio_skip', '⚠️ Audio indisponibil momentan', 38);
      }
    }

    // Inject audio into composition HTML if we have it
    if (ttsPath) {
      const compositionPath = path.join(workDir, 'index.html');
      let composition = await fs.readFile(compositionPath, 'utf-8');
      // Use relative path so Chrome headless can load the audio file
      const audioRelPath = 'audio/narration.mp3';
      const audioTag = `<audio id="narration" src="${audioRelPath}" data-start="0" data-duration="${duration}" data-track-index="10" data-volume="0.8"></audio>`;
      composition = composition.replace('</body>', `${audioTag}\n</body>`);
      await fs.writeFile(compositionPath, composition);
      const dbA = await getDb();
      dbA.run('UPDATE videos SET tts_path = ? WHERE id = ?', [ttsPath, videoId]);
      await saveAndClose(dbA);
    }

    // Generate subtitles (WebVTT) if requested and narration text exists
    if (options.useSubtitles && narrationText.trim()) {
      try {
        const vttDir = path.join(workDir, 'vtt');
        await fs.mkdir(vttDir, { recursive: true });
        const vttContent = generateSubtitles(narrationText, duration);
        const vttPath = path.join(vttDir, 'subtitles.vtt');
        await fs.writeFile(vttPath, vttContent, 'utf-8');
        console.log('[generate] subtitles written to', vttPath);

        // Inject <track> into composition HTML
        const compositionPath = path.join(workDir, 'index.html');
        let composition = await fs.readFile(compositionPath, 'utf-8');
        composition = composition.replace(
          '</body>',
          '<track kind="subtitles" src="vtt/subtitles.vtt" srclang="ro" label="Română" default>\n</body>'
        );
        await fs.writeFile(compositionPath, composition);
        await updateDebug(videoId, { subtitles_vtt: vttContent.substring(0, 500) });
      } catch (e) {
        console.error('[generate] subtitles error:', e.message);
      }
    }

    // Save composition path
    const db = await getDb();
    db.run('UPDATE videos SET composition_path = ? WHERE id = ?', [workDir, videoId]);
    await saveAndClose(db);

    await updateProgress(videoId, 'validating', '🔍 Se validează conținutul...', 40);
    const lintResult = await engine.lint();
    await updateDebug(videoId, { lint: lintResult });
    if (!lintResult.ok) {
      await updateProgress(videoId, 'lint_warning', '⚠️ Mici ajustări (se continuă oricum)', 42);
    } else {
      await updateProgress(videoId, 'validated', '✅ Conținut validat', 45);
    }

    await updateProgress(videoId, 'rendering_video', '🎬 Se generează videoclipul...', 50);

    const renderResult = await engine.render({ quality: options.quality || 'draft' });

    await updateProgress(videoId, 'finalizing', '📦 Se finalizează...', 95);

    const db2 = await getDb();
    if (renderResult.ok) {
      // Store render debug on same connection (avoid race with updateDebug)
      let debugMerged = {};
      try {
        const s2 = db2.prepare('SELECT debug_info FROM videos WHERE id = ?');
        s2.bind([videoId]);
        if (s2.step()) debugMerged = JSON.parse(s2.getAsObject().debug_info || '{}');
        s2.free();
      } catch {}
      debugMerged.render = { ok: true, path: renderResult.outputPath };
      debugMerged._updated = new Date().toISOString();
      db2.run('UPDATE videos SET debug_info = ? WHERE id = ?', [JSON.stringify(debugMerged), videoId]);
      const doneProgress = JSON.stringify({ step: 'ready', message: '✅ Video gata!', pct: 100 });
      db2.run(`UPDATE videos SET status = 'ready', render_path = ?, progress = ?, updated_at = datetime('now') WHERE id = ?`,
        [renderResult.outputPath, doneProgress, videoId]);
    } else {
      const failProgress = JSON.stringify({ step: 'failed', message: renderResult.error || 'Render failed', pct: 0 });
      db2.run(`UPDATE videos SET status = 'failed', error = ?, progress = ?, updated_at = datetime('now') WHERE id = ?`,
        [renderResult.error || 'Render failed', failProgress, videoId]);
    }
    await saveAndClose(db2);
  } catch (err) {
    try {
      const failProgress = JSON.stringify({ step: 'failed', message: err.message, pct: 0 });
      const db = await getDb();
      db.run(`UPDATE videos SET status = 'failed', error = ?, progress = ?, updated_at = datetime('now') WHERE id = ?`,
        [err.message, failProgress, videoId]);
      await saveAndClose(db);
    } catch {}
  }
}

export { generateInBackground };
export default router;
