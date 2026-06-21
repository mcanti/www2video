import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before anything else
vi.mock('../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Tests for the rate limiter. Because the module uses module-level state
 * (activeCount + queue array), we must reset the module between test suites.
 * We isolate each logical group with vi.resetModules().
 */

describe('rateLimitGenerate middleware', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('allows generating when under concurrency limit', async () => {
    const { rateLimitGenerate } = await import('../middleware/rateLimit.js');
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    rateLimitGenerate(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 429 when queue is at capacity', async () => {
    // MAX_CONCURRENT=3, MAX_QUEUE=10
    const { acquireSlot, rateLimitGenerate } = await import('../middleware/rateLimit.js');

    // Fill all 3 concurrent + 10 queue slots = 13
    const slots = [];
    for (let i = 0; i < 13; i++) {
      slots.push(acquireSlot().catch(() => {}));
    }

    // rateLimitGenerate should now see queue as full
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    rateLimitGenerate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RATE_LIMITED',
      })
    );

    // Clean up — resolve all pending slots
    const { finishGeneration } = await import('../middleware/rateLimit.js');
    for (let i = 0; i < 13; i++) finishGeneration();
  });
});

describe('acquireSlot', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves immediately when under concurrency limit', async () => {
    const { acquireSlot, finishGeneration } = await import('../middleware/rateLimit.js');
    const result = await acquireSlot();
    expect(result).toBeUndefined();
    finishGeneration();
  });

  it('rejects when queue is full', async () => {
    const { acquireSlot } = await import('../middleware/rateLimit.js');

    // Fill 3 concurrent + 10 queue = 13
    const slots = [];
    for (let i = 0; i < 13; i++) {
      slots.push(acquireSlot().catch(() => {}));
    }

    // 14th should reject
    await expect(acquireSlot()).rejects.toThrow('Queue full');
  });
});
