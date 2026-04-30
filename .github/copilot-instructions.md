# Smart Home — Copilot Instructions

> GitHub repo: `dozen1/smart_home`
> https://github.com/dozen1/smart_home

Personal smart home build-out. This repo holds research notes, equipment decisions, phased rollout plans, and automation configs — no proprietary firmware or vendor code.

---

## Domain Context

| Aspect             | Value                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Location           | Denmark — prices in **DKK**                                                                    |
| Home               | 80 m², single floor, laminate / wood-panel floors, no pets                                     |
| Strategy           | Incremental — start with cleaning (robot vacuum + mop), evolve over time                       |
| Ecosystem          | Not yet committed — recommendations must preserve future flexibility                           |
| Preferred standard | **Matter-first** wherever possible (works with Apple Home, Google Home, Alexa, Home Assistant) |

Default Danish retailers to cite for prices and stock: **Pricerunner, Elgiganten, Power, Proshop, Komplett, Computersalg, Bilka, Coolshop**.

## Repo Layout

```
.github/
  copilot-instructions.md     # this file
AGENTS.md                     # cross-tool agent entry point (mirrors this file's intent)
docs/
  decisions/                  # ADR-style equipment decisions w/ cited sources
  phases/                     # phased rollout plans (cleaning, lighting, climate, security, …)
README.md
```

## Rules

1. **No secrets in repo** — no API tokens, Wi-Fi passwords, device keys. Ever.
2. **Conventional commits** — `feat:`, `fix:`, `docs:`, `chore:` prefixes.
3. **Branch per change** — branch off `main`, PR to merge.
4. **Never merge PRs** — only the repo owner merges. Copilot creates PRs and stops.
5. **Keep it lean** — no files without purpose. Create folders only when first content is added.
6. **Cite sources for product / price / spec claims** — every recommendation that depends on external information (price, availability, specs, compatibility, vendor policy) must include a verifiable URL **and** a relevant excerpt from the page. No claims from training-data memory alone.
7. **MCP-first for GitHub** — when MCP tools for creating / updating PRs, issues, or branches are available in the current session, use them. Fall back to `gh` CLI only when the equivalent MCP tool doesn't exist. Never merge PRs via any method — only the owner merges.
8. **Docs stay current** — when an equipment choice changes, update the relevant decision doc.

## Advisory Standards (smart-home recommendations)

