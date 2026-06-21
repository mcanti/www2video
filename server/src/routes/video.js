import { Router } from 'express';
import { createEngine } from '../services/hyperframes.js';
import { composeFromPrompt, extractDesignTokens, generateTTS, generateSubtitles } from '../services/composer.js';
import { fetchRenderedDOM, extractBrandTokens } from '../services/website-scraper.js';
import { getCachedTTS, cacheTTS, initTTSCacheTable } from '../services/tts-cache.js';
import { rateLimitGenerate } from '../middleware/rateLimit.js';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, openSync, readSync, closeSync } from 'fs';
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
  try { db.run("ALTER TABLE videos ADD COLUMN progress TEXT DEFAULT '{}'"); } catch {}
  try { db.run("ALTER TABLE videos ADD COLUMN debug_info TEXT DEFAULT '{}'"); } catch {}
  try { db.run("ALTER TABLE videos ADD COLUMN tts_text TEXT DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE videos ADD COLUMN tts_voice TEXT DEFAULT 'Kore'"); } catch {}
  try { db.run("ALTER TABLE videos ADD COLUMN logo_path TEXT DEFAULT ''"); } catch {}
  initTTSCacheTable(db);
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

/**
 * Read WAV file header to get the actual audio duration in seconds
 * Works with standard 44-byte WAV header (PCM, any sample rate/channels/bps)
 */
function getWavDuration(wavPath) {
  const header = Buffer.alloc(44);
  const fd = openSync(wavPath, 'r');
  readSync(fd, header, 0, 44, 0);
  closeSync(fd);
  const sampleRate = header.readUInt32LE(24);
  const bitsPerSample = header.readUInt16LE(34);
  const numChannels = header.readUInt16LE(22);
  const dataSize = header.readUInt32LE(40);
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = dataSize / (bytesPerSample * numChannels);
  return numSamples / sampleRate;
}

