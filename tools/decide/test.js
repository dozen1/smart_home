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
