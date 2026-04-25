import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreWeighted, scorePugh, scorePairwise } from './scoring.js';
import {
  validateSlug,
  validateRetailerUrl,
  validateOption,
  validatePairwiseCompleteness,
} from './validation.js';

const today = () => new Date().toISOString().slice(0, 10);

test('scoreWeighted: ranks options on a 0-10 scale, higher score wins', () => {
  const decision = {
    method: 'weighted',
    criteria: [
      { name: 'Durability', weight: 3, lower_is_better: false },
      { name: 'Price (DKK)', weight: 2, lower_is_better: true },
    ],
    options: [
      { id: 'a', name: 'A', scores: { 'Durability': 8, 'Price (DKK)': 4 } },
      { id: 'b', name: 'B', scores: { 'Durability': 6, 'Price (DKK)': 2 } },
    ],
  };
  const ranked = scoreWeighted(decision);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, 'a');
  assert.equal(ranked[0].score.toFixed(2), '7.20');
  assert.equal(ranked[1].id, 'b');
  assert.equal(ranked[1].score.toFixed(2), '6.80');
});

test('scoreWeighted: handles missing scores as 0', () => {
  const decision = {
    method: 'weighted',
    criteria: [{ name: 'X', weight: 1, lower_is_better: false }],
    options: [{ id: 'a', name: 'A', scores: {} }],
  };
  const ranked = scoreWeighted(decision);
  assert.equal(ranked[0].score, 0);
});

test('scoreWeighted: zero total weight yields zero score, no NaN', () => {
  const decision = {
    method: 'weighted',
    criteria: [{ name: 'X', weight: 0, lower_is_better: false }],
    options: [{ id: 'a', name: 'A', scores: { X: 9 } }],
  };
  const ranked = scoreWeighted(decision);
  assert.equal(ranked[0].score, 0);
});

test('scorePugh: baseline scores 0, others sum (sign * weight)', () => {
  const decision = {
    method: 'pugh',
    baseline_option: 'a',
    criteria: [
      { name: 'Durability', weight: 3 },
      { name: 'Price', weight: 2 },
    ],
    options: [
      { id: 'a', name: 'A', pugh: { Durability: 0, Price: 0 } },
      { id: 'b', name: 'B', pugh: { Durability: 1, Price: -1 } },
      { id: 'c', name: 'C', pugh: { Durability: -1, Price: 1 } },
    ],
  };
  const ranked = scorePugh(decision);
  assert.equal(ranked[0].id, 'b');
  assert.equal(ranked[0].score, 1);
  assert.equal(ranked[1].id, 'a');
  assert.equal(ranked[1].score, 0);
  assert.equal(ranked[2].id, 'c');
  assert.equal(ranked[2].score, -1);
});

test('scorePugh: missing pugh entry treated as 0', () => {
  const decision = {
    method: 'pugh',
    baseline_option: 'a',
    criteria: [{ name: 'X', weight: 1 }],
    options: [
      { id: 'a', name: 'A', pugh: {} },
      { id: 'b', name: 'B', pugh: {} },
    ],
  };
  const ranked = scorePugh(decision);
  assert.equal(ranked[0].score, 0);
  assert.equal(ranked[1].score, 0);
});

test('scorePairwise: equal comparisons yield equal priorities', () => {
  const decision = {
    method: 'pairwise',
    criteria: [{ name: 'X', weight: 1 }],
    options: [
      { id: 'a', name: 'A', pairwise: { X: { b: 1 } } },
      { id: 'b', name: 'B', pairwise: {} },
    ],
  };
  const ranked = scorePairwise(decision);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].score.toFixed(3), '0.500');
  assert.equal(ranked[1].score.toFixed(3), '0.500');
});

test('scorePairwise: A strongly preferred over B yields A higher priority', () => {
  const decision = {
    method: 'pairwise',
    criteria: [{ name: 'X', weight: 1 }],
    options: [
      { id: 'a', name: 'A', pairwise: { X: { b: 9 } } },
      { id: 'b', name: 'B', pairwise: {} },
    ],
  };
  const ranked = scorePairwise(decision);
  assert.equal(ranked[0].id, 'a');
  assert.ok(ranked[0].score > ranked[1].score);
  assert.equal(ranked[0].score.toFixed(3), '0.900');
  assert.equal(ranked[1].score.toFixed(3), '0.100');
});

