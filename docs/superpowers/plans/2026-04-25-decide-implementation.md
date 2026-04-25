# `decide` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `decide` local web app spec'd in `docs/superpowers/specs/2026-04-25-decide-design.md` — a no-deps Node 22 + vanilla JS comparison helper that writes JSON-per-decision under `docs/decisions/data/` and exports markdown decision docs.

**Architecture:** Single Node 22 stdlib HTTP server serves a static SPA (`public/`). Scoring lives in one ES module (`scoring.js`) consumed by both the browser and the Node test runner via dynamic import. JSON I/O is atomic (`.tmp` + rename). Validation gates exports.

**Tech Stack:** Node 22 stdlib only (`node:http`, `node:fs/promises`, `node:path`, `node:url`, `node:test`), vanilla HTML / CSS / ES modules. No `npm install` step — the empty `package.json` is just for the `start` / `test` scripts and the `engines` field.

**Spec deviation (note for reviewer):** Spec wrote `server.cjs` and `test.cjs`. Plan uses `.js` + `"type": "module"` in `package.json` instead. Rationale: lets `scoring.js` be a single ES module shared by the browser and the test (no CJS / ESM duplication). Substance unchanged — still Node 22 stdlib only, still a single-file server.

---

## File Structure

```
tools/decide/
  package.json          { "type": "module", "scripts": {start, test}, "engines": {"node": ">=22"} }
  server.js             HTTP server: static + JSON CRUD + export endpoint + browser auto-open
  scoring.js            Pure functions: scoreWeighted, scorePugh, scorePairwise (ES module, browser + Node)
  validation.js         Pure functions: validateSlug, validateRetailerUrl, validateOption, validatePairwiseCompleteness
  export.js             Pure function: renderMarkdown(decision) -> string
  repo.js               Repository: list, load, save (atomic), exportPath helpers
  test.js               node --test smoke test covering scoring, validation, repo round-trip, export
  README.md             How to run, file layout, screenshots placeholder
  public/
    index.html          Single-page UI shell
    styles.css          Minimal styles
    app.js              UI controller (loads scoring.js as ES module)
docs/decisions/
  data/.gitkeep         Created so the directory exists from day 1
```

**Boundaries:**

- `scoring.js` — pure math, zero I/O, zero DOM. Must run identically in the browser and in `node --test`.
- `validation.js` — pure predicates, return `{ ok, errors: [...] }`. No throwing.
- `repo.js` — owns the filesystem. Only place that touches `docs/decisions/data/`.
- `export.js` — pure string render. Takes a validated decision, returns markdown.
- `server.js` — composition root. Wires routes to `repo` + `validation` + `export`. No business logic.
- `app.js` — UI only. Mirrors `validation.js` rules client-side for UX, but the server is the source of truth.

---

## Task 1: Bootstrap directory and package.json

**Files:**
- Create: `tools/decide/package.json`
- Create: `tools/decide/.gitignore`
- Create: `docs/decisions/data/.gitkeep`

- [ ] **Step 1: Write `tools/decide/package.json`**

```json
{
  "name": "decide",
  "private": true,
  "version": "0.1.0",
  "description": "Local decision-comparison helper for smart-home and other choices.",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "node server.js",
    "test": "node --test test.js"
  }
}
```

- [ ] **Step 2: Write `tools/decide/.gitignore`**

```gitignore
node_modules/
*.log
.DS_Store
```

- [ ] **Step 3: Create the data directory placeholder**

```bash
mkdir -p docs/decisions/data && touch docs/decisions/data/.gitkeep
```

- [ ] **Step 4: Verify**

```bash
ls -la tools/decide/ docs/decisions/data/
```

Expected: `package.json` and `.gitignore` exist in `tools/decide/`; `.gitkeep` exists in `docs/decisions/data/`.

- [ ] **Step 5: Commit**

```bash
git add tools/decide/package.json tools/decide/.gitignore docs/decisions/data/.gitkeep
git commit -m "feat(decide): bootstrap package skeleton and data directory

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Weighted scoring (TDD)

**Files:**
- Create: `tools/decide/scoring.js`
- Create: `tools/decide/test.js`

- [ ] **Step 1: Write the failing test**

Create `tools/decide/test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreWeighted } from './scoring.js';

