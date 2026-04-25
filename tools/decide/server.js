import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRepo } from './repo.js';
import { validateSlug, validateOption, validatePairwiseCompleteness } from './validation.js';
import { renderMarkdown } from './export.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !(body instanceof Buffer);
  res.writeHead(status, {
    'content-type': isJson ? 'application/json; charset=utf-8' : (headers['content-type'] ?? 'text/plain; charset=utf-8'),
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

function validateForExport(decision) {
  const issues = [];
  for (const opt of decision.options ?? []) {
    const r = validateOption(opt);
    if (!r.ok) issues.push({ option: opt.id ?? opt.name ?? '?', errors: r.errors });
  }
  const pw = validatePairwiseCompleteness(decision);
  if (!pw.ok) issues.push({ option: '__pairwise__', errors: pw.errors });
  return issues;
}

async function serveStatic(publicDir, urlPath, res) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  if (rel.includes('..')) return send(res, 400, 'bad path');
  const file = path.join(publicDir, rel);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(publicDir) + path.sep)) return send(res, 400, 'bad path');
  try {
    const buf = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    return send(res, 200, buf, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
  } catch {
    return send(res, 404, 'not found');
  }
}

export function createServer({ dataDir, exportDir, publicDir }) {
  const repo = createRepo({ dataDir, exportDir });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const { pathname } = url;

      if (pathname === '/api/decisions' && req.method === 'GET') {
        return send(res, 200, { decisions: await repo.list() });
      }
      const matchPut = pathname.match(/^\/api\/decisions\/([^/]+)$/);
      if (matchPut) {
        const slug = decodeURIComponent(matchPut[1]);
        if (!validateSlug(slug).ok) return send(res, 400, { error: 'invalid slug' });
        if (req.method === 'GET') {
          try { return send(res, 200, await repo.load(slug)); }
          catch { return send(res, 404, { error: 'not found' }); }
        }
        if (req.method === 'PUT') {
          const body = await readJson(req);
          if (!body || typeof body !== 'object') return send(res, 400, { error: 'invalid json' });
          await repo.save(slug, { ...body, slug });
          return send(res, 200, { ok: true });
        }
      }
      const matchExport = pathname.match(/^\/api\/decisions\/([^/]+)\/export$/);
      if (matchExport && req.method === 'POST') {
        const slug = decodeURIComponent(matchExport[1]);
        if (!validateSlug(slug).ok) return send(res, 400, { error: 'invalid slug' });
        let decision;
        try { decision = await repo.load(slug); }
        catch { return send(res, 404, { error: 'not found' }); }
        const issues = validateForExport(decision);
        if (issues.length > 0) return send(res, 422, { error: 'validation failed', details: issues });
        const markdown = renderMarkdown(decision);
        const markdown_path = await repo.writeExport(slug, markdown);
        return send(res, 200, { ok: true, markdown_path });
      }

      if (req.method === 'GET') return serveStatic(publicDir, pathname, res);

      send(res, 405, { error: 'method not allowed' });
    } catch (err) {
      process.stderr.write(`server error: ${err.stack ?? err}\n`);
      try { send(res, 500, { error: 'internal' }); } catch { /* response already sent */ }
    }
  });
}

function openBrowser(url) {
  const opener = process.platform === 'darwin' ? ['open', url]
    : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url]
    : ['xdg-open', url];
  try { spawn(opener[0], opener.slice(1), { detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const server = createServer({
    dataDir: path.join(root, 'docs/decisions/data'),
    exportDir: path.join(root, 'docs/decisions'),
    publicDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'public'),
  });
  const port = parseInt(process.env.PORT ?? '5173', 10);
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    process.stdout.write(`decide listening on ${url}\n`);
    if (process.env.DECIDE_NO_OPEN !== '1') openBrowser(url);
  });
}