test('scorePairwise: weights criterion priorities', () => {
  const decision = {
    method: 'pairwise',
    criteria: [
      { name: 'X', weight: 3 },
      { name: 'Y', weight: 1 },
    ],
    options: [
      { id: 'a', name: 'A', pairwise: { X: { b: 9 }, Y: { b: 1 / 9 } } },
      { id: 'b', name: 'B', pairwise: {} },
    ],
  };
  const ranked = scorePairwise(decision);
  assert.equal(ranked[0].id, 'a');
  assert.equal(ranked[0].score.toFixed(3), '0.700');
  assert.equal(ranked[1].score.toFixed(3), '0.300');
});

test('validateSlug: accepts kebab-case', () => {
  assert.deepEqual(validateSlug('phase-1-robot-vacuum'), { ok: true });
});

test('validateSlug: rejects path traversal and unsafe chars', () => {
  for (const bad of ['../etc', 'foo/bar', 'foo\\bar', 'foo bar', 'FOO', 'foo.txt', '', '  ', '-leading', 'trailing-']) {
    const r = validateSlug(bad);
    assert.equal(r.ok, false, `should reject "${bad}"`);
  }
});

test('validateSlug: enforces max length', () => {
  assert.equal(validateSlug('a'.repeat(80)).ok, false);
  assert.equal(validateSlug('a'.repeat(64)).ok, true);
});

test('validateRetailerUrl: accepts public https retailer URLs', () => {
  for (const ok of [
    'https://www.proshop.dk/Stovsugere/Roborock-Q-Revo-Pro/3214442',
    'https://www.elgiganten.dk/product/...',
    'https://pricerunner.dk/p/...',
  ]) {
    assert.equal(validateRetailerUrl(ok).ok, true, `should accept ${ok}`);
  }
});

test('validateRetailerUrl: rejects unsafe schemes', () => {
  for (const bad of [
    'file:///etc/passwd',
    'data:text/html,<script>',
    'javascript:alert(1)',
    'ftp://example.com',
    'not-a-url',
  ]) {
    assert.equal(validateRetailerUrl(bad).ok, false, `should reject ${bad}`);
  }
});

test('validateRetailerUrl: rejects loopback and private addresses', () => {
  for (const bad of [
    'http://localhost/foo',
    'http://127.0.0.1:5173/',
    'http://[::1]/',
    'http://10.0.0.5/',
    'http://192.168.1.10/',
    'http://172.16.0.5/',
  ]) {
    assert.equal(validateRetailerUrl(bad).ok, false, `should reject ${bad}`);
  }
});

test('validateOption: accepts a complete option', () => {
  const r = validateOption({
    id: 'a',
    name: 'Roborock Q Revo Pro',
    price_dkk: 4999,
    retailer_url: 'https://www.proshop.dk/foo',
    excerpt: 'Pris 4.999 kr. På lager.',
    last_verified: today(),
  });
  assert.deepEqual(r, { ok: true });
});

test('validateOption: lists every missing field', () => {
  const r = validateOption({ id: 'a', name: '', price_dkk: null, retailer_url: '', excerpt: '', last_verified: null });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.sort(), ['excerpt', 'last_verified', 'name', 'price_dkk', 'retailer_url'].sort());
});

