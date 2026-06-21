/**
 * Rate Limiting Middleware and Generation Queue for www2video.
 * Limits concurrent generations and enforces queue depth.
 */

import { logger } from '../services/logger.js';

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_GENERATIONS || '3', 10);
const MAX_QUEUE = parseInt(process.env.MAX_QUEUE_DEPTH || '10', 10);

let activeCount = 0;
const queue = [];

function processQueue() {
  while (queue.length > 0 && activeCount < MAX_CONCURRENT) {
    const next = queue.shift();
    activeCount++;
    next.resolve();
  }
}

function finishGeneration() {
  activeCount = Math.max(0, activeCount - 1);
  processQueue();
}

/**
 * Acquire a slot. Returns a promise that resolves when a slot is available.
 */
export function acquireSlot() {
  return new Promise((resolve, reject) => {
    if (activeCount < MAX_CONCURRENT) {
      activeCount++;
      resolve();
    } else if (queue.length < MAX_QUEUE) {
      logger.info({ queueSize: queue.length + 1, activeCount }, 'Enqueuing generation');
      queue.push({ resolve, reject });
    } else {
      reject(new Error('Queue full. Please try again later.'));
    }
  });
}

/**
 * Express middleware: rate-limits POST /api/video/generate
 */
export function rateLimitGenerate(req, res, next) {
  if (activeCount >= MAX_CONCURRENT && queue.length >= MAX_QUEUE) {
    return res.status(429).json({
      error: 'Too many requests. Please wait and try again.',
      code: 'RATE_LIMITED',
      queueLength: queue.length,
    });
  }
  next();
}

export { finishGeneration, MAX_CONCURRENT };
