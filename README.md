# Smart Home

> GitHub: [`dozen1/smart_home`](https://github.com/dozen1/smart_home)

Personal smart home build-out. Research notes, equipment decisions, phased rollout plans, and automation configs.

## Context

| Aspect    | Value                                                                  |
| --------- | ---------------------------------------------------------------------- |
| Home      | 80 m², single floor, laminate / wood-panel floors, no pets             |
| Location  | Denmark — prices in DKK                                                |
| Strategy  | Incremental — Phase 1 cleaning (robot vacuum + mop), evolve over time  |
| Ecosystem | Matter-first, no committed hub yet                                     |

## Phases

1. **Cleaning** — robot vacuum + mop (in progress)
2. **Lighting** — TBD
3. **Climate** — TBD
4. **Security** — TBD
5. **Multi-room media** — TBD

Each phase will get a dedicated plan in `docs/phases/` once scoped.

## Repo Structure

```
.github/copilot-instructions.md   # agent conventions (auto-loaded by Copilot)
AGENTS.md                         # cross-tool agent entry point
docs/                             # decisions and phased rollout plans
README.md
```

## Conventions

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for the full conventions, MCP usage rules, advisory standards, and workflow.
