import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreWeighted, scorePugh, scorePairwise } from './scoring.js';

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
