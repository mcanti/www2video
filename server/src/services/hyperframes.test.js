import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { HyperFramesEngine, createEngine } from './hyperframes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_RENDERS = path.join(__dirname, '../../test-renders');

describe('HyperFramesEngine', () => {
  let engine;
  let projectDir;

  beforeEach(async () => {
    const id = randomUUID();
    projectDir = path.join(TEST_RENDERS, id);
    engine = new HyperFramesEngine(projectDir);
    // Ensure directory exists before writing
    await fs.mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    try { await fs.rm(projectDir, { recursive: true, force: true }); } catch {}
  });

  describe('writeComposition + getPreview', () => {
    it('writes and reads composition HTML', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><h1>Test</h1></body></html>';
      await engine.writeComposition(html);

      const preview = await engine.getPreview();
      expect(preview).toBe(html);
    });

    it('returns null when no composition exists', async () => {
      const preview = await engine.getPreview();
      expect(preview).toBeNull();
    });
  });

  describe('_createMinimalProject', () => {
    it('creates a minimal HTML composition with required fields', async () => {
      await engine._createMinimalProject();
      const html = await engine.getPreview();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('data-composition-id="root"');
      expect(html).toContain('window.__timelines');
      expect(html).toContain('gsap.timeline');
    });
  });

  describe('cleanup', () => {
    it('removes the project directory', async () => {
      await engine.writeComposition('<html></html>');
      const exists1 = await fs.access(projectDir).then(() => true).catch(() => false);
      expect(exists1).toBe(true);

      await engine.cleanup();
      const exists2 = await fs.access(projectDir).then(() => true).catch(() => false);
      expect(exists2).toBe(false);
    });
  });
});

describe('createEngine', () => {
  it('returns engine, projectId, and workDir', async () => {
    const result = await createEngine(TEST_RENDERS);

    expect(result.engine).toBeInstanceOf(HyperFramesEngine);
    expect(result.projectId).toBeDefined();
    expect(typeof result.projectId).toBe('string');
    expect(result.workDir).toContain(TEST_RENDERS);

    // Cleanup
    try { await result.engine.cleanup(); } catch {}
  });
});
