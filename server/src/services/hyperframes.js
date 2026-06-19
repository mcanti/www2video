import { execSync, execFile } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

const RENDERS_DIR = process.env.RENDERS_DIR || '/app/server/renders';

export class HyperFramesEngine {
  /**
   * @param {string} workDir - Directory for the composition project
   */
  constructor(workDir) {
    this.workDir = workDir;
  }

  /**
   * Scaffold a new HyperFrames project
   */
  async init(template = 'blank') {
    await fs.mkdir(this.workDir, { recursive: true });
    try {
      await new Promise((resolve, reject) => {
        execFile('npx', ['hyperframes', 'init', this.workDir, '--example', template, '--non-interactive'], {
          stdio: 'pipe', timeout: 60000, maxBuffer: 1024 * 1024,
        }, (err) => err ? reject(err) : resolve());
      });
    } catch (e) {
      // Fallback: create minimal structure manually
      await this._createMinimalProject();
    }
  }

  /**
   * Write a composition HTML file
   */
  async writeComposition(html) {
    await fs.writeFile(path.join(this.workDir, 'index.html'), html, 'utf-8');
  }

  /**
   * Run hyperframes lint
   */
  async lint() {
    try {
      await new Promise((resolve, reject) => {
        execFile('npx', ['hyperframes', 'lint', this.workDir], {
          stdio: 'pipe', timeout: 30000, maxBuffer: 1024 * 1024,
        }, (err) => err ? reject(err) : resolve());
      });
      return { ok: true, errors: null };
    } catch (e) {
      return {
        ok: false,
        errors: e.stderr?.toString()?.slice(0, 500) || e.message,
      };
    }
  }

  /**
   * Render the composition
   */
  async render({ quality = 'draft', fps = 30, variables = {} } = {}) {
    const projectName = path.basename(this.workDir);
    const outputDir = path.join(RENDERS_DIR, projectName);
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${randomUUID()}.mp4`);

    const args = [
      'hyperframes', 'render', this.workDir,
      '--output', outputPath,
      '--quality', quality,
      '--fps', String(fps),
    ];

    const varsArg = Object.keys(variables).length > 0
      ? ['--variables', JSON.stringify(variables)]
      : [];
    args.push(...varsArg);

    try {
      await new Promise((resolve, reject) => {
        const proc = execFile('npx', args, {
          stdio: 'pipe',
          timeout: 300000,
          maxBuffer: 10 * 1024 * 1024,
        }, (err, stdout, stderr) => {
          if (err) {
            reject(new Error(stderr?.slice(0, 500) || err.message));
          } else {
            resolve(stdout);
          }
        });
      });
      return { ok: true, outputPath };
    } catch (e) {
      return {
        ok: false,
        outputPath: null,
        error: e.message,
      };
    }
  }

  /**
   * Preview: return the composition HTML for iframe
   */
  async getPreview() {
    const htmlPath = path.join(this.workDir, 'index.html');
    try {
      return await fs.readFile(htmlPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Create minimal project structure if npx hyperframes init fails
   */
  async _createMinimalProject() {
    const minimalHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Video</title></head>
<body>
  <div data-composition-id="root" data-width="1920" data-height="1080">
    <div class="scene-content">
      <h1 id="title" class="clip" data-start="0" data-duration="5">Your Video</h1>
    </div>
    <style>
      .scene-content {
        display: flex; flex-direction: column;
        justify-content: center; align-items: center;
        width: 100%; height: 100%;
        padding: 80px; box-sizing: border-box;
        background: #0d0d0d; color: #fff;
      }
      h1 { font-size: 64px; text-align: center; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.from("#title", { y: 40, opacity: 0, duration: 0.8, ease: "power3.out" }, 0.3);
      window.__timelines["root"] = tl;
    </script>
  </div>
</body>
</html>`;
    await this.writeComposition(minimalHtml);
  }

  /**
   * Clean up the project directory
   */
  async cleanup() {
    await fs.rm(this.workDir, { recursive: true, force: true });
  }
}

/**
 * Create a HyperFrames engine for a new project
 */
export async function createEngine(projectsDir) {
  const projectId = randomUUID();
  const workDir = path.join(projectsDir, projectId);
  const engine = new HyperFramesEngine(workDir);
  return { engine, projectId, workDir };
}
