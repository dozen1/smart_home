# Spec — Stick-vacuum decision: wet+dry expansion

Last verified: 2026-05-05

Status: approved (awaiting user spec review before plan)

## Context

PR #13 ("PR-A") shipped schema/UI plumbing for `decision.apartment_m2` and `option.best_price_url` but explicitly deferred the research data to a "PR-B". This spec captures the design for the **first slice of PR-B** — adding wet+dry cordless sticks to the existing stick-vacuum decision and introducing a mopping-performance criterion. The two remaining slices (robot vac+mop scoring, `best_price_url` backfill) get their own specs.

The user owned a Bosch Unlimited 7 (PowerForAll 18V) that failed at 3 years; the brand+platform are the user-context anchor, but the wet+dry head turns the same architecture into a vac-and-mop tool that's directly relevant for an 80 m² (63.2 m² scored area) hard-floor home with no pets.

## Goal

Expand `docs/decisions/phase-1-stick-vacuum.md` so wet+dry cordless sticks compete head-to-head with the existing dry sticks under a single weighted score, with mopping performance scored as a first-class criterion.

## Non-goals

- Re-evaluating any existing dry-stick scores. Dry-stick rows are touched only to (a) add a `0` on the new mopping criterion and (b) quote runtime in minutes inside their citation excerpt.
- Backfilling `option.best_price_url` (handled in PR-B3).
- Robot vacuum/mop criterion scoring (handled in PR-B2).
- Schema-threading runtime as structured data (handled in the small follow-up PR-B1.5).
- Adding any new dry-stick options.
- Touching the decide tool's code (`tools/decide/**`). PR-B1 is data-and-prose only.

## Approved decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Single ranking, head-to-head.** Wet+dry units join the same trade-off table and weighted score as the dry sticks. | User pick over per-category sub-tables. Forces honest cross-category comparison. |
| 2 | **New criterion: "Mopping performance", weight 3 (medium).** Dry-stick options score `0`. | Mopping matters on hard floors but should not dominate suction/durability. Weight 3 keeps stretch picks from being decided by mopping alone. |
| 3 | **Wet+dry units share the existing "Suction on hard floor" criterion.** | Realistic head-to-head; avoids criterion-list bloat. Wet+dry's lower peak air-watts is reflected by its score on this criterion, not by isolating it in a parallel one. |
| 4 | **Stretch ceiling raised globally 3,500 → 4,500 DKK.** | Wet+dry units are category-priced higher. Existing dry sticks are all already ≤ 3,500 DKK so the bump effectively only opens space for wet+dry. The decision doc includes a note explaining the dual standard. |
| 5 | **Budget unchanged: 2,000 DKK.** | Anchor "what we'd spend without justification" to dry-stick reality. Stretch picks remain explicitly labelled. |
| 6 | **Research-first peer selection.** Only Bosch Unlimited 7 Aqua is forced into the shortlist. All other peers are determined by the open-category survey + hard gates below — *not* by a pre-locked brand list. | The earlier "Tineco / Dreame / Roidmi" suggestion was author bias. Brand-agnostic gates produce a fairer field. |
| 7 | **Runtime visibility — hybrid path.** PR-B1 quotes runtime (min @ standard / min @ max where available) in every option's citation excerpt and renames the criterion description so the rule is explicit. PR-B1.5 schema-threads runtime as structured data afterwards. | Lean PR-B1 isn't blocked by the schema work. Long-term, runtime becomes a first-class field. |
| 8 | **No code changes in PR-B1.** Data + markdown + criterion-rename only. | Keeps the PR small and review-able. |

## Research methodology (binding for PR-B1 execution)

### Stage 1 — Open-category survey

Enumerate every cordless wet+dry stick stocked in DK at ≤ 4,500 DKK, brand-agnostic. Sources to scan, in order:

