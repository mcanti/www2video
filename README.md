# www2video — AI-Powered Web-to-Video Generator

Convert websites and prompts into animated MP4 videos with AI narration and subtitles.

## Architecture

```
www2video/
├── client/          React SPA (Vite + CSS Modules)
│   └── src/
│       ├── pages/Generator.jsx    Main UI
│       └── styles/index.css       Design tokens (Inter, dark theme)
├── server/          Node.js Express backend
│   └── src/
│       ├── index.js               Express app entry
│       ├── routes/
│       │   ├── video.js           Core API: generate, preview, render, download
│       │   └── history.js         History management
│       ├── services/
│       │   ├── composer.js        Gemini AI composition + subtitles
│       │   ├── tts.js             Vertex AI TTS (text-to-speech)
│       │   ├── tts-cache.js       MD5-based TTS audio cache
│       │   ├── hyperframes.js     HyperFrames rendering engine
│       │   ├── website-scraper.js Chrome headless scraping + brand extraction
│       │   └── logger.js          Structured logging (pino)
│       └── middleware/
│           ├── errorHandler.js    Global error handling + AppError classes
│           └── rateLimit.js       Generation queue + rate limiting
├── scripts/
│   └── cleanup.js                 Auto-cleanup of old projects/renders
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 22.x | Required for native ESM support |
| npm | 10.x | |
| Docker | 24+ | For production deployment |
| Gemini API Key | — | Get at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Google Cloud Service Account | — | For Vertex AI TTS (text-to-speech) |

## Quick Start (Development)

```bash
# 1. Clone and install
git clone <repo-url> && cd www2video

# 2. Set up environment
cp .env.example .env
# Edit .env with your GEMINI_API_KEY and TTS settings

# 3. Install dependencies
cd server && npm ci && cd ..
cd client && npm ci && cd ..

# 4. Start dev servers (Vite proxy + Node server)
npm run dev
# Client: http://localhost:5173
# Server: http://localhost:3017
```

## Production Deployment (Docker)

```bash
# Build and run
docker-compose up -d

# Check health
curl http://localhost:3017/health
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | **Required.** Google Gemini API key |
| `GCLOUD_PROJECT` | `gen-lang-client-0575393893` | Google Cloud project ID |
| `TTS_SERVICE_ACCOUNT_PATH` | `/app/keys/service-account.json` | Path to GCloud service account JSON |
| `PORT` | `3017` | Server port |
| `NODE_ENV` | `production` | `development` or `production` |
| `CHROME_HEADLESS_SHELL_PATH` | `/usr/local/bin/chrome-headless-shell` | Chrome binary for website scraping |
| `DB_PATH` | `/app/server/data/www2video.db` | SQLite database path |
| `PROJECTS_DIR` | `/app/server/data/projects` | Composition workspace directory |
| `RENDERS_DIR` | `/app/server/renders` | MP4 render output directory |
| `LOG_LEVEL` | `info` | pino log level: trace, debug, info, warn, error, fatal |
| `MAX_CONCURRENT_GENERATIONS` | `3` | Max concurrent video generations |
| `MAX_QUEUE_DEPTH` | `10` | Max queue depth before 429 |
| `MAX_AGE_DAYS` | `7` | Auto-cleanup age threshold |

## API Endpoints

### POST `/api/video/generate`
Start video generation from a prompt.

```json
{
  "prompt": "A 10-second product launch video...",
  "options": {
    "duration": 10,
    "width": 1280,
    "height": 720,
    "quality": "draft",
    "useAudio": true,
    "audioPrompt": "Narration text...",
    "voiceName": "Kore",
    "useSubtitles": true,
    "useWebsite": true,
    "sourceUrl": "https://example.com"
  }
}
```
→ `202` with `videoId`, `status: "generating"`

### GET `/api/video/:id/status`
Poll generation progress.
→ `{ videoId, status, progress, previewUrl, downloadUrl, error }`

### GET `/api/video/:id/preview`
Serve composition HTML for iframe preview.

### POST `/api/video/:id/render`
Trigger MP4 render from a composition_ready composition.
→ `202` with `status: "rendering"`

### GET `/api/video/:id/download`
Download the final MP4 video.

### DELETE `/api/video/:id`
Delete a video and its files.

### GET `/api/history`
List recent videos (last 50).

### GET `/health`
Health check.

## Maintenance

### Auto-cleanup
```bash
# Run manually
node scripts/cleanup.js

# Or via cron (daily at 3am)
# 0 3 * * * cd /app && node scripts/cleanup.js >> /var/log/www2video-cleanup.log 2>&1
```

### TTS Cache
TTS audio is cached by MD5(text + voice) on disk and in the `tts_cache` SQLite table. Cache is automatically used on subsequent generations with the same text+voice combination.

## Testing

```bash
# Backend unit tests
cd server && npm test       # 27 tests

# Backend integration tests
cd server && npm test -- src/routes/video.test.js  # 4 tests

# Frontend tests
cd client && npm test       # 9 tests

# Watch mode
cd server && npm run test:watch
cd client && npm run test:watch
```

## Key Design Decisions

- **Two-phase generation**: AI composition first (previewable), then user triggers MP4 render
- **sql.js** (SQLite in WASM): Zero-install embedded database, no external DB server needed
- **HyperFrames**: HTML-based video composition with GSAP animations, rendered to MP4 via Chrome headless
- **Gemini 3.5 Flash**: Powers both composition generation and TTS narration
- **Per-sentence subtitles**: Injected as HTML overlays with GSAP opacity animation, timed proportionally to audio
- **Rate limiting**: Max 3 concurrent generations, queue depth 10, returns 429 when full

## Known Limitations

- No horizontal/vertical format detection for Reels vs landscape
- TTS caching requires DB migration for existing instances
- Chrome headless required for website scraping (not available in all environments)
- No video upload or custom asset injection
