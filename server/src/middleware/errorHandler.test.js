import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthError,
  errorHandler,
  notFoundHandler,
} from '../middleware/errorHandler.js';

// Mock logger
vi.mock('../services/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('AppError', () => {
  it('has default status 500 and code INTERNAL_ERROR', () => {
    const err = new AppError('boom');
    expect(err.message).toBe('boom');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.name).toBe('AppError');
  });

  it('accepts custom statusCode and code', () => {
    const err = new AppError('bad', 400, 'BAD');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD');
  });
});

describe('ValidationError', () => {
  it('has status 400 and code VALIDATION_ERROR', () => {
    const err = new ValidationError('missing field');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
    expect(err instanceof AppError).toBe(true);
  });
});

describe('NotFoundError', () => {
  it('has status 404 and code NOT_FOUND', () => {
    const err = new NotFoundError('video not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
    expect(err instanceof AppError).toBe(true);
  });

  it('defaults message to "Resource not found"', () => {
    const err = new NotFoundError();
    expect(err.message).toBe('Resource not found');
  });
});

describe('AuthError', () => {
  it('has status 401 and code AUTH_ERROR', () => {
    const err = new AuthError('bad token');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.name).toBe('AuthError');
    expect(err instanceof AppError).toBe(true);
  });

  it('defaults message to "Authentication required"', () => {
    const err = new AuthError();
    expect(err.message).toBe('Authentication required');
  });
});

describe('errorHandler middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = { method: 'GET', originalUrl: '/api/test' };
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    mockNext = vi.fn();
  });

  it('handles ValidationError with 400 and structured response', () => {
    const err = new ValidationError('prompt is required');
    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'prompt is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('handles NotFoundError with 404', () => {
    const err = new NotFoundError('video not found');
    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'video not found',
      code: 'NOT_FOUND',
    });
  });

  it('handles AuthError with 401', () => {
    const err = new AuthError();
    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Authentication required',
      code: 'AUTH_ERROR',
    });
  });

  it('handles generic AppError with its statusCode', () => {
    const err = new AppError('custom', 418, 'TEAPOT');
    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(418);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'custom',
      code: 'TEAPOT',
    });
  });

  it('handles unknown errors with 500 and message in non-production', () => {
    const err = new Error('unexpected crash');
    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'unexpected crash',
      code: 'INTERNAL_ERROR',
    });
  });

  it('obscures error message in production mode', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('sensitive details');
    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });

    delete process.env.NODE_ENV;
  });

  it('handles errors without .code gracefully', () => {
    // A plain object thrown as error
    const err = { message: 'weird', name: 'WeirdError' };
    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'weird',
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('notFoundHandler', () => {
  it('returns 404 with structured response', () => {
    const req = { method: 'POST', originalUrl: '/api/unknown' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Route not found: POST /api/unknown',
      code: 'NOT_FOUND',
    });
  });
});