- **Pricerunner DK** — category trees `Stoevsugere`, sub-filters: cordless + wet/vådsuger. Capture every SKU listed by ≥ 1 retailer.
- **versus.com** — `https://versus.com/en/vacuum-cleaner` head-to-head matrix and any wet-dry / cordless category pages; surface peers Pricerunner DK misses. **Mandatory per repo `copilot-instructions.md`.**
- **Vacuum Wars** + **RTINGS** — category roundups for wet+dry sticks 2024–2026; scrape brand+model names.
- **Reddit `r/VacuumCleaners`** — recent threads (last 12 months) with `wet dry` / `cordless mop` keywords for owner-mentioned units.

### Stage 2 — Hard gates

Drop any candidate that fails any of:

- Stocked at ≥ 1 DK retailer (Pricerunner DK price visible) **OR** verifiable EU vendor that ships to DK with shipping cost noted.
- Active SKU on the manufacturer's current consumer site (no `EP71AB14UG`-style EOL clearances).
- ≥ 1 independent long-term review or owner report (versus.com / Vacuum Wars / RTINGS / Reddit / Trustpilot DK).
- Documented spares pipeline: at minimum batteries + filter kit + brushroll/mop-roller, sourced from manufacturer DK store, official EU retailer, or large DK third-party.
- Within 4,500 DKK ceiling (or below if budget-only entry).

### Stage 3 — Mandatory inclusion

- **Bosch Unlimited 7 Aqua** is included regardless of how it scores on Stage 2 gates, because of the user-context anchor. If it fails a gate, document the failure inline rather than dropping it.

### Stage 4 — Shortlist size

Aim for **3–5 finalists** (excluding Bosch Aqua, so 4–6 wet+dry rows added in total). If Stage 2 yields more than 5, take the top by versus.com head-to-head wins + ownership-data quality. Less than 3 → flag the gap and proceed.

### Stage 5 — Per-finalist deep research

For every shortlisted unit, capture:

- Pricerunner DK price + retailer count + first-party shop URL.
- Manufacturer spec page URL (or flag "unverified — site bot-walled").
- **versus.com head-to-head URL + relevant excerpt** for at least one pairing per unit (preferably vs. Bosch Aqua and one other shortlisted peer). **Mandatory per repo rules.**
- Battery: type (click-in / screw-in / fixed), capacity (Wh or mAh @ V), runtime min @ standard, runtime min @ max, replacement battery DK price + part #.
- Motor / suction: airwatts on hard-floor head if disclosed; otherwise motor input wattage with explicit "input wattage, not airwatts" caveat.
- Mopping mechanism: pickup-vacuum vs. spray-and-wipe; clean+dirty water tank capacity in mL; self-cleaning cycle yes/no.
- Weight in kg; trigger style (squeeze-hold vs. toggle).
- Warranty length + registration upgrade rules.
- Repairability: iFixit device hub or guide URL if available.
- ≥ 1 long-term ownership data point (Reddit / Trustpilot DK / RTINGS user reviews) — quote excerpt.

### Stage 6 — versus.com pairing matrix (mandatory)

Open the head-to-head URL on versus.com for each pairing on the **finalist** list. Cite the URL + a relevant excerpt. If a pairing has no entry on versus.com, state that explicitly — do not silently skip.

## Data changes (PR-B1)

### `docs/decisions/data/phase-1-stick-vacuum.json`

- `stretch_ceiling_dkk`: `3500` → `4500`.
- `criteria[]`: append `{ "name": "Mopping performance", "weight": 3 }`.
- Existing `criteria[]` weights unchanged.
- Existing `criteria[]` "Runtime sufficient for 63.2 m²" — rename `name` to make the rule explicit, e.g. `"Runtime ≥ 45 min @ standard for 63.2 m²"` (final wording chosen during implementation).
- Existing `options[]` rows: each gets `0` on the new mopping criterion (key matches whatever the existing snake_case normalisation produces).
- `options[]`: append rows for Bosch Unlimited 7 Aqua + every Stage-5 finalist.
- Every existing option's `citation` text is amended (additive only) to quote runtime in minutes (e.g. `"… 40 min @ standard verified on listing …"`) sourced from manufacturer / Pricerunner / reviewer data. No score changes on dry-stick options.

