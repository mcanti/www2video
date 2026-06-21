import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './services/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3017;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => res.json({ ok: true, service: 'www2video' }));

// Serve local assets (logo, etc.)
const assetsDir = path.resolve(__dirname, 'assets');
app.use('/assets', express.static(assetsDir));

// API routes
import videoRoutes from './routes/video.js';
app.use('/api/video', videoRoutes);
import historyRoutes from './routes/history.js';
app.use('/api', historyRoutes);

// Pre-warm sql.js WASM on startup
let sqlJsWarmed = false;
async function warmSqlJs() {
  try {
    const initSqlJs = (await import('sql.js')).default;
    await initSqlJs();
    sqlJsWarmed = true;
    logger.info('sql.js warmed up');
  } catch (e) {
    logger.warn({ err: e }, 'sql.js warmup failed');
  }
}
warmSqlJs();

// Serve built frontend in production
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// 404 for unknown API routes
app.use('/api', notFoundHandler);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), err => {
    if (err) res.status(404).json({ error: 'not found' });
  });
});

// Global error handler (must be last)
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'www2video server started');
});
