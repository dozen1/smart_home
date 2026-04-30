# `decide` — Local Decision Helper

Last verified: 2026-04-25

## Purpose

A small, local web app for comparing options when making a final decision on a smart-home purchase (or any other choice tracked in this repo). Built to enforce the repository's advisory standards: every option must carry a price in DKK, a retailer URL, a relevant excerpt from that page, and a `last_verified` date before it can be exported.

The tool will be reused across every phase of the smart-home rollout (Phase 1 cleaning, Phase 2 lighting, Phase 3 climate, …).

## Non-Goals

- No authentication, multi-user features, or deployment beyond `localhost`.
- No automated price scraping. Pasting in retailer URL + excerpt is a manual step (a future, separate task may use Playwright to fetch them).
- No charts, theming, or animations.
- No framework, bundler, or build step. Node 22 stdlib + vanilla HTML/JS/CSS only.

## Architecture

```
tools/decide/
  server.cjs            Node 22 stdlib HTTP server: serves UI, JSON CRUD, markdown export
  public/
    index.html          Single-page UI shell
    app.js              Client logic (vanilla ES modules)
    styles.css          Minimal styles
  package.json          `start` script, Node 22 engines field, no runtime deps
  README.md             How to run, screenshots, file layout
docs/decisions/
  data/<slug>.json      Source of truth per decision (git-tracked)
  <slug>.md             Generated markdown decision doc (git-tracked)
```

### Components

1. **Server (`server.cjs`)** — single Node 22 file using only `node:http`, `node:fs/promises`, `node:path`, `node:url`. Responsibilities:
   - Serve static files from `public/`.
   - `GET /api/decisions` → list slugs from `docs/decisions/data/`.
   - `GET /api/decisions/:slug` → return the JSON.
   - `PUT /api/decisions/:slug` → validate + write JSON.
   - `POST /api/decisions/:slug/export` → render and write `docs/decisions/<slug>.md`.
   - `POST /api/open` → opens the browser at startup (best-effort, platform-aware).
   - Path safety: reject any slug that isn't `[a-z0-9-]+`. All file paths joined via `path.join` and checked to remain inside `docs/decisions/data/`.

2. **Client (`public/`)** — one page, three score panels (Weighted / Pugh / Pairwise) sharing the same options list. State held in plain JS objects; `fetch` to the server on save/load/export. No framework.

3. **Data layer** — JSON files. One file per decision. The schema is the contract between client and server.

### Data Flow

1. User opens `http://localhost:5173`.
2. UI calls `GET /api/decisions` → list of slugs → sidebar.
3. User picks a decision or creates a new one (slug auto-generated from title; user can edit).
4. UI calls `GET /api/decisions/<slug>` → loads state.
5. User edits criteria, options, scores, weights. Ranking is computed client-side and re-rendered live.
6. **Save** → `PUT /api/decisions/<slug>` writes the JSON.
7. **Export markdown** → `POST /api/decisions/<slug>/export` writes the markdown decision doc.
8. User commits both files in a feature branch and opens a PR per repo rule #3.

## Scoring Methods (user-selectable per decision)

### Weighted (default)

- Each criterion has a `weight` (1–5).
- Each option has a `score` (0–10) per criterion. **Higher always means better** — for criteria where lower raw values are preferable (price, weight in kg), the user simply assigns the lightest/cheapest option a high score (closer to 10) when rating.
- Final score = `Σ (score * weight) / Σ weight`.
- Result is on the same **0–10 scale** as the inputs. The division by `Σ weight` is intentional: it keeps the score interpretable (e.g. "8.2 / 10") regardless of how many criteria or how high the weights run. Scores are meaningful for ranking *within* a decision; they are **not** meant to be compared across decisions with different criteria sets.
- Ranked descending.

### Pugh

- User picks one option as the **baseline**.
- Each non-baseline option scores `+1`, `0`, or `−1` per criterion vs. the baseline.
- Final score = `Σ (score * weight)`. Baseline always 0.
- Ranked descending.

### Pairwise (AHP-lite)

- For each criterion, the user compares every pair of options on a 1–9 Saaty scale (5 = equal). Default = 5.
- Per criterion: build the reciprocal matrix, normalize columns, average rows → priority vector.
- Final priority = weighted sum of per-criterion priority vectors using the criterion weights.
- Ranked descending.
- Cap at 6 options to keep pairwise tractable; show a warning if more.