- **User-aligned advice only** — recommendations serve the user's economic and convenience interests exclusively. No vendor, platform, or popularity bias. When two options are functionally equivalent, recommend the cheaper / more convenient one, not the better-known one. When the cheaper option has a real downside, quantify it. Disclose trade-offs honestly, including against personally-preferred brands. No sponsored, affiliate, or "received-wisdom" recommendations.
- **Brainstorm before recommending** — confirm scope, budget, ecosystem constraints, floor type, household specifics. Don't dump generic top-10 lists.
- **Cite Danish retailers** for prices (Pricerunner first, then Elgiganten / Power / Proshop / Komplett / Computersalg / Bilka / Coolshop). Quote URL + excerpt. **Fallback**: if not available in Denmark, cite the official vendor store or a primary EU retailer that ships to DK, note the import / shipping cost, and flag that it is not locally stocked.
- **MUST consult versus.com for every product shortlist** — before finalizing a comparison of 2+ products in any category (vacuums, headphones, phones, monitors, appliances, etc.), open the head-to-head URL on [versus.com](https://versus.com) for each pairing on the shortlist. Cite the comparison URL + a relevant excerpt in the decision doc. If versus.com has no entry for a product, state that explicitly — do not silently skip. Use it alongside (not instead of) category-specific reviewers (Vacuum Wars for vacuums, RTINGS for displays, etc.) to validate manufacturer claims and surface spec differences that aren't obvious from datasheets alone.
- **Trade-off tables, not prose paragraphs** — when comparing 2+ options, present a table with criteria → options → outcome → pick.
- **Matter-first**, then platform-native, then ecosystem-locked — in that preference order.
- **Phase-aware** — every recommendation says where it fits in the rollout (Phase 1: cleaning; Phase 2: lighting; etc.) and what foundational decisions it commits the user to.
- **Flag unverifiable claims** — if a price or spec couldn't be fetched, say so explicitly rather than guessing.
- **Always include `Last verified: YYYY-MM-DD`** — at the top of the doc for document-wide verification, or inline per-product / per-row when partial updates occur. When in doubt, timestamp the entire doc and re-verify all claims on update.

### Smart Home Specific Concerns

- **Privacy first** — flag any device with mandatory cloud processing, telemetry, or vendor data collection. Prefer local-only or local-first devices (Matter-over-Thread, ESPHome, Zigbee2MQTT) over cloud-bound ones.
- **Vendor lock-in** — warn when a choice commits the user to a single ecosystem (e.g., Hue bridge ⇒ Philips lighting; Aqara hub ⇒ Aqara sensors). Matter / Thread devices preserve flexibility.
- **Firmware update policy** — check the vendor's update track record. Flag devices with no update mechanism, abandoned product lines, or known EOL dates.
- **Network segmentation** — recommend an IoT VLAN / guest Wi-Fi for untrusted devices when the user's router supports it. Document which devices can be safely isolated and which need access to the main network.
- **GDPR and data residency** — if the device or its app stores personal data, prefer EU-hosted services or local processing. Note the data controller for any cloud service.

## Code & Doc Standards

- Markdown for all docs. ATX headers (`#`), fenced code blocks with language tags.
- Tables over bullet lists for comparisons.
- Minimal dependencies for any tooling (Node 22 stdlib first, pip stdlib first).
- Prefer ES modules (`import`/`export`); `const` by default; async/await over raw promises. No `var`. No `any` in TypeScript.
- Validate at boundaries (user input, external APIs). Trust internal code.

## MCP Context

The set of available MCP servers depends on the session (VS Code Copilot Chat vs. Copilot CLI vs. GitHub.com). Capabilities to use when present:

| Server                | Purpose                                                                | Source                                      |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| `github`              | GitHub API — PRs, issues, file reads, search, branches                 | Bundled with Copilot CLI (auto-loaded)      |
| `sequential-thinking` | Structured reasoning for multi-step decisions and trade-off analysis   | User-level (registered via `copilot mcp`)   |
| `context7`            | Up-to-date library / framework docs                                    | User-level (registered via `copilot mcp`)   |
| `playwright`          | Browser automation for fact-checking external sources (NOT for GitHub) | User-level (registered via `copilot mcp`)   |

### Copilot CLI — registering the user-level MCPs

The non-bundled servers above are registered once at User scope via `copilot mcp add` so they apply across every project, not just this repo. Re-run these on a new machine:

```bash
copilot mcp add playwright           -- npx -y @playwright/mcp@latest
copilot mcp add sequential-thinking  -- npx -y @modelcontextprotocol/server-sequential-thinking
copilot mcp add context7             -- npx -y @upstash/context7-mcp
```

Verify with `copilot mcp list` (or `/env` inside an interactive session). User-scope config lives at `~/.copilot/mcp-config.json`. **Node 22 must be on PATH when Copilot CLI launches** — if your shell uses nvm, ensure Node 22 is auto-activated, otherwise `npx` falls back to the system Node and the servers fail to start.

For VS Code Copilot Chat or other editors, register the same three servers through that tool's MCP UI — the commands are identical.

### MUST use Sequential Thinking for
- Multi-step planning before implementation (new features, automations, refactors)
- Breaking down ambiguous or complex requests into concrete steps
- Evaluating trade-offs when multiple approaches exist
- Debugging when root cause isn't immediately obvious
- Any task requiring 3+ sequential decisions

### MUST use Playwright for
- **Fact-checking before recommending** — pricing, stock, specs, vendor policies. Navigate to authoritative sources and verify before presenting. **Not for GitHub** — use GitHub MCP for any GitHub research.
- **Citing reliable sources** — include the URL and a relevant excerpt from the page.
- **Market research and trend validation** — read real pages rather than relying on training data.

### MUST use Context7 for
- Looking up library / framework documentation before writing code
- Resolving API usage questions for any third-party package
- Getting version-specific examples

### MUST use GitHub MCP for
- Creating, listing, reading pull requests (NEVER merging — only the user merges)
- Creating, listing, commenting on issues
- Reading remote file contents
- Searching code, commits, issues, PRs on GitHub
- Creating branches on remote
- Checking PR status before / after merge

### MUST use terminal `git` for
- `add`, `commit`, `checkout`, `status`, `diff`, `log`
- `push`, `pull`, `fetch`, `rebase`, `merge`, `stash`
- Anything that touches the local working tree

### Violations (NEVER do these)
- Merging PRs via any method (MCP, `gh`, terminal) — only the user merges
- Using `gh pr create` when `mcp_github_create_pull_request` exists in the session
- Using `gh issue` when MCP issue tools exist in the session
- Reading remote files via `curl` / `gh api` when MCP can fetch them
- Using Playwright to browse GitHub when MCP search / read tools exist
- Checking PR / issue status via terminal when MCP can query it

**Default target**: owner `dozen1`, repo `smart_home` — unless told otherwise.

## Workflow (Mandatory)

These workflow steps are **not optional**. They apply to every feature, automation, or non-trivial change — in both VS Code Copilot Chat and Copilot CLI.

### MUST brainstorm before implementing (except trivial fixes)
- New phases, equipment choices, or refactors require a design conversation first
- Ask clarifying questions. Explore alternatives. Present design in digestible chunks.
- Save the agreed design before writing any code or making the purchase recommendation

### MUST write implementation plans before coding (unless user says "just do it")
- Break work into small tasks (2–5 minutes each)
- Each task specifies: exact file paths, what to change, verification steps
- Present the plan for approval before starting implementation

### MUST follow TDD for automation code (when applicable)
- Applies when writing automation scripts, Home Assistant configs with logic, or any programmatic behavior
- **RED**: Write a failing test first
- **GREEN**: Write minimal code to make the test pass
- **REFACTOR**: Clean up while keeping tests green
- Never write production code before the test exists
- Not applicable to research docs, equipment decision logs, or prose content

### MUST use sub-agents for multi-task or multi-thread work
- **Trigger**: any plan with ≥ 5 implementation tasks, OR ≥ 2 independent research threads that benefit from parallelism (e.g., comparing 3 product brands → 3 sub-agents in parallel, one per brand). Below the threshold, work inline.
- **Default to parallel** — dispatch sub-agents simultaneously via the `task` tool with `mode: "background"` whenever the work has no inter-task dependencies.
- **Announce dispatch** — state which sub-agents are being launched and what each one is researching or implementing, before launching.
- **Use specialized agents** when one matches the task (e.g., `Code Reviewer`, `Tracking & Measurement Specialist`, `Backend Architect`); fall back to `general-purpose` only when no specialist fits.
- Each sub-agent gets: the task spec, relevant context, and verification criteria.
- Review sub-agent output before proceeding (spec compliance first, then quality).
- The orchestrator never writes implementation code directly when sub-agents are in play — it delegates, reviews, integrates.

### MUST request code review after completing tasks
- Self-review against the plan before declaring done
- Report issues by severity (critical blocks progress, warnings don't)
- Verify all tests pass before finishing

### PR Review Format (when invoked as code reviewer)

When dispatching the `code-review` sub-agent (or reviewing as the orchestrator), reviews must be:

- **Concise**: each finding is `<severity>: <one-line problem>` followed by `file:line` and a paste-ready fix.
- **Severity-graded**: CRITICAL (blocks merge) / HIGH (should fix before merge) / MEDIUM (fix soon) / LOW (polish, optional).
- **Suggestion-block-friendly**: where the fix is a short replacement, render it as a GitHub suggestion code block so the author can one-click apply.
- **Signal-only**: never comment on style, formatting, or trivia. Only surface issues that genuinely matter (correctness, contradictions, security, missing rationale, drift risk).
- **Verdict-terminated**: end with one line — APPROVE / APPROVE WITH NITS / REQUEST CHANGES.
- **Posted to the PR** as a comment (since GitHub disallows formal self-review on own PRs) for traceability — not just delivered inline in chat.

### Workflow Violations (NEVER do these)
- Jumping straight to code without brainstorming on new features
- Writing code without a plan for multi-step work
- Writing production code before tests
- Declaring "done" without running verification steps
- Skipping code review on any PR-bound change

## How to Help

- **Default to action** — implement, don't just suggest, when intent is clear.
- **Read before editing** — understand existing code / docs before changing anything.
- **Minimal diffs** — change only what's needed. Don't refactor surroundings.
- **No boilerplate bloat** — skip unnecessary comments, docstrings, or type annotations on unchanged code.
- **Ask only when ambiguous** — if intent is clear, proceed.