test('validateOption: rejects future last_verified', () => {
  const r = validateOption({
    id: 'a', name: 'X', price_dkk: 1, retailer_url: 'https://example.dk/', excerpt: 'x', last_verified: '2099-01-01',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('last_verified'));
});

test('validateOption: rejects negative price', () => {
  const r = validateOption({
    id: 'a', name: 'X', price_dkk: -1, retailer_url: 'https://example.dk/', excerpt: 'x', last_verified: today(),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('price_dkk'));
});

test('validateOption: rejects excerpt over 500 chars', () => {
  const r = validateOption({
    id: 'a', name: 'X', price_dkk: 1, retailer_url: 'https://example.dk/', excerpt: 'x'.repeat(501), last_verified: today(),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('excerpt'));
});

test('validatePairwiseCompleteness: accepts complete upper-triangle for 3 options', () => {
  const decision = {
    method: 'pairwise',
    criteria: [{ name: 'X', weight: 1 }],
    options: [
      { id: 'a', pairwise: { X: { b: 2, c: 3 } } },
      { id: 'b', pairwise: { X: { c: 1 } } },
      { id: 'c', pairwise: {} },
    ],
  };
  assert.deepEqual(validatePairwiseCompleteness(decision), { ok: true });
});

test('validatePairwiseCompleteness: reports missing comparisons', () => {
  const decision = {
    method: 'pairwise',
    criteria: [{ name: 'X', weight: 1 }],
    options: [
      { id: 'a', pairwise: { X: { b: 2 } } },
      { id: 'b', pairwise: {} },
      { id: 'c', pairwise: {} },
    ],
  };
  const r = validatePairwiseCompleteness(decision);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('a vs c')));
  assert.ok(r.errors.some((e) => e.includes('b vs c')));
});

test('validatePairwiseCompleteness: rejects > 6 options', () => {
  const options = Array.from({ length: 7 }, (_, i) => ({ id: `o${i}`, pairwise: {} }));
  const r = validatePairwiseCompleteness({ method: 'pairwise', criteria: [{ name: 'X', weight: 1 }], options });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('cap')));
});

test('validatePairwiseCompleteness: trivially ok for non-pairwise method', () => {
  assert.deepEqual(validatePairwiseCompleteness({ method: 'weighted', options: [], criteria: [] }), { ok: true });
});

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRepo } from './repo.js';
import { renderMarkdown } from './export.js';