**Pairwise storage rule:** only the upper triangle is stored. For options A and B with `A.id < B.id`, the comparison is recorded once on `A.pairwise[criterion][B.id]`. The reciprocal (`B vs A = 1 / value`) is computed at scoring time, never stored. The server validates that for N options each criterion has exactly `C(N, 2)` upper-triangle entries before allowing export.

## Required Fields per Option (validation gate)

Before an option can be included in an export, the server validates:

| Field | Rule |
|---|---|
| `name` | Non-empty string, ≤ 120 chars |
| `price_dkk` | Number ≥ 0 |
| `retailer_url` | Valid `https://` URL (or `http://` for whitelisted Danish retailer hostnames). Reject `file://`, `data:`, `javascript:`, and any host that resolves to a loopback / private address (`localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fc00::/7`). The URL must point at a publicly verifiable retailer page. |
| `excerpt` | Non-empty string, ≤ 500 chars (the relevant text from that page) |
| `last_verified` | ISO date `YYYY-MM-DD`, not in the future |

Save (`PUT`) is allowed with missing fields (work in progress). **Export (`POST /export`) is rejected** with a 422 listing the missing fields if any required field is absent.

## Data Schema

```json
{
  "slug": "phase-1-robot-vacuum-mop",
  "title": "Phase 1: Robot vacuum + mop",
  "phase": 1,
  "method": "weighted",
  "baseline_option": null,
  "criteria": [
    { "name": "Durability", "weight": 3 },
    { "name": "Price (DKK)", "weight": 2 },
    { "name": "Warranty (years)", "weight": 2 }
  ],
  "options": [
    {
      "id": "opt-1",
      "name": "Roborock Q Revo Pro",
      "price_dkk": 4999,
      "retailer_url": "https://www.proshop.dk/...",
      "excerpt": "Pris 4.999 kr. På lager. 2 års reklamationsret.",
      "last_verified": "2026-04-25",
      "scores": { "Durability": 8, "Price (DKK)": 7, "Warranty (years)": 5 },
      "pugh": { "Durability": 0, "Price (DKK)": 0, "Warranty (years)": 0 },
      "pairwise": { "Durability": { "opt-2": 5 } }
    }
  ],
  "notes": "Free-form markdown. Appears below the trade-off table in the export.",
  "decision": null
}
```

- `method` is one of `"weighted" | "pugh" | "pairwise"`.
- `decision` is filled by the user when they pick a winner; included in the export.

## Markdown Export Format

```markdown
# <title>

Last verified: <max(option.last_verified)>

Phase: <phase>  ·  Method: <method>

## Trade-off table

| Option | Price (DKK) | <criterion 2> | … | Score | Verdict |
|---|---|---|---|---|---|
| **<winner>** | … | … | … | <score> | ✅ pick |
| <runner-up> | … | … | … | <score> |  |
| … |

## Citations

- **<option name>** — [<retailer hostname>](<retailer_url>) — _"<excerpt>"_  (verified <last_verified>)
- …

## Notes

<notes block, verbatim>

## Decision

<decision block, or "Pending">
```

> Note: the `max()` over `option.last_verified` in the header is safe because export validation rejects any decision where any option is missing `last_verified` (returns 422). The renderer assumes all dates are present.

## Error Handling

- Server: validate input on every write. On error, return JSON `{error, details}` with appropriate 4xx status. Log to stderr, never crash on bad input.
- Client: surface server errors as inline messages near the offending field. Disable **Export** when validation fails and show what's missing.
- Files: write atomically (`fs.writeFile` to `<path>.tmp` then `fs.rename`) to avoid half-written JSON on crash.

## Testing

A single smoke test (`tools/decide/test.cjs`, run via `node --test`) covers:

1. Slug validation rejects path traversal.
2. Save → load round-trips a sample decision.
3. Export with missing required fields returns 422.
4. Export with valid data writes a markdown file matching the expected shape.
5. Weighted, Pugh, and Pairwise scoring functions return expected rankings on a fixture.

No client-side test framework. The scoring functions live in a separate module `public/scoring.js` so the smoke test can import them in Node.

## How to Run

```bash
cd tools/decide
npm start            # starts server on http://localhost:5173, opens browser
# Ctrl+C to stop
```

`npm test` runs the smoke test.

The full README in `tools/decide/README.md` will document this plus the data layout.

## Open Questions

None at design time. The implementation plan will surface any.
