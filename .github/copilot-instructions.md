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
5. **Keep it lean** — no files without purpose. No empty folders. No placeholder stubs.
6. **Cite sources for product / price / spec claims** — every recommendation that depends on external information (price, availability, specs, compatibility, vendor policy) must include a verifiable URL **and** a relevant excerpt from the page. No claims from training-data memory alone.
7. **MCP-first for GitHub** — when MCP write tools are available in the current session, use them for PRs, issues, branches. Fall back to `gh` CLI only when the MCP tool doesn't exist in the session.
8. **Docs stay current** — when an equipment choice changes, update the relevant decision doc.

## Advisory Standards (smart-home recommendations)

- **Brainstorm before recommending** — confirm scope, budget, ecosystem constraints, floor type, household specifics. Don't dump generic top-10 lists.
- **Cite Danish retailers** for prices (Pricerunner first, then Elgiganten / Power / Proshop / Komplett / Computersalg / Bilka / Coolshop). Quote URL + excerpt.
- **Trade-off tables, not prose paragraphs** — when comparing 2+ options, present a table with criteria → options → outcome → pick.
- **Matter-first**, then platform-native, then ecosystem-locked — in that preference order.
- **Phase-aware** — every recommendation says where it fits in the rollout (Phase 1: cleaning; Phase 2: lighting; etc.) and what foundational decisions it commits the user to.
- **Flag unverifiable claims** — if a price or spec couldn't be fetched, say so explicitly rather than guessing.
- **Always include `Last verified: YYYY-MM-DD`** on price-sensitive docs.

## Code & Doc Standards

- Markdown for all docs. ATX headers (`#`), fenced code blocks with language tags.
- Tables over bullet lists for comparisons.
- Minimal dependencies for any tooling (Node 22 stdlib first, pip stdlib first).
- Prefer ES modules (`import`/`export`); `const` by default; async/await over raw promises. No `var`. No `any` in TypeScript.
- Validate at boundaries (user input, external APIs). Trust internal code.

## MCP Context

The set of available MCP servers depends on the session (VS Code Copilot Chat vs. Copilot CLI vs. GitHub.com). Capabilities to use when present:

| Server                | Purpose                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `github`              | GitHub API — PRs, issues, file reads, search, branches                 |
| `sequential-thinking` | Structured reasoning for multi-step decisions and trade-off analysis   |
| `context7`            | Up-to-date library / framework docs                                    |
| `playwright`          | Browser automation for fact-checking external sources (NOT for GitHub) |

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

### MUST brainstorm before implementing
- New phases, equipment choices, or refactors require a design conversation first
- Ask clarifying questions. Explore alternatives. Present design in digestible chunks.
- Save the agreed design before writing any code or making the purchase recommendation
- Skip only for trivial fixes (typos, one-line changes, doc updates)

### MUST write implementation plans before coding
- Break work into small tasks (2–5 minutes each)
- Each task specifies: exact file paths, what to change, verification steps
- Present the plan for approval before starting implementation
- Skip only when the user explicitly says "just do it"

### MUST follow TDD for code changes
- **RED**: Write a failing test first
- **GREEN**: Write minimal code to make the test pass
- **REFACTOR**: Clean up while keeping tests green
- Never write production code before the test exists
- Skip only for non-code changes (docs, configs) or when no test framework exists

### MUST use subagents for multi-task work
- When a plan has 3+ implementation tasks, dispatch subagents per task
- Each subagent gets: the task spec, relevant context, and verification criteria
- Review subagent output before proceeding (spec compliance, then code quality)
- The orchestrating agent never writes code directly — it delegates and reviews

### MUST request code review after completing tasks
- Self-review against the plan before declaring done
- Report issues by severity (critical blocks progress, warnings don't)
- Verify all tests pass before finishing

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
