# `decide` — local decision helper

A tiny single-purpose web app for comparing options and exporting a markdown decision document. Built for this repo's [advisory standards](../../.github/copilot-instructions.md): every option must carry a price in DKK, a retailer URL, an excerpt, and a `last_verified` date before it can be exported.

## Run

```bash
cd tools/decide
npm start
```

Opens `http://localhost:5173` in your browser. `Ctrl+C` to stop. No `npm install` needed — there are no runtime dependencies. Requires Node 22+.

```bash
npm test     # runs the smoke test (node --test)
```

Set `DECIDE_NO_OPEN=1` to skip the auto browser-open. Set `PORT=xxxx` to use a different port.

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
`name`, `price_dkk` (≥ 0), `retailer_url` (public http/https, no loopback or private addresses), `excerpt`, and `last_verified` (ISO date, not in the future).

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
