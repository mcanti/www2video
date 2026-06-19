import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3017;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => res.json({ ok: true, service: 'www2video' }));

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
    console.log('[www2video] sql.js warmed up');
  } catch (e) {
    console.warn('[www2video] sql.js warmup failed:', e.message);
  }
}
warmSqlJs();

// Serve built frontend in production
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), err => {
    if (err) res.status(404).json({ error: 'not found' });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[www2video] listening on ${PORT}`);
});