test('scoreWeighted: ranks options on a 0-10 scale, higher score wins', () => {
  const decision = {
    method: 'weighted',
    criteria: [
      { name: 'Durability', weight: 3, lower_is_better: false },
      { name: 'Price (DKK)', weight: 2, lower_is_better: true },
    ],
    options: [
      { id: 'a', name: 'A', scores: { 'Durability': 8, 'Price (DKK)': 4 } }, // (8*3 + (10-4)*2) / 5 = 36/5 = 7.2
      { id: 'b', name: 'B', scores: { 'Durability': 6, 'Price (DKK)': 2 } }, // (6*3 + (10-2)*2) / 5 = 34/5 = 6.8
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/decide && node --test test.js
```

Expected: FAIL — `Cannot find module './scoring.js'` or `scoreWeighted is not a function`.

- [ ] **Step 3: Implement `scoreWeighted`**

Create `tools/decide/scoring.js`:

```js
export function scoreWeighted(decision) {
  const criteria = decision.criteria ?? [];
  const totalWeight = criteria.reduce((s, c) => s + (c.weight ?? 0), 0);
  const ranked = (decision.options ?? []).map((opt) => {
    if (totalWeight <= 0) return { id: opt.id, name: opt.name, score: 0 };
    const sum = criteria.reduce((s, c) => {
      const raw = (opt.scores ?? {})[c.name] ?? 0;
      const adjusted = c.lower_is_better ? (10 - raw) : raw;
      return s + adjusted * (c.weight ?? 0);
    }, 0);
    return { id: opt.id, name: opt.name, score: sum / totalWeight };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/decide && node --test test.js
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/decide/scoring.js tools/decide/test.js
git commit -m "feat(decide): add weighted scoring with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Pugh scoring (TDD)

**Files:**
- Modify: `tools/decide/test.js` (append)
- Modify: `tools/decide/scoring.js` (append)

- [ ] **Step 1: Append failing tests to `test.js`**

```js
import { scorePugh } from './scoring.js';

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
      { id: 'b', name: 'B', pugh: { Durability: 1, Price: -1 } },  // 3 - 2 = 1
      { id: 'c', name: 'C', pugh: { Durability: -1, Price: 1 } },  // -3 + 2 = -1
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
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd tools/decide && node --test test.js
```

Expected: FAIL on `scorePugh` (not exported).

- [ ] **Step 3: Append `scorePugh` to `scoring.js`**

```js
export function scorePugh(decision) {
  const criteria = decision.criteria ?? [];
  const ranked = (decision.options ?? []).map((opt) => {
    if (opt.id === decision.baseline_option) {
      return { id: opt.id, name: opt.name, score: 0 };
    }
    const sum = criteria.reduce((s, c) => {
      const sign = (opt.pugh ?? {})[c.name] ?? 0;
      return s + sign * (c.weight ?? 0);
    }, 0);
    return { id: opt.id, name: opt.name, score: sum };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
cd tools/decide && node --test test.js
```

- [ ] **Step 5: Commit**

```bash
git add tools/decide/scoring.js tools/decide/test.js
git commit -m "feat(decide): add Pugh scoring with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Pairwise (AHP-lite) scoring (TDD)

**Files:**
- Modify: `tools/decide/test.js` (append)
- Modify: `tools/decide/scoring.js` (append)

The pairwise rules (from spec):
- Per criterion, build the reciprocal matrix from upper-triangle storage `pairwise[criterion][otherId]`.
- For two options A and B with `A.id < B.id`, the value is stored on `A.pairwise[criterion][B.id]`. The reciprocal is computed.
- Per criterion: normalize columns, average rows → priority vector.
- Final priority per option = `Σ (criterionWeight * priorityForCriterion)`. Normalize by `Σ criterionWeight` so the result is in [0, 1].
- Cap at 6 options (validated elsewhere; scoring just trusts its input).

- [ ] **Step 1: Append failing test**

```js
import { scorePairwise } from './scoring.js';

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
  // both should have equal priority of 0.5
  assert.equal(ranked[0].score.toFixed(3), '0.500');
  assert.equal(ranked[1].score.toFixed(3), '0.500');
});

test('scorePairwise: A strongly preferred over B yields A higher priority', () => {
  const decision = {
    method: 'pairwise',
    criteria: [{ name: 'X', weight: 1 }],
    options: [
      { id: 'a', name: 'A', pairwise: { X: { b: 9 } } }, // A is 9x preferred over B
      { id: 'b', name: 'B', pairwise: {} },
    ],
  };
  const ranked = scorePairwise(decision);
  assert.equal(ranked[0].id, 'a');
  assert.ok(ranked[0].score > ranked[1].score);
  // A's priority = 9/(9+1) = 0.9, B's = 0.1
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
      { id: 'a', name: 'A', pairwise: { X: { b: 9 }, Y: { b: 1 / 9 } } }, // A wins X strongly, loses Y strongly
      { id: 'b', name: 'B', pairwise: {} },
    ],
  };
  const ranked = scorePairwise(decision);
  // A: (3*0.9 + 1*0.1) / 4 = 0.7; B: (3*0.1 + 1*0.9) / 4 = 0.3
  assert.equal(ranked[0].id, 'a');
  assert.equal(ranked[0].score.toFixed(3), '0.700');
  assert.equal(ranked[1].score.toFixed(3), '0.300');
});
```

- [ ] **Step 2: Run, expect FAIL on missing export**

- [ ] **Step 3: Append `scorePairwise` to `scoring.js`**

```js
function pairwiseValue(option, otherId, criterion, allOptions) {
  // Upper triangle is stored on the option whose id sorts first.
  if (option.id < otherId) {
    return (option.pairwise?.[criterion]?.[otherId]) ?? 1;
  }
  const other = allOptions.find((o) => o.id === otherId);
  const stored = other?.pairwise?.[criterion]?.[option.id];
  return stored ? 1 / stored : 1;
}

function priorityVectorForCriterion(criterion, options) {
  const n = options.length;
  if (n === 0) return [];
  // Build matrix M[i][j] = preference of options[i] over options[j].
  const M = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      M[i][j] = pairwiseValue(options[i], options[j].id, criterion, options);
    }
  }
  // Column sums.
  const colSums = Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) colSums[j] += M[i][j];
  }
  // Normalize columns, average rows.
  const priorities = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += colSums[j] === 0 ? 0 : M[i][j] / colSums[j];
    }
    priorities[i] = rowSum / n;
  }
  return priorities;
}