### `docs/decisions/phase-1-stick-vacuum.md`

Auto-generated from the JSON via `tools/decide/export.js`. Manual sections preserved (`## Buyer's failure data`, `## Why Samsung sub-2k …`, `## Stretch options`, `## Avoid`, `## Hard verifications still needed before purchase`, `## Trigger-hold ergonomics`, `## Decision`). New manual sub-section appended:

- `## Wet+dry stick category — research notes` — captures the Stage 1 candidate pool, Stage 2 gate failures, versus.com pairing matrix summary, and any per-unit caveats not captured in citations.

The "Stretch options" section gets a new sub-heading distinguishing dry-stretch (≤ 3,500 DKK) from wet+dry-stretch (≤ 4,500 DKK).

The `Last verified:` header is updated to the PR-B1 verification date.

## Verification gates (per repo standards)

Each new option must satisfy, before merge:

1. Pricerunner DK URL + price quoted in citation (or fallback EU vendor + shipping note).
2. versus.com URL + excerpt cited for ≥ 1 pairing.
3. Runtime quoted in minutes inside the citation excerpt.
4. ≥ 1 long-term ownership data point quoted.
5. Spares pipeline documented (battery + at least one consumable).
6. `Last verified:` date is the PR-B1 date.

If any gate cannot be satisfied for a finalist (e.g. manufacturer site bot-walled), the option is flagged in-doc as `UNVERIFIED — <gap>` rather than silently dropped, and the gap is added to `## Hard verifications still needed before purchase`.

## Out of scope (deferred to follow-up PRs)

| PR | Scope |
|---|---|
| PR-B1.5 | Schema-thread runtime as structured data: `option.runtime_min_standard` + optional `option.runtime_min_max`, validation, UI editor field, markdown render that surfaces `(60 min @ std / 12 min @ max)` next to the score. Mirror PR #13's pattern. Tests added. |
| PR-B2 | Robot vac+mop scoring. Add `Vacuuming performance` + `Mopping performance` criteria to `phase-1-robot-vacuum-mop.json`, score every option with citations. |
| PR-B3 | Backfill `option.best_price_url` for the ~13 options across both decisions where a specific DK retailer URL is cheaper than the aggregator entry. |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| versus.com lacks entries for some niche peers | Spec mandates explicit "no entry on versus.com" note rather than silent skip; pairing matrix is best-effort, not all-pairs. |
| Manufacturer DK sites bot-wall research session (as happened with Samsung in the prior session) | Flag option as `UNVERIFIED — manufacturer page bot-walled` and add to "Hard verifications still needed before purchase" — option still ranks but the gap is visible. |
| Mopping-criterion weight of 3 tilts ranking too far away from durability-first priority | Spec captures the weight choice as a decision; PR-B1.5 / PR-B2 reviewers can revisit if scores look wrong after the data lands. |
| 4,500 DKK stretch ceiling could quietly let in dry sticks that should still be 3,500-capped | Spec is explicit: no new dry-stick options. Reviewer to enforce. |
| Brand bias re-creeping into shortlist | Stage 1 is brand-agnostic by construction; Stage 2 gates are mechanical; Bosch Aqua is the *only* forced inclusion. |

## Acceptance criteria

PR-B1 is mergeable when:

- `phase-1-stick-vacuum.json` reflects all data changes above with valid schema.
- The trade-off table in `phase-1-stick-vacuum.md` includes Bosch Aqua + Stage-5 finalists, all rows scoring on the new mopping criterion.
- Every new and existing option has runtime quoted in its citation excerpt.
- versus.com pairing matrix is documented in the new "Wet+dry stick category — research notes" section, with URLs + excerpts.
- All 6 verification gates above are satisfied for every new option (or `UNVERIFIED` flag + gap entry where unsatisfiable).
- `Last verified:` date updated.
- No `tools/decide/**` files touched.
- Conventional-commit message: `docs(decisions): add wet+dry stick category + mopping criterion to phase-1-stick-vacuum`.
