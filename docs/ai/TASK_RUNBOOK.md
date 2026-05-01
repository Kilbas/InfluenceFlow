# Task Runbook — How to Work on InfluenceFlow

This document is for any Claude Code session picking up work on this project.

---

## Orientation Checklist (do this before touching code)

- [ ] Read `docs/ai/START_HERE.md` (project overview, stack, quick start)
- [ ] Read `docs/ai/SESSION_HANDOFF.md` (what was done last; what's next)
- [ ] Run `git log --oneline -20` to see recent commits
- [ ] Run `pnpm test` from `apps/web/` — all tests must be green before you start

---

## Branch Convention

All work goes on the feature branch specified by the session. The current designated branch is `claude/install-superpowers-plugin-XIYZI`. Never push to `main` directly.

```bash
git checkout claude/install-superpowers-plugin-XIYZI
git pull origin claude/install-superpowers-plugin-XIYZI
```

---

## How to Pick Up a Task

1. Find the implementation plan for the phase you are working on:
   - Phase 1: `docs/superpowers/plans/2026-04-28-influenceflow-phase-1.md`
   - Phase 2: `docs/superpowers/plans/2026-04-30-influenceflow-phase-2.md` *(to be created when Phase 2 starts)*
2. Look for unchecked `- [ ]` items — those are incomplete tasks.
3. Read the corresponding spec for the phase before implementing:
   - Phase 1 spec: `docs/superpowers/specs/2026-04-28-influenceflow-phase-1-design.md`
   - Phase 2 decisions: `docs/product/PHASE_2_PRODUCT_DECISIONS.md`
4. Implement one task at a time; commit after each task.

---

## Commit Convention

```
<type>: <short description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`

Example:
```
feat: add bulk send queue with BullMQ

Implements the worker job for Phase 2 outbound email dispatch.
Rate-limited to workspace-configured cap (default 50/day/member).
```

---

## Code Conventions

- **All business logic** lives in `apps/web/src/server/` as server actions.
- **Pure utilities** (no DB, no session) live in `apps/web/src/lib/`.
- **Pages and API routes** call server actions — no business logic in components.
- **Zod** for all input validation at boundaries (API routes, server actions).
- **Pino** for logging (`import { logger } from '@/lib/logger'`).
- **Every mutation** writes an audit event in the same transaction.
- **No comments** unless the WHY is non-obvious. No doc-comment blocks.
- TypeScript strict mode — no `any`, no `// @ts-ignore`.

---

## Testing Convention

- Unit tests (`tests/unit/`) cover pure lib functions and server logic in isolation.
- E2E tests (`tests/e2e/`) cover critical user flows end-to-end via Playwright.
- Test order: RED → GREEN → COMMIT for each behavior.
- Never skip tests to make CI green — fix the underlying issue.

---

## Adding a New Phase

When starting a new phase:

1. Create the spec: `docs/superpowers/specs/YYYY-MM-DD-influenceflow-phase-N-design.md`
2. Create the plan: `docs/superpowers/plans/YYYY-MM-DD-influenceflow-phase-N.md`
3. Update `docs/product/PHASES.md` — change the phase status.
4. Update `docs/ai/SESSION_HANDOFF.md` with current state.
5. Update `README.md` if the deployment model changes.

---

## Infrastructure Changes (Phase 2+)

Phase 2 adds `apps/worker/` and requires Redis. When adding the worker:

- Add `apps/worker/` alongside `apps/web/` (same repo, no monorepo tooling yet).
- Add `redis` and `worker` services to `docker-compose.yml`.
- Shared BullMQ queue definitions go in a `packages/queues/` package if needed, otherwise inline in worker.

---

## Pushing Work

```bash
git push -u origin claude/install-superpowers-plugin-XIYZI
```

If the push fails due to network error, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s). Do NOT force-push unless explicitly instructed.

---

## When You're Done with a Session

Update `docs/ai/SESSION_HANDOFF.md`:
- What you completed (with commit SHAs if helpful).
- What is in progress or blocked.
- What should be done next.
- Any gotchas or decisions made during the session.