async function withTempRepo(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'decide-'));
  try {
    const repo = createRepo({ dataDir: path.join(dir, 'data'), exportDir: path.join(dir, 'exports') });
    await fn(repo, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('repo: round-trips a decision', async () => {
  await withTempRepo(async (repo) => {
    const decision = { slug: 'foo-bar', title: 'T', method: 'weighted', criteria: [], options: [] };
    await repo.save('foo-bar', decision);
    const loaded = await repo.load('foo-bar');
    assert.deepEqual(loaded, decision);
  });
});

test('repo: list returns saved slugs and titles', async () => {
  await withTempRepo(async (repo) => {
    await repo.save('a-one', { slug: 'a-one', title: 'A', method: 'weighted', criteria: [], options: [] });
    await repo.save('b-two', { slug: 'b-two', title: 'B', method: 'weighted', criteria: [], options: [] });
    const list = await repo.list();
    assert.deepEqual(list.map((d) => d.slug).sort(), ['a-one', 'b-two']);
  });
});

test('repo: rejects path-traversal slugs', async () => {
  await withTempRepo(async (repo) => {
    await assert.rejects(repo.save('../evil', { slug: '../evil' }), /invalid slug/i);
    await assert.rejects(repo.load('../evil'), /invalid slug/i);
  });
});

test('renderMarkdown: includes title, last-verified, citations, decision', () => {
  const md = renderMarkdown({
    slug: 'phase-1-vac',
    title: 'Phase 1: Robot vacuum',
    phase: 1,
    method: 'weighted',
    criteria: [
      { name: 'Durability', weight: 3, lower_is_better: false },
      { name: 'Price (DKK)', weight: 2, lower_is_better: true },
    ],
    options: [
      { id: 'a', name: 'Roborock Q Revo Pro', price_dkk: 4999, retailer_url: 'https://www.proshop.dk/foo', excerpt: 'Pris 4.999 kr.', last_verified: '2026-04-25', scores: { 'Durability': 8, 'Price (DKK)': 4 } },
      { id: 'b', name: 'Dreame L20 Ultra', price_dkk: 6499, retailer_url: 'https://www.elgiganten.dk/bar', excerpt: 'Pris 6.499 kr.', last_verified: '2026-04-24', scores: { 'Durability': 7, 'Price (DKK)': 6 } },
    ],
    notes: 'On discount this week.',
    decision: 'Roborock Q Revo Pro',
  });
  assert.match(md, /^# Phase 1: Robot vacuum/m);
  assert.match(md, /Last verified: 2026-04-25/);
  assert.match(md, /Phase: 1/);
  assert.match(md, /Method: weighted/);
  assert.match(md, /\| \*\*Roborock Q Revo Pro\*\* \|/);
  assert.match(md, /\| Dreame L20 Ultra \|/);
  assert.match(md, /✅ pick/);
  assert.match(md, /\[proshop\.dk\]\(https:\/\/www\.proshop\.dk\/foo\)/);
  assert.match(md, /"Pris 4\.999 kr\."/);
  assert.match(md, /On discount this week\./);
  assert.match(md, /## Decision\n\nRoborock Q Revo Pro/);
});

test('renderMarkdown: shows "Pending" when no decision yet', () => {
  const md = renderMarkdown({
    slug: 's', title: 'T', phase: null, method: 'weighted',
    criteria: [{ name: 'X', weight: 1, lower_is_better: false }],
    options: [{ id: 'a', name: 'A', price_dkk: 1, retailer_url: 'https://example.dk/', excerpt: 'x', last_verified: '2026-04-25', scores: { X: 5 } }],
    notes: '', decision: null,
  });
  assert.match(md, /## Decision\n\nPending/);
});

import { createServer } from './server.js';
import { once } from 'node:events';

async function withServer(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'decide-srv-'));
  const server = createServer({
    dataDir: path.join(dir, 'data'),
    exportDir: path.join(dir, 'exports'),
    publicDir: path.join(process.cwd(), 'public'),
  });
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('server: PUT then GET round-trips a decision', async () => {
  await withServer(async (base) => {
    const decision = {
      slug: 'phase-1-vac', title: 'T', phase: 1, method: 'weighted',
      criteria: [], options: [], notes: '', decision: null,
    };
    const put = await fetch(`${base}/api/decisions/phase-1-vac`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(decision),
    });
    assert.equal(put.status, 200);
    const got = await fetch(`${base}/api/decisions/phase-1-vac`);
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), decision);
  });
});

test('server: rejects bad slug with 400', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/api/decisions/..%2Fevil`, { method: 'PUT', body: '{}', headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 400);
  });
});

test('server: export with missing required fields returns 422 listing them', async () => {
  await withServer(async (base) => {
    const decision = {
      slug: 'phase-1-vac', title: 'T', phase: 1, method: 'weighted',
      criteria: [{ name: 'X', weight: 1, lower_is_better: false }],
      options: [{ id: 'a', name: 'A', price_dkk: null, retailer_url: '', excerpt: '', last_verified: null, scores: { X: 5 } }],
      notes: '', decision: null,
    };
    await fetch(`${base}/api/decisions/phase-1-vac`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(decision) });
    const r = await fetch(`${base}/api/decisions/phase-1-vac/export`, { method: 'POST' });
    assert.equal(r.status, 422);
    const body = await r.json();
    assert.ok(Array.isArray(body.details));
    assert.ok(body.details.some((d) => d.option === 'a' && d.errors.includes('price_dkk')));
  });
});

test('server: export with valid data writes markdown and returns 200', async () => {
  await withServer(async (base) => {
    const today = new Date().toISOString().slice(0, 10);
    const decision = {
      slug: 'phase-1-vac', title: 'T', phase: 1, method: 'weighted',
      criteria: [{ name: 'Durability', weight: 1, lower_is_better: false }],
      options: [{
        id: 'a', name: 'A',
        price_dkk: 4999, retailer_url: 'https://www.proshop.dk/foo', excerpt: 'Pris 4.999 kr.', last_verified: today,
        scores: { Durability: 8 }, pugh: {}, pairwise: {},
      }],
      notes: '', decision: null,
    };
    await fetch(`${base}/api/decisions/phase-1-vac`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(decision) });
    const r = await fetch(`${base}/api/decisions/phase-1-vac/export`, { method: 'POST' });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.match(body.markdown_path, /phase-1-vac\.md$/);
  });
});
