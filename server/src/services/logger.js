import pino from 'pino';

/**
 * Structured logger for www2video.
 * Replaces console.log/warn/error with pino.
 *
 * Usage:
 *   import { logger } from '../services/logger.js';
 *   logger.info({ videoId, step: 'generating' }, 'Composition started');
 *   logger.error({ err, videoId }, 'TTS generation failed');
 */

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const transport = process.env.NODE_ENV === 'production'
  ? undefined // JSON output for production
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    };

export const logger = pino({
  level,
  ...(transport ? { transport } : {}),
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

/**
 * Create a child logger with a requestId (videoId or UUID).
 */
export function createRequestLogger(requestId) {
  return logger.child({ requestId });
}
