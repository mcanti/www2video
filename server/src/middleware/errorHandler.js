import { logger } from '../services/logger.js';

/**
 * Custom error classes for www2video
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

/**
 * Global Express error handling middleware.
 * Handles AppError subclasses with proper status codes and structured responses.
 * Catches unhandled errors and returns 500 with minimal detail in production.
 */
export function errorHandler(err, req, res, _next) {
  // Log the error
  const logPayload = {
    method: req.method,
    url: req.originalUrl,
    errorCode: err.code || 'UNKNOWN',
    errorName: err.name,
  };

  if (err instanceof AppError) {
    logger.warn(logPayload, err.message);
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  // Unknown / unexpected errors
  logger.error({ ...logPayload, err }, 'Unhandled server error');

  const isProduction = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
  });
}

/**
 * 404 handler — must be registered AFTER all routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
}
