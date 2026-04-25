import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateSlug } from './validation.js';

export function createRepo({ dataDir, exportDir }) {
  async function ensureDirs() {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(exportDir, { recursive: true });
  }
  function dataPath(slug) {
    const v = validateSlug(slug);
    if (!v.ok) throw new Error(`invalid slug: ${v.reason}`);
    const p = path.join(dataDir, `${slug}.json`);
    const resolved = path.resolve(p);
    if (!resolved.startsWith(path.resolve(dataDir) + path.sep)) {
      throw new Error('invalid slug: path escape');
    }
    return p;
  }
  function exportPath(slug) {
    const v = validateSlug(slug);
    if (!v.ok) throw new Error(`invalid slug: ${v.reason}`);
    const p = path.join(exportDir, `${slug}.md`);
    const resolved = path.resolve(p);
    if (!resolved.startsWith(path.resolve(exportDir) + path.sep)) {
      throw new Error('invalid slug: path escape');
    }
    return p;
  }
  async function atomicWrite(target, contents) {
    await ensureDirs();
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, contents, 'utf8');
    await fs.rename(tmp, target);
  }
  return {
    async save(slug, decision) {
      await atomicWrite(dataPath(slug), JSON.stringify(decision, null, 2) + '\n');
    },
    async load(slug) {
      const buf = await fs.readFile(dataPath(slug), 'utf8');
      return JSON.parse(buf);
    },
    async list() {
      await ensureDirs();
      const entries = await fs.readdir(dataDir);
      const result = [];
      for (const e of entries) {
        if (!e.endsWith('.json')) continue;
        const slug = e.slice(0, -5);
        if (!validateSlug(slug).ok) continue;
        try {
          const d = JSON.parse(await fs.readFile(path.join(dataDir, e), 'utf8'));
          result.push({ slug, title: d.title ?? slug });
        } catch {
          // Skip unreadable files; the UI will show an error if needed.
        }
      }
      result.sort((a, b) => (a.slug < b.slug ? -1 : 1));
      return result;
    },
    async writeExport(slug, markdown) {
      await atomicWrite(exportPath(slug), markdown);
      return exportPath(slug);
    },
  };
}