export function scorePairwise(decision) {
  const options = decision.options ?? [];
  const criteria = decision.criteria ?? [];
  const totalWeight = criteria.reduce((s, c) => s + (c.weight ?? 0), 0);
  if (options.length === 0 || totalWeight <= 0) {
    return options.map((o) => ({ id: o.id, name: o.name, score: 0 }));
  }
  const finalScores = Array(options.length).fill(0);
  for (const c of criteria) {
    const v = priorityVectorForCriterion(c.name, options);
    for (let i = 0; i < options.length; i++) {
      finalScores[i] += (c.weight ?? 0) * v[i];
    }
  }
  const ranked = options.map((o, i) => ({ id: o.id, name: o.name, score: finalScores[i] / totalWeight }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add tools/decide/scoring.js tools/decide/test.js
git commit -m "feat(decide): add pairwise (AHP-lite) scoring with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Slug + path validation (TDD)

**Files:**
- Create: `tools/decide/validation.js`
- Modify: `tools/decide/test.js` (append)

- [ ] **Step 1: Append failing test**

```js
import { validateSlug } from './validation.js';

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
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `tools/decide/validation.js`**

```js
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateSlug(slug) {
  if (typeof slug !== 'string') return { ok: false, reason: 'slug must be a string' };
  if (slug.length === 0 || slug.length > 64) return { ok: false, reason: 'slug length must be 1-64' };
  if (!SLUG_RE.test(slug)) return { ok: false, reason: 'slug must be kebab-case [a-z0-9-], no leading/trailing dashes' };
  return { ok: true };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add tools/decide/validation.js tools/decide/test.js
git commit -m "feat(decide): add slug validation with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Retailer URL validation (TDD)

**Files:**
- Modify: `tools/decide/validation.js` (append)
- Modify: `tools/decide/test.js` (append)

Per spec (post-review): reject `file:`, `data:`, `javascript:`, loopback, and RFC1918 private ranges.

- [ ] **Step 1: Append failing test**

```js
import { validateRetailerUrl } from './validation.js';

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
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Append `validateRetailerUrl` to `validation.js`**

```js
function isPrivateOrLoopbackHost(host) {
  if (!host) return true;
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '[::1]') return true;
  // Strip brackets from IPv6 literals.
  const naked = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  // IPv4 dotted quad check.
  const v4 = naked.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [parseInt(v4[1], 10), parseInt(v4[2], 10)];
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  // IPv6 unique-local fc00::/7.
  if (/^fc[0-9a-f]{2}:/i.test(naked) || /^fd[0-9a-f]{2}:/i.test(naked)) return true;
  return false;
}

export function validateRetailerUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, reason: 'retailer_url is required' };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'retailer_url must be a valid URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: `unsupported scheme ${url.protocol}` };
  }
  if (isPrivateOrLoopbackHost(url.hostname)) {
    return { ok: false, reason: 'retailer_url cannot be a loopback or private address' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add tools/decide/validation.js tools/decide/test.js
git commit -m "feat(decide): add retailer URL validation (block loopback/private/file/data)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Option required-fields validation (TDD)

**Files:**
- Modify: `tools/decide/validation.js` (append)
- Modify: `tools/decide/test.js` (append)

- [ ] **Step 1: Append failing test**

```js
import { validateOption } from './validation.js';

const today = () => new Date().toISOString().slice(0, 10);

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
  const future = '2099-01-01';
  const r = validateOption({
    id: 'a', name: 'X', price_dkk: 1, retailer_url: 'https://example.dk/', excerpt: 'x', last_verified: future,
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
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Append `validateOption` to `validation.js`**

```js
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateOption(opt) {
  const errors = [];
  if (!opt || typeof opt !== 'object') return { ok: false, errors: ['option'] };

  if (typeof opt.name !== 'string' || opt.name.trim() === '' || opt.name.length > 120) {
    errors.push('name');
  }
  if (typeof opt.price_dkk !== 'number' || !Number.isFinite(opt.price_dkk) || opt.price_dkk < 0) {
    errors.push('price_dkk');
  }
  const urlCheck = validateRetailerUrl(opt.retailer_url);
  if (!urlCheck.ok) errors.push('retailer_url');

  if (typeof opt.excerpt !== 'string' || opt.excerpt.trim() === '' || opt.excerpt.length > 500) {
    errors.push('excerpt');
  }
  if (typeof opt.last_verified !== 'string' || !ISO_DATE_RE.test(opt.last_verified)) {
    errors.push('last_verified');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (opt.last_verified > today) errors.push('last_verified');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add tools/decide/validation.js tools/decide/test.js
git commit -m "feat(decide): add option required-fields validation with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Pairwise completeness validation (TDD)

**Files:**
- Modify: `tools/decide/validation.js` (append)
- Modify: `tools/decide/test.js` (append)

Rule (from spec): for N options and each criterion, exactly C(N, 2) entries on the upper triangle. Cap at 6 options.

- [ ] **Step 1: Append failing test**

```js
import { validatePairwiseCompleteness } from './validation.js';

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
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Append `validatePairwiseCompleteness`**

```js
export function validatePairwiseCompleteness(decision) {
  if (decision.method !== 'pairwise') return { ok: true };
  const options = decision.options ?? [];
  const criteria = decision.criteria ?? [];
  if (options.length > 6) return { ok: false, errors: ['pairwise: option count exceeds the cap of 6'] };
  const errors = [];
  // Sort once so "upper triangle" is well-defined.
  const sorted = [...options].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of criteria) {
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const left = sorted[i];
        const right = sorted[j];
        const v = left.pairwise?.[c.name]?.[right.id];
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
          errors.push(`pairwise: missing/invalid comparison for criterion "${c.name}" — ${left.id} vs ${right.id}`);
        }
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add tools/decide/validation.js tools/decide/test.js
git commit -m "feat(decide): validate pairwise upper-triangle completeness with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Atomic file repository (TDD)

**Files:**
- Create: `tools/decide/repo.js`
- Modify: `tools/decide/test.js` (append)

- [ ] **Step 1: Append failing test**

```js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRepo } from './repo.js';

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
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `tools/decide/repo.js`**

```js
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
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add tools/decide/repo.js tools/decide/test.js
git commit -m "feat(decide): add atomic JSON repository with path-traversal protection

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Markdown export renderer (TDD)

**Files:**
- Create: `tools/decide/export.js`
- Modify: `tools/decide/test.js` (append)

The renderer assumes the decision has already passed validation. It does not validate.

- [ ] **Step 1: Append failing test**

```js
import { renderMarkdown } from './export.js';

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
  assert.match(md, /\| Roborock Q Revo Pro \|/);
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
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `tools/decide/export.js`**

```js
import { scoreWeighted, scorePugh, scorePairwise } from './scoring.js';

function rank(decision) {
  switch (decision.method) {
    case 'pugh': return scorePugh(decision);
    case 'pairwise': return scorePairwise(decision);
    case 'weighted':
    default: return scoreWeighted(decision);
  }
}

function maxLastVerified(options) {
  const dates = options.map((o) => o.last_verified).filter(Boolean);
  return dates.sort().at(-1) ?? '';
}

function fmtScore(score, method) {
  if (method === 'pairwise' || method === 'weighted') return score.toFixed(2);
  return String(score);
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function renderMarkdown(decision) {
  const ranked = rank(decision);
  const winnerId = ranked[0]?.id;
  const phase = decision.phase == null ? '—' : String(decision.phase);
  const lines = [];
  lines.push(`# ${decision.title}`);
  lines.push('');
  lines.push(`Last verified: ${maxLastVerified(decision.options ?? [])}`);
  lines.push('');
  lines.push(`Phase: ${phase}  ·  Method: ${decision.method}`);
  lines.push('');

  // Trade-off table.
  const criteria = decision.criteria ?? [];
  const header = ['Option', 'Price (DKK)', ...criteria.map((c) => c.name), 'Score', 'Verdict'];
  const sep = header.map(() => '---');
  lines.push('## Trade-off table');
  lines.push('');
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${sep.join(' | ')} |`);
  for (const r of ranked) {
    const opt = decision.options.find((o) => o.id === r.id);
    if (!opt) continue;
    const cells = [
      r.id === winnerId ? `**${opt.name}**` : opt.name,
      String(opt.price_dkk),
      ...criteria.map((c) => {
        if (decision.method === 'pugh') return String(opt.pugh?.[c.name] ?? 0);
        return String(opt.scores?.[c.name] ?? '');
      }),
      fmtScore(r.score, decision.method),
      r.id === winnerId ? '✅ pick' : '',
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');

  // Citations.
  lines.push('## Citations');
  lines.push('');
  for (const opt of decision.options) {
    lines.push(`- **${opt.name}** — [${hostnameOf(opt.retailer_url)}](${opt.retailer_url}) — _"${opt.excerpt}"_  (verified ${opt.last_verified})`);
  }
  lines.push('');

  // Notes.
  lines.push('## Notes');
  lines.push('');
  lines.push(decision.notes && decision.notes.trim() ? decision.notes : '—');
  lines.push('');

  // Decision.
  lines.push('## Decision');
  lines.push('');
  lines.push(decision.decision && decision.decision.trim() ? decision.decision : 'Pending');
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add tools/decide/export.js tools/decide/test.js
git commit -m "feat(decide): add markdown export renderer with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: HTTP server with JSON CRUD + export gate (TDD)

**Files:**
- Create: `tools/decide/server.js`
- Modify: `tools/decide/test.js` (append)

- [ ] **Step 1: Append failing test**

```js
import { createServer } from './server.js';
import { once } from 'node:events';

async function withServer(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'decide-srv-'));
  const server = createServer({
    dataDir: path.join(dir, 'data'),
    exportDir: path.join(dir, 'exports'),
    publicDir: path.join(process.cwd(), 'public'), // does not need to exist for these tests
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
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `tools/decide/server.js`**

```js
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  // Disallow absolute paths and traversal in static URLs.
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

      // API.
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

      // Static.
      if (req.method === 'GET') return serveStatic(publicDir, pathname, res);

      send(res, 405, { error: 'method not allowed' });
    } catch (err) {
      process.stderr.write(`server error: ${err.stack ?? err}\n`);
      try { send(res, 500, { error: 'internal' }); } catch { /* response already sent */ }
    }
  });
}

// CLI entry: node server.js
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
    // Best-effort browser open.
    const { spawn } = await import('node:child_process');
    const opener = process.platform === 'darwin' ? ['open', url]
      : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url]
      : ['xdg-open', url];
    try { spawn(opener[0], opener.slice(1), { detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ }
  });
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add tools/decide/server.js tools/decide/test.js
git commit -m "feat(decide): add Node 22 stdlib HTTP server with export validation gate

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: Static UI shell

**Files:**
- Create: `tools/decide/public/index.html`
- Create: `tools/decide/public/styles.css`

- [ ] **Step 1: Create `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>decide</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header>
    <h1>decide</h1>
    <button id="new-decision">+ New decision</button>
  </header>
  <main>
    <aside id="sidebar">
      <h2>Decisions</h2>
      <ul id="decision-list"></ul>
    </aside>
    <section id="editor" hidden>
      <header class="editor-head">
        <input id="title" placeholder="Title" />
        <select id="method">
          <option value="weighted">Weighted</option>
          <option value="pugh">Pugh</option>
          <option value="pairwise">Pairwise</option>
        </select>
        <input id="phase" type="number" min="1" placeholder="Phase" />
        <button id="save">Save</button>
        <button id="export">Export markdown</button>
      </header>

      <section>
        <h3>Criteria</h3>
        <table id="criteria-table"><thead><tr><th>Name</th><th>Weight (1–5)</th><th>Lower is better</th><th></th></tr></thead><tbody></tbody></table>
        <button id="add-criterion">+ Criterion</button>
      </section>

      <section>
        <h3>Options</h3>
        <div id="options-list"></div>
        <button id="add-option">+ Option</button>
      </section>

      <section id="score-panel">
        <h3>Scoring</h3>
        <div id="score-area"></div>
        <h4>Ranking</h4>
        <ol id="ranking"></ol>
      </section>

      <section>
        <h3>Notes</h3>
        <textarea id="notes" rows="4"></textarea>
        <h3>Decision</h3>
        <input id="decision-text" placeholder="Final pick (or leave blank for Pending)" />
      </section>

      <p id="status" role="status"></p>
    </section>
  </main>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/styles.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #f7f7f7; color: #222; }
header { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #1e293b; color: #fff; }
header h1 { margin: 0; font-size: 18px; letter-spacing: .04em; }
main { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 56px); }
aside { background: #fff; border-right: 1px solid #ddd; padding: 12px; }
aside h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #666; }
#decision-list { list-style: none; padding: 0; margin: 0; }
#decision-list li { padding: 8px; border-radius: 6px; cursor: pointer; }
#decision-list li.active { background: #e2e8f0; }
section { padding: 16px 20px; }
.editor-head { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 0; }
.editor-head input, .editor-head select { padding: 6px 8px; }
#title { flex: 1; min-width: 200px; }
button { background: #1e293b; color: #fff; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
button:hover { background: #334155; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; font-size: 14px; }
input, textarea, select { font: inherit; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 6px; }
.option-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.option-card .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 6px; }
.option-card .row label { font-size: 12px; color: #555; display: flex; flex-direction: column; }
.option-card .row input { width: 100%; }
.option-card .errors { color: #b91c1c; font-size: 12px; }
#ranking li { padding: 4px 0; }
#status { color: #444; min-height: 1em; }
#status.error { color: #b91c1c; }
#status.ok { color: #166534; }
```

- [ ] **Step 3: Verify by hand**

```bash
cd tools/decide && node server.js &
sleep 1
curl -s http://localhost:5173/ | head -5
curl -s http://localhost:5173/styles.css | head -3
kill %1 || true
```

Expected: HTML shell + CSS served. (Functional UI comes in next task.)

- [ ] **Step 4: Commit**

```bash
git add tools/decide/public/index.html tools/decide/public/styles.css
git commit -m "feat(decide): add UI shell (HTML + CSS)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: Client UI controller

**Files:**
- Create: `tools/decide/public/app.js`

This task is UI plumbing — no TDD. Verification is manual: load the page, click around, save, export.

- [ ] **Step 1: Create `public/app.js`**

```js
import { scoreWeighted, scorePugh, scorePairwise } from '/scoring.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  slug: null,
  decision: null,
};

function emptyDecision() {
  return {
    slug: '', title: '', phase: null, method: 'weighted', baseline_option: null,
    criteria: [], options: [], notes: '', decision: null,
  };
}

function newOption() {
  return {
    id: `opt-${Math.random().toString(36).slice(2, 8)}`,
    name: '', price_dkk: null, retailer_url: '', excerpt: '', last_verified: '',
    scores: {}, pugh: {}, pairwise: {},
  };
}

async function loadList() {
  const r = await fetch('/api/decisions');
  const { decisions } = await r.json();
  const ul = $('#decision-list');
  ul.innerHTML = '';
  for (const d of decisions) {
    const li = document.createElement('li');
    li.textContent = d.title || d.slug;
    li.dataset.slug = d.slug;
    if (d.slug === state.slug) li.classList.add('active');
    li.addEventListener('click', () => loadDecision(d.slug));
    ul.appendChild(li);
  }
}

async function loadDecision(slug) {
  const r = await fetch(`/api/decisions/${encodeURIComponent(slug)}`);
  if (!r.ok) return setStatus('Failed to load.', 'error');
  state.slug = slug;
  state.decision = await r.json();
  renderEditor();
  loadList();
}

function newDecision() {
  state.slug = null;
  state.decision = emptyDecision();
  renderEditor();
}

function slugify(title) {
  return title.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function save() {
  if (!state.decision) return;
  const title = $('#title').value.trim();
  if (!title) return setStatus('Title required.', 'error');
  const slug = state.slug ?? slugify(title);
  if (!slug) return setStatus('Could not derive a slug from the title.', 'error');
  state.decision.title = title;
  state.decision.slug = slug;
  state.decision.phase = $('#phase').value ? parseInt($('#phase').value, 10) : null;
  state.decision.notes = $('#notes').value;
  state.decision.decision = $('#decision-text').value || null;
  const r = await fetch(`/api/decisions/${encodeURIComponent(slug)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state.decision),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return setStatus(`Save failed: ${err.error ?? r.status}`, 'error');
  }
  state.slug = slug;
  setStatus('Saved.', 'ok');
  await loadList();
}

async function exportMarkdown() {
  if (!state.slug) return setStatus('Save first.', 'error');
  const r = await fetch(`/api/decisions/${encodeURIComponent(state.slug)}/export`, { method: 'POST' });
  const body = await r.json().catch(() => ({}));
  if (r.status === 422) {
    const lines = (body.details ?? []).map((d) => `${d.option}: ${d.errors.join(', ')}`);
    return setStatus(`Cannot export — ${lines.join(' | ')}`, 'error');
  }
  if (!r.ok) return setStatus(`Export failed: ${body.error ?? r.status}`, 'error');
  setStatus(`Exported to ${body.markdown_path}`, 'ok');
}

function setStatus(msg, kind = '') {
  const el = $('#status');
  el.textContent = msg;
  el.className = kind;
}

function renderCriteria() {
  const tbody = $('#criteria-table tbody');
  tbody.innerHTML = '';
  state.decision.criteria.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-i="${i}" data-k="name" value="${c.name ?? ''}" /></td>
      <td><input data-i="${i}" data-k="weight" type="number" min="1" max="5" value="${c.weight ?? 1}" /></td>
      <td><input data-i="${i}" data-k="lower_is_better" type="checkbox" ${c.lower_is_better ? 'checked' : ''} /></td>
      <td><button data-i="${i}" data-action="remove-criterion">×</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('input').forEach((el) => {
    el.addEventListener('input', () => {
      const i = +el.dataset.i; const k = el.dataset.k;
      const v = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? +el.value : el.value);
      state.decision.criteria[i][k] = v;
      renderScorePanel();
    });
  });
  tbody.querySelectorAll('button[data-action="remove-criterion"]').forEach((b) => {
    b.addEventListener('click', () => { state.decision.criteria.splice(+b.dataset.i, 1); renderEditor(); });
  });
}

function renderOptions() {
  const list = $('#options-list');
  list.innerHTML = '';
  state.decision.options.forEach((o, i) => {
    const card = document.createElement('div');
    card.className = 'option-card';
    card.innerHTML = `
      <div class="row">
        <label>Name<input data-i="${i}" data-k="name" value="${o.name ?? ''}" /></label>
        <label>Price (DKK)<input data-i="${i}" data-k="price_dkk" type="number" min="0" value="${o.price_dkk ?? ''}" /></label>
        <label>Retailer URL<input data-i="${i}" data-k="retailer_url" value="${o.retailer_url ?? ''}" /></label>
        <label>Last verified<input data-i="${i}" data-k="last_verified" type="date" value="${o.last_verified ?? ''}" /></label>
      </div>
      <label>Excerpt<textarea data-i="${i}" data-k="excerpt" rows="2">${o.excerpt ?? ''}</textarea></label>
      <button data-i="${i}" data-action="remove-option">Remove option</button>
    `;
    list.appendChild(card);
  });
  list.querySelectorAll('input, textarea').forEach((el) => {
    el.addEventListener('input', () => {
      const i = +el.dataset.i; const k = el.dataset.k;
      const v = el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
      state.decision.options[i][k] = v;
      renderScorePanel();
    });
  });
  list.querySelectorAll('button[data-action="remove-option"]').forEach((b) => {
    b.addEventListener('click', () => { state.decision.options.splice(+b.dataset.i, 1); renderEditor(); });
  });
}

function renderScorePanel() {
  const area = $('#score-area');
  area.innerHTML = '';
  if (state.decision.method === 'weighted') area.appendChild(buildWeightedPanel());
  else if (state.decision.method === 'pugh') area.appendChild(buildPughPanel());
  else area.appendChild(buildPairwisePanel());
  renderRanking();
}

function buildWeightedPanel() {
  const tbl = document.createElement('table');
  const head = ['Option', ...state.decision.criteria.map((c) => c.name)];
  tbl.innerHTML = `<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = document.createElement('tbody');
  state.decision.options.forEach((o, i) => {
    const cells = state.decision.criteria.map((c) =>
      `<td><input data-i="${i}" data-c="${c.name}" type="number" min="0" max="10" value="${o.scores?.[c.name] ?? ''}" /></td>`).join('');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${o.name || '(unnamed)'}</td>${cells}`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  tbl.querySelectorAll('input').forEach((el) => {
    el.addEventListener('input', () => {
      const i = +el.dataset.i; const c = el.dataset.c;
      state.decision.options[i].scores ??= {};
      state.decision.options[i].scores[c] = el.value === '' ? 0 : +el.value;
      renderRanking();
    });
  });
  return tbl;
}

function buildPughPanel() {
  const wrap = document.createElement('div');
  // Baseline picker.
  const picker = document.createElement('label');
  picker.innerHTML = `Baseline: <select id="baseline">${
    state.decision.options.map((o) => `<option value="${o.id}" ${state.decision.baseline_option === o.id ? 'selected' : ''}>${o.name || o.id}</option>`).join('')
  }</select>`;
  wrap.appendChild(picker);
  picker.querySelector('select').addEventListener('change', (e) => {
    state.decision.baseline_option = e.target.value;
    renderScorePanel();
  });
  const tbl = document.createElement('table');
  tbl.innerHTML = `<thead><tr><th>Option</th>${state.decision.criteria.map((c) => `<th>${c.name}</th>`).join('')}</tr></thead>`;
  const tbody = document.createElement('tbody');
  state.decision.options.forEach((o, i) => {
    if (o.id === state.decision.baseline_option) {
      tbody.innerHTML += `<tr><td>${o.name} (baseline)</td>${state.decision.criteria.map(() => '<td>0</td>').join('')}</tr>`;
      return;
    }
    const cells = state.decision.criteria.map((c) =>
      `<td><select data-i="${i}" data-c="${c.name}">
        <option value="-1" ${o.pugh?.[c.name] === -1 ? 'selected' : ''}>−</option>
        <option value="0" ${(o.pugh?.[c.name] ?? 0) === 0 ? 'selected' : ''}>=</option>
        <option value="1" ${o.pugh?.[c.name] === 1 ? 'selected' : ''}>+</option>
      </select></td>`).join('');
    tbody.innerHTML += `<tr><td>${o.name || '(unnamed)'}</td>${cells}</tr>`;
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  wrap.querySelectorAll('select[data-i]').forEach((el) => {
    el.addEventListener('change', () => {
      const i = +el.dataset.i; const c = el.dataset.c;
      state.decision.options[i].pugh ??= {};
      state.decision.options[i].pugh[c] = +el.value;
      renderRanking();
    });
  });
  return wrap;
}

function buildPairwisePanel() {
  const wrap = document.createElement('div');
  if (state.decision.options.length > 6) {
    wrap.textContent = 'Pairwise is capped at 6 options. Reduce options or switch method.';
    return wrap;
  }
  for (const c of state.decision.criteria) {
    const h = document.createElement('h5');
    h.textContent = c.name;
    wrap.appendChild(h);
    const sorted = [...state.decision.options].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]; const b = sorted[j];
        const stored = a.pairwise?.[c.name]?.[b.id] ?? 1;
        const row = document.createElement('label');
        row.style.display = 'flex'; row.style.gap = '6px';
        row.innerHTML = `${a.name || a.id} vs ${b.name || b.id}:
          <select data-aid="${a.id}" data-bid="${b.id}" data-c="${c.name}">
            ${[1/9, 1/7, 1/5, 1/3, 1, 3, 5, 7, 9].map((v) => `<option value="${v}" ${Math.abs(v - stored) < 1e-6 ? 'selected' : ''}>${v < 1 ? `1/${Math.round(1/v)}` : v}</option>`).join('')}
          </select>`;
        row.querySelector('select').addEventListener('change', (e) => {
          const opt = state.decision.options.find((o) => o.id === a.id);
          opt.pairwise ??= {};
          opt.pairwise[c.name] ??= {};
          opt.pairwise[c.name][b.id] = parseFloat(e.target.value);
          renderRanking();
        });
        wrap.appendChild(row);
      }
    }
  }
  return wrap;
}

function renderRanking() {
  const ol = $('#ranking');
  ol.innerHTML = '';
  let ranked = [];
  if (state.decision.method === 'weighted') ranked = scoreWeighted(state.decision);
  else if (state.decision.method === 'pugh') ranked = scorePugh(state.decision);
  else ranked = scorePairwise(state.decision);
  for (const r of ranked) {
    const li = document.createElement('li');
    const score = state.decision.method === 'pugh' ? r.score : r.score.toFixed(2);
    li.textContent = `${r.name || r.id} — ${score}`;
    ol.appendChild(li);
  }
}

function renderEditor() {
  $('#editor').hidden = false;
  $('#title').value = state.decision.title ?? '';
  $('#method').value = state.decision.method ?? 'weighted';
  $('#phase').value = state.decision.phase ?? '';
  $('#notes').value = state.decision.notes ?? '';
  $('#decision-text').value = state.decision.decision ?? '';
  renderCriteria();
  renderOptions();
  renderScorePanel();
}

$('#new-decision').addEventListener('click', newDecision);
$('#save').addEventListener('click', save);
$('#export').addEventListener('click', exportMarkdown);
$('#add-criterion').addEventListener('click', () => {
  state.decision ??= emptyDecision();
  state.decision.criteria.push({ name: '', weight: 1, lower_is_better: false });
  renderEditor();
});
$('#add-option').addEventListener('click', () => {
  state.decision ??= emptyDecision();
  state.decision.options.push(newOption());
  renderEditor();
});
$('#method').addEventListener('change', (e) => { if (state.decision) { state.decision.method = e.target.value; renderEditor(); } });
$('#title').addEventListener('input', (e) => { if (state.decision) state.decision.title = e.target.value; });
$('#phase').addEventListener('input', (e) => { if (state.decision) state.decision.phase = e.target.value ? +e.target.value : null; });
$('#notes').addEventListener('input', (e) => { if (state.decision) state.decision.notes = e.target.value; });
$('#decision-text').addEventListener('input', (e) => { if (state.decision) state.decision.decision = e.target.value || null; });

loadList();
```

- [ ] **Step 2: Manual smoke test**

```bash
cd tools/decide && node server.js
```

Open `http://localhost:5173`. Verify:
1. Page loads, shows empty sidebar.
2. Click **+ New decision** → title input, method select, criteria/options sections appear.
3. Add a criterion (name + weight) and two options (with required fields).
4. Score them under Weighted; ranking updates live.
5. Click **Save** — `docs/decisions/data/<slug>.json` is created; sidebar lists the decision.
6. Click **Export markdown** — `docs/decisions/<slug>.md` is created with the trade-off table and citations.
7. Switch method to Pugh and Pairwise — score panels change accordingly, ranking updates.
8. Try export with a missing field on an option — UI reports the missing field via the status line, no markdown written.

Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add tools/decide/public/app.js
git commit -m "feat(decide): add client UI controller (vanilla ES module)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 14: Public scoring import path

**Files:**
- Modify: `tools/decide/server.js` (add `/scoring.js` route fallback)

The browser imports `from '/scoring.js'` but the file lives at `tools/decide/scoring.js`, not under `public/`. We could duplicate the file or wire a server route. Wire a route — DRY.

- [ ] **Step 1: Add a smoke test**

Append to `test.js`:

```js
test('server: serves /scoring.js from the package root', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/scoring.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /javascript/);
    const body = await r.text();
    assert.match(body, /export function scoreWeighted/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL (404)**

- [ ] **Step 3: Patch the static handler in `server.js`**

Find this block in `server.js`:

```js
      // Static.
      if (req.method === 'GET') return serveStatic(publicDir, pathname, res);
```

Replace with:

```js
      // Static — special-case /scoring.js so the browser can ES-import it directly.
      if (req.method === 'GET' && pathname === '/scoring.js') {
        const scoringPath = path.join(path.dirname(publicDir), 'scoring.js');
        try {
          const buf = await fs.readFile(scoringPath);
          return send(res, 200, buf, { 'content-type': MIME['.js'] });
        } catch {
          return send(res, 404, 'not found');
        }
      }
      if (req.method === 'GET') return serveStatic(publicDir, pathname, res);
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd tools/decide && node --test test.js
```

- [ ] **Step 5: Commit**

```bash
git add tools/decide/server.js tools/decide/test.js
git commit -m "feat(decide): serve /scoring.js to the browser without duplication

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 15: README

**Files:**
- Create: `tools/decide/README.md`

- [ ] **Step 1: Write the README**

```markdown
# `decide` — local decision helper

A tiny single-purpose web app for comparing options and exporting a markdown decision document. Built for this repo's [advisory standards](../../.github/copilot-instructions.md): every option must carry a price in DKK, a retailer URL, an excerpt, and a `last_verified` date before it can be exported.

## Run

```bash
cd tools/decide
npm start
```

Opens `http://localhost:5173` in your browser. `Ctrl+C` to stop. No `npm install` is needed — there are no runtime dependencies.

```bash
npm test     # runs the smoke test (node --test)
```

## How it stores data

| Path | Purpose |
|---|---|
| `tools/decide/` | App source (server, client, scoring, validation, export) |
| `docs/decisions/data/<slug>.json` | Source of truth per decision, git-tracked |
| `docs/decisions/<slug>.md` | Generated markdown decision doc, git-tracked |

Commit both the JSON and the markdown together in a feature branch.

## Scoring methods

- **Weighted** (default) — each criterion gets a weight (1–5); each option is scored 0–10 per criterion. Final score is `Σ (score × weight) / Σ weight`, on a 0–10 scale.
- **Pugh** — pick a baseline; score every other option as `+`, `=`, or `−` on each criterion. Final score is `Σ (sign × weight)`.
- **Pairwise (AHP-lite)** — for each criterion, compare every pair of options on a 1–9 Saaty scale. Capped at 6 options.

You can switch method per decision; raw inputs for the other methods are preserved.

## Export validation

The export endpoint refuses to write a markdown file unless every option has all of:
`name`, `price_dkk` (≥ 0), `retailer_url` (public https/http, no loopback or private addresses), `excerpt`, and `last_verified` (ISO date, not in the future).

For the pairwise method, the upper triangle of comparisons must be fully populated (`C(N, 2)` entries per criterion).

## File layout

```
tools/decide/
  server.js        Node 22 stdlib HTTP server
  scoring.js       Pure scoring functions (browser + Node)
  validation.js    Pure validation predicates
  export.js        Markdown renderer
  repo.js          Atomic JSON repository
  test.js          node --test smoke tests
  package.json     Just the start/test scripts; no deps
  public/
    index.html
    styles.css
    app.js         UI controller
```
```

- [ ] **Step 2: Commit**

```bash
git add tools/decide/README.md
git commit -m "docs(decide): add README with run + storage instructions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 16: Final verification + PR

**Files:** none (verification only).

- [ ] **Step 1: Run the full smoke test**

```bash
cd tools/decide && node --test test.js
```

Expected: all tests pass (~ 20+ tests across scoring, validation, repo, server).

- [ ] **Step 2: Manual end-to-end**

```bash
cd tools/decide && node server.js
```

In browser:
1. Create a decision titled "Phase 1: Robot vacuum + mop", phase 1, method weighted.
2. Add criteria: Durability (w=3), Price DKK (w=2, lower_is_better), Warranty years (w=2).
3. Add 2 sample options with all required fields populated using a real Pricerunner / Proshop URL and excerpt.
4. Score them, observe live ranking.
5. Save, then export. Verify `docs/decisions/data/phase-1-robot-vacuum-mop.json` and `docs/decisions/phase-1-robot-vacuum-mop.md` exist and look right.
6. Switch method to Pugh and Pairwise — ranking updates without errors.
7. Stop the server.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feat/decide-implementation
gh pr create --base main --head feat/decide-implementation \
  --title "feat: implement decide local web app per spec" \
  --body "Implements the spec in \`docs/superpowers/specs/2026-04-25-decide-design.md\`. No runtime deps, Node 22 stdlib only. Three scoring methods (weighted / Pugh / pairwise). Export gate enforces price/url/excerpt/last_verified per repo rules. Smoke tests via \`node --test\`. See \`tools/decide/README.md\` for run instructions.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 4: Self-review the PR**

Dispatch the `code-review` sub-agent on the PR. Address findings on the same branch. Post the response comment.

- [ ] **Step 5: Hand off to user**

Tell the user the PR is ready for review and merge.

---

## Self-Review Notes

- **Spec coverage:** every section of the spec is mapped to a task — three scoring methods (Tasks 2–4), validation gate (Tasks 5–8), atomic JSON I/O (Task 9), markdown export (Task 10), HTTP server (Task 11), UI (Tasks 12–13), shared scoring import (Task 14), README (Task 15), final verification (Task 16).
- **No placeholders:** every code step contains the full code; every test step contains the full test; every commit step contains the full commit message.
- **Type / name consistency:** decision schema (`scores`, `pugh`, `pairwise`, `baseline_option`, `criteria[].lower_is_better`, `options[].id`) is used identically across scoring, validation, export, repo, server, and client.
- **DRY:** `scoring.js` is loaded by browser and Node from a single source; `validation.js` is shared by server and (via duplicated client logic in `app.js`, intentionally — server is source of truth) the UI; export depends on scoring (no separate ranking implementation).
- **YAGNI:** no auth, no charts, no theming, no automated scraping, no client-side test framework.
- **TDD:** every pure module (scoring × 3, validation × 4, repo, export, server) has a failing test first.