// POST /api/video/generate
router.post('/generate', rateLimitGenerate, async (req, res) => {
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

    const voiceName = options.voiceName || 'Kore';

    if (sourceUrl) {
      db.run(`INSERT INTO videos (id, prompt, quality, status, source_url, progress, tts_voice) VALUES (?, ?, ?, 'generating', ?, ?, ?)`,
        [videoId, prompt, quality, sourceUrl, initialProgress, voiceName]);
    } else {
      db.run(`INSERT INTO videos (id, prompt, quality, status, progress, tts_voice) VALUES (?, ?, ?, 'generating', ?, ?)`,
        [videoId, prompt, quality, initialProgress, voiceName]);
    }
    await saveAndClose(db);

    generateInBackground(videoId, prompt, { ...options, duration, audioPrompt, sourceUrl, tts_voice: voiceName });

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
      tts_text: video.tts_text || '',
      tts_voice: video.tts_voice || 'Kore',
      previewUrl: (video.status === 'composition_ready' || video.status === 'ready')
        ? `/api/video/${video.id}/preview` : null,
      downloadUrl: video.status === 'ready' ? `/api/video/${video.id}/download` : null,
      error: video.error,
      createdAt: video.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video/:id/preview — serves composition HTML
// Works for both composition_ready (preview) and ready (preview/done)
router.get('/:id/preview', async (req, res) => {
  try {
    const db = await getDb();
    const video = queryOne(db, 'SELECT * FROM videos WHERE id = ?', [req.params.id]);
    await saveAndClose(db);

    if (!video) return res.status(404).json({ error: 'Not found' });
    if (video.status !== 'composition_ready' && video.status !== 'ready') {
      return res.status(400).json({ error: 'Preview not available yet' });
    }
    if (!video.composition_path) return res.status(400).json({ error: 'No composition path' });

    const htmlPath = path.join(video.composition_path, 'index.html');
    let html = await fs.readFile(htmlPath, 'utf-8');

    // Inject preview player script to auto-play the GSAP timeline
    const previewScript = `
<script>
(function() {
  // Auto-play the GSAP timeline for preview
  var checkTimeline = setInterval(function() {
    if (window.__timelines && window.__timelines["main"]) {
      clearInterval(checkTimeline);
      var tl = window.__timelines["main"];
      tl.play();
      // Loop the timeline
      tl.eventCallback("onComplete", function() {
        this.restart();
      });
    }
  }, 100);
  // Fallback: try after DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      if (window.__timelines && window.__timelines["main"]) {
        window.__timelines["main"].play();
      }
    }, 500);
  });
})();
</script>
</body>`;

    html = html.replace('</body>', previewScript);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video/:id/assets/:file — serve project files (logo, favicon, etc.)
router.get('/:id/assets/:file', async (req, res) => {
  try {
    const db = await getDb();
    const video = queryOne(db, 'SELECT * FROM videos WHERE id = ?', [req.params.id]);
    await saveAndClose(db);

    if (!video || !video.composition_path) {
      return res.status(404).json({ error: 'Not found' });
    }

    const filePath = path.resolve(video.composition_path, req.params.file);
    // Prevent path traversal
    if (!filePath.startsWith(path.resolve(video.composition_path))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.sendFile(filePath, (err) => {
      if (err) res.status(404).json({ error: 'File not found' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/video/:id/render — trigger MP4 render from existing composition
// Starts render in background, returns immediately
router.post('/:id/render', async (req, res) => {
  try {
    const db = await getDb();
    const video = queryOne(db, 'SELECT * FROM videos WHERE id = ?', [req.params.id]);
    await saveAndClose(db);

    if (!video) return res.status(404).json({ error: 'Not found' });
    if (video.status !== 'composition_ready') {
      return res.status(400).json({ error: `Cannot render: current status is '${video.status}'. Expected 'composition_ready'.` });
    }
    if (!video.composition_path) return res.status(400).json({ error: 'No composition path' });

    const renderProgress = JSON.stringify({ step: 'rendering_video', message: '🎬 Se generează videoclipul...', pct: 50 });

    // Mark as rendering immediately
    {
      const db2 = await getDb();
      db2.run("UPDATE videos SET status = 'rendering', progress = ?, updated_at = datetime('now') WHERE id = ?", [renderProgress, video.id]);
      await saveAndClose(db2);
    }

    // Start render in background
    renderInBackground(video.id, video.composition_path, video.quality || 'draft');

    res.status(202).json({
      videoId: video.id,
      status: 'rendering',
      progress: { step: 'rendering_video', message: '🎬 Se generează videoclipul...', pct: 50 },
    });
  } catch (err) {
    console.error('[render] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Background render — takes existing composition and renders MP4
async function renderInBackground(videoId, compositionPath, quality) {
  try {
    const { HyperFramesEngine } = await import('../services/hyperframes.js');
    const engine = new HyperFramesEngine(compositionPath);

    await updateProgress(videoId, 'rendering_video', '🎬 Se generează videoclipul...', 50);

    const renderResult = await engine.render({ quality: quality || 'draft' });

    await updateProgress(videoId, 'finalizing', '📦 Se finalizează...', 95);

    const db = await getDb();
    if (renderResult.ok) {
      let debugMerged = {};
      try {
        const s2 = db.prepare('SELECT debug_info FROM videos WHERE id = ?');
        s2.bind([videoId]);
        if (s2.step()) debugMerged = JSON.parse(s2.getAsObject().debug_info || '{}');
        s2.free();
      } catch {}
      debugMerged.render = { ok: true, path: renderResult.outputPath };
      debugMerged._updated = new Date().toISOString();
      db.run('UPDATE videos SET debug_info = ? WHERE id = ?', [JSON.stringify(debugMerged), videoId]);
      const doneProgress = JSON.stringify({ step: 'ready', message: '✅ Video gata!', pct: 100 });
      db.run(`UPDATE videos SET status = 'ready', render_path = ?, progress = ?, updated_at = datetime('now') WHERE id = ?`,
        [renderResult.outputPath, doneProgress, videoId]);
    } else {
      const failProgress = JSON.stringify({ step: 'failed', message: renderResult.error || 'Render failed', pct: 0 });
      db.run(`UPDATE videos SET status = 'failed', error = ?, progress = ?, updated_at = datetime('now') WHERE id = ?`,
        [renderResult.error || 'Render failed', failProgress, videoId]);
    }
    await saveAndClose(db);
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

// DELETE /api/video/:id
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const video = queryOne(db, 'SELECT * FROM videos WHERE id = ?', [req.params.id]);

    if (!video) {
      db.close();
      return res.status(404).json({ error: 'Video not found' });
    }

    // Delete composition files from disk
    if (video.composition_path) {
      try {
        await fs.rm(video.composition_path, { recursive: true, force: true });
      } catch (e) {
        console.warn(`[delete] Could not remove composition_path: ${video.composition_path}`, e.message);
      }
    }

    // Delete render file from disk
    if (video.render_path) {
      try {
        await fs.rm(video.render_path, { force: true });
      } catch (e) {
        console.warn(`[delete] Could not remove render_path: ${video.render_path}`, e.message);
      }
    }

    // Delete TTS file from disk
    if (video.tts_path) {
      try {
        await fs.rm(video.tts_path, { force: true });
      } catch (e) {
        console.warn(`[delete] Could not remove tts_path: ${video.tts_path}`, e.message);
      }
    }

    // Delete from DB
    db.run('DELETE FROM videos WHERE id = ?', [req.params.id]);
    await saveAndClose(db);

    res.json({ ok: true });
  } catch (err) {
    console.error('[delete] error:', err.message);
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
    let audioDuration = duration; // will be updated with real WAV duration if TTS is generated
    const audioPrompt = options.audioPrompt || '';

    // --- Website scraping (optional, when sourceUrl is provided) ---
    let brandColors = null;
    let brandFonts = null;
    let websiteName = null;
    let themeColor = null;
    let enrichedPrompt = prompt;
    let fetchedFaviconUrl = null;
    let fetchedGoogleFontsUrls = [];
    let logoBuffer = null;

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
      const tokens = extractBrandTokens(renderedHTML, options.sourceUrl);
      themeColor = tokens.themeColor || (tokens.colors.length > 0 ? tokens.colors[0] : null);
      brandColors = tokens.colors;
      brandFonts = tokens.fonts;
      fetchedFaviconUrl = tokens.faviconUrl;
      fetchedGoogleFontsUrls = tokens.googleFontsUrls || [];

      // Download site logo for later injection
      logoBuffer = null;
      if (tokens.logoUrl) {
        try {
          const logoResp = await fetch(tokens.logoUrl, { signal: AbortSignal.timeout(10000) });
          if (logoResp.ok) {
            logoBuffer = Buffer.from(await logoResp.arrayBuffer());
          }
        } catch (e) {
          console.warn('[generate] Could not download site logo:', e.message);
        }
      }

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

    // Save site logo to disk
    let brandLogoPath = null;
    if (logoBuffer) {
      try {
        const assetsDir = path.join(workDir, 'assets');
        await fs.mkdir(assetsDir, { recursive: true });
        brandLogoPath = path.join(assetsDir, 'logo-site.png');
        await fs.writeFile(brandLogoPath, logoBuffer);
        console.log(`[generate] Site logo saved: ${brandLogoPath}`);
      } catch (e) {
        console.warn('[generate] Could not save site logo to disk:', e.message);
      }
    }

    // Download favicon to workDir for injection into composition
    let faviconPath = null;
    if (fetchedFaviconUrl) {
      try {
        const faviconResp = await fetch(fetchedFaviconUrl, { signal: AbortSignal.timeout(8000) });
        if (faviconResp.ok) {
          const faviconBuffer = Buffer.from(await faviconResp.arrayBuffer());
          faviconPath = path.join(workDir, 'favicon.ico');
          await fs.writeFile(faviconPath, faviconBuffer);
          console.log(`[generate] Favicon saved: ${faviconPath}`);
        }
      } catch (e) {
        console.warn('[generate] Could not download favicon:', e.message);
      }
    }

    await updateProgress(videoId, 'generating_composition', '🤖 Se generează conținutul video...', 10);
    await engine.init('blank');
    await updateProgress(videoId, 'composition_ai', '🤖 Conținut generat cu AI', 15);

    const compositionOptions = { ...options, duration };
    if (brandColors) compositionOptions.brandColors = brandColors;
    if (brandFonts) compositionOptions.brandFonts = brandFonts;
    if (websiteName) compositionOptions.websiteName = websiteName;
    if (themeColor) compositionOptions.themeColor = themeColor;
    if (brandLogoPath) compositionOptions.brandLogoRelPath = 'assets/logo-site.png';

    const html = await composeFromPrompt(enrichedPrompt, compositionOptions);
    await updateDebug(videoId, { composition_html: html.substring(0, 5000) });
    await updateProgress(videoId, 'composition_done', '✅ Conținut generat', 30);

    // Inject Google Fonts links and favicon into <head> before writing
    let injectedHtml = html;
    const headInjections = [];

    // Add Google Fonts <link> tags
    if (fetchedGoogleFontsUrls.length > 0) {
      for (const gfUrl of fetchedGoogleFontsUrls) {
        headInjections.push(`  <link href="${gfUrl}" rel="stylesheet">`);
      }
    }

    // Add favicon <link> if we downloaded it
    if (faviconPath) {
      headInjections.push('  <link rel="icon" href="favicon.ico">');
    }

    if (headInjections.length > 0) {
      injectedHtml = injectedHtml.replace(
        '</head>',
        `${headInjections.join('\n')}\n</head>`
      );
    }

    await engine.writeComposition(injectedHtml);
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
          { text: `Generează 3-5 propoziții pentru un voiceover video profesional (în română). Textul trebuie să includă AUDIO TAGS pentru a controla expresivitatea și ritmul (tag-urile sunt în engleză, textul în română).

Tag-uri disponibile (pune-le în text acolo unde e natural):
- [neutral] — ton neutru, informativ
- [positive] — ton pozitiv, prietenos
- [enthusiasm] — entuziasm, energie
- [excitement] — încântare, ușoară senzație de „wow"
- [interest] — interes, curiozitate
- [awe] — admirație, impresionant
- [slow] — încetinește ritmul (pentru info importantă)
- [short pause] — pauză scurtă între secțiuni

Exemplu de format:
[neutral] Bun venit la LumiBot, asistentul tău virtual inteligent. [short pause] [positive] Cu LumiBot poți automatiza programările non-stop. [enthusiasm] Totul, 24/7! [short pause] [excitement] Vizitează Lumi.bot și începe acum!

Return ONLY the tagged text, no explanations. Total: 40-80 cuvinte, minim 3 propoziții.` },
          { text: `Video content: ${enrichedPrompt}` },
        ]);
        narrationText = result.response.text().trim();
        console.log('[generate] auto-narration:', narrationText.slice(0, 100));
        await updateDebug(videoId, { auto_narration: narrationText });
        // Save generated text to DB so history can restore it
        await (async () => {
          try {
            const dbN = await getDb();
            dbN.run('UPDATE videos SET tts_text = ? WHERE id = ?', [narrationText, videoId]);
            await saveAndClose(dbN);
          } catch {}
        })();
        await updateProgress(videoId, 'generating_audio', '🎵 Text audio creat', 34);
      } catch (e) {
        console.error('[generate] auto-narration error:', e.message);
      }
    }

    if (narrationText.trim()) {
      await updateProgress(videoId, 'generating_audio', '🎵 Se generează audio...', 35);
      // Save narration text to DB for history restore
      try {
        const dbN = await getDb();
        dbN.run('UPDATE videos SET tts_text = ? WHERE id = ?', [narrationText, videoId]);
        await saveAndClose(dbN);
      } catch {}
      try {
        const audioDir = path.join(workDir, 'audio');
        await fs.mkdir(audioDir, { recursive: true });
        const audioResult = await generateTTS(narrationText, options.voiceName || 'Kore');
        if (audioResult instanceof ArrayBuffer || audioResult instanceof Buffer) {
          ttsPath = path.join(audioDir, 'narration.wav');
          await fs.writeFile(ttsPath, Buffer.from(audioResult));
          // Measure actual audio duration from WAV header
          try {
            audioDuration = getWavDuration(ttsPath);
            console.log(`[generate] Audio real duration: ${audioDuration.toFixed(2)}s (video requested: ${duration}s)`);
            await updateDebug(videoId, { audio_duration: audioDuration, duration_requested: duration });
          } catch (e) {
            console.warn('[generate] Could not measure WAV duration:', e.message);
          }
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
      const audioRelPath = 'audio/narration.wav';
      const audioTag = `<audio id="narration" src="${audioRelPath}" data-start="0" data-duration="${audioDuration}" data-track-index="10" data-volume="0.8"></audio>`;
      composition = composition.replace('</body>', `${audioTag}\n</body>`);
      await fs.writeFile(compositionPath, composition);
      const dbA = await getDb();
      dbA.run('UPDATE videos SET tts_path = ? WHERE id = ?', [ttsPath, videoId]);
      await saveAndClose(dbA);

      // If audio is longer than the requested video duration, extend composition to match
      if (audioDuration > duration) {
        try {
          let compHtml = await fs.readFile(compositionPath, 'utf-8');
          const newDuration = Math.ceil(audioDuration);
          // Extend root data-duration
          compHtml = compHtml.replace(
            /(data-duration=)"(\d+)"/,
            (match, attr) => `${attr}"${newDuration}"`
          );
          // Extend the LAST scene clip's data-duration to absorb the extra time
          const lastSceneIdx = compHtml.lastIndexOf('class="clip"');
          if (lastSceneIdx !== -1) {
            const beforeClip = compHtml.substring(0, lastSceneIdx);
            const afterClip = compHtml.substring(lastSceneIdx);
            compHtml = beforeClip + afterClip.replace(
              /(data-duration=)"(\d+)"/,
              (match, attr) => `${attr}"${newDuration}"`
            );
          }
          await fs.writeFile(compositionPath, compHtml);
          console.log(`[generate] Extended composition duration to ${newDuration}s (audio outpaces video by ${(audioDuration - duration).toFixed(1)}s)`);
          await updateDebug(videoId, { composition_extended_to: newDuration });
        } catch (e) {
          console.warn('[generate] Could not extend composition duration:', e.message);
        }
      }
    }

    // Generate subtitles as visible text overlays (burned into video frames)
    if (options.useSubtitles && narrationText.trim()) {
      try {
        const sentences = narrationText
          .split(/(?<=[.!?])\s+/)
          .map(s => s.trim())
          .filter(s => s.length > 0);

        const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
        let overlaysHtml = '';
        let gsapAnimations = '';
        let prevEnd = 0;
        const timedSentences = []; // { start, end, text }

        sentences.forEach((sentence, i) => {
          // Proportional timing: longer sentences get more screen time
          const ratio = totalChars > 0 ? sentence.length / totalChars : 1 / sentences.length;
          const sentenceDuration = Math.max(audioDuration * ratio, 0.5);
          const start = prevEnd;
          const end = Math.min(start + sentenceDuration, audioDuration);
          prevEnd = end;
          timedSentences.push({ start, end, text: sentence });

          overlaysHtml += `<div id="sub-${i}" class="sub-overlay" style="position:absolute;bottom:50px;left:50%;transform:translateX(-50%);color:#fff;font-family:Arial,sans-serif;font-size:22px;font-weight:600;text-align:center;text-shadow:0 2px 6px rgba(0,0,0,0.9);background:rgba(0,0,0,0.6);padding:8px 20px;border-radius:8px;opacity:0;pointer-events:none;z-index:1000;max-width:75%;width:auto;word-wrap:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;">${sentence}</div>\n`;

          gsapAnimations += `window.__timelines["main"].to("#sub-${i}", { opacity: 1, duration: 0.2 }, ${start});`;
          gsapAnimations += `window.__timelines["main"].to("#sub-${i}", { opacity: 0, duration: 0.2 }, ${Math.max(0, end - 0.3)});`;
        });

        // Inject subtitle overlays + GSAP animations into composition
        const compositionPath = path.join(workDir, 'index.html');
        let composition = await fs.readFile(compositionPath, 'utf-8');

        // Insert overlay divs before </body>
        composition = composition.replace('</body>', `${overlaysHtml}\n</body>`);

        // Append GSAP timeline calls after the timeline creation
        // Match window.__timelines["main"] = <variable>;
        composition = composition.replace(
          /(window\.__timelines\[?"main"?\]\s*=\s*\w+;)/,
          `$1\n${gsapAnimations}`
        );

        await fs.writeFile(compositionPath, composition);
        const vttContent = timedSentences.map((ts, i) => {
          const fmt = (secs) => {
            const totalMs = Math.round(secs * 1000);
            const h = Math.floor(totalMs / 3600000);
            const m = Math.floor((totalMs % 3600000) / 60000);
            const s = Math.floor((totalMs % 60000) / 1000);
            const ms = totalMs % 1000;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
          };
          return `${i + 1}\n${fmt(ts.start)} --> ${fmt(ts.end)}\n${ts.text}`;
        }).join('\n\n');
        await updateDebug(videoId, { subtitles_vtt: vttContent.substring(0, 500), subtitle_count: sentences.length });
        console.log(`[generate] ${sentences.length} subtitle overlays injected`);
      } catch (e) {
        console.error('[generate] subtitles error:', e.message);
      }
    }

    // Save composition path
    const db = await getDb();
    db.run('UPDATE videos SET composition_path = ?, logo_path = ? WHERE id = ?', [workDir, brandLogoPath, videoId]);
    await saveAndClose(db);

    await updateProgress(videoId, 'validating', '🔍 Se validează conținutul...', 40);
    const lintResult = await engine.lint();
    await updateDebug(videoId, { lint: lintResult });
    if (!lintResult.ok) {
      await updateProgress(videoId, 'lint_warning', '⚠️ Mici ajustări (se continuă oricum)', 42);
    } else {
      await updateProgress(videoId, 'validated', '✅ Conținut validat', 45);
    }

    // --- STOP HERE — composition is ready, user previews first ---
    // Composition, TTS, subtitles are all saved in workDir
    // Now set status to 'composition_ready' instead of rendering MP4 immediately

    // Save final composition metadata
    const dbReady = await getDb();

    // Save composition path, tts_path, in workDir path
    let debugMerged = {};
    try {
      const s2 = dbReady.prepare('SELECT debug_info FROM videos WHERE id = ?');
      s2.bind([videoId]);
      if (s2.step()) debugMerged = JSON.parse(s2.getAsObject().debug_info || '{}');
      s2.free();
    } catch {}
    debugMerged.composition_done = { workDir };
    debugMerged._updated = new Date().toISOString();

    const readyProgress = JSON.stringify({ step: 'composition_ready', message: '✅ Conținut gata — verifică previzualizarea', pct: 45 });
    dbReady.run(
      `UPDATE videos SET status = 'composition_ready', composition_path = ?, logo_path = ?, progress = ?, debug_info = ?, updated_at = datetime('now') WHERE id = ?`,
      [workDir, brandLogoPath, readyProgress, JSON.stringify(debugMerged), videoId]
    );
    await saveAndClose(dbReady);

    console.log(`[generate] Composition ready for ${videoId}, waiting for user to trigger render`);
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
