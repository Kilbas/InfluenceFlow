# Session Handoff

**Last updated:** 2026-05-01

This file is updated at the end of every session. It is the single source of truth for "where are we right now."

---

## Current Branch

`claude/review-docs-specs-2PRzE`

---

## Phase 1 Status: Complete

Phase 1 (Foundation) is fully implemented. The codebase has:

- Next.js 15 App Router application at `apps/web/`
- PostgreSQL schema via Prisma (workspaces, users, contacts, invitations, import_batches, audit_events, auth_sessions)
- Auth.js v5 with Credentials provider + Argon2id passwords
- Role-based access control (owner / admin / member)
- Excel import with deduplication and 4-bucket report
- Agent-flag toggle with cross-user conflict detection (SELECT FOR UPDATE)
- Audit log (append-only, admin/owner visibility)
- Docker Compose production deployment (app + db)
- CI: GitHub Actions (lint, typecheck, unit tests, e2e tests)

Spec: `docs/superpowers/specs/2026-04-28-influenceflow-phase-1-design.md`
Plan: `docs/superpowers/plans/2026-04-28-influenceflow-phase-1.md`

---

## Phase 2 Status: In Progress — M1.1 Complete

Phase 2 (Bulk email engine) is fully designed and implementation has begun.

**M1 — Schema & Shared Libraries**
| Task | Status |
|---|---|
| M1.1 — Prisma schema, migration, env scaffolding | **Complete** (commit `5306fb5`) |
| M1.2 — Shared libs (encryption, llm, search, email-render) | Not started |

Spec: `docs/superpowers/specs/2026-04-30-influenceflow-phase-2-design.md`
Plan: `docs/superpowers/plans/2026-04-30-influenceflow-phase-2.md`

---

## What Was Done in the Last Session (2026-05-01)

**M1.1 — Prisma schema, migration, env scaffolding** (commit `5306fb5`):

- Updated `apps/web/prisma/schema.prisma` with all Phase 2 additions:
  - `Bucket`, `ToneOfVoice`, `SentEmailStatus` enums
  - `Contact.bucket` field (`@default(cold)`) + `@@index([workspaceId, bucket])`
  - `User.approvedLettersCount`, `User.forcePreviewMode`
  - New models: `Brief`, `MemberSmtp`, `WebContext`, `SentEmail`, `EmailOpenEvent`, `WorkspaceSettings`
  - All relations, field maps, and indexes exactly per spec §5.2
- Created Prisma-generated migration `apps/web/prisma/migrations/20260501000000_phase_2_init/migration.sql`
- Created `apps/web/src/lib/audit-actions.ts` — typed constants for all Phase 1 + Phase 2 audit actions (§5.3)
- Updated `.env.example` with `REDIS_URL`, `ANTHROPIC_API_KEY`, `BRAVE_SEARCH_API_KEY`, `ENCRYPTION_KEY` (with rotation warning)
- `pnpm prisma validate`, `pnpm prisma generate`, `pnpm typecheck` all pass
- Unit test baseline unchanged: 18 tests pass; 6 suites fail at import (pre-existing DB-dependency, no DB in CI env)

**Schema note:** `SentEmail.bodyText`/`bodyHtml` use `@map("body_text")`/`@map("body_html")` — spec was inconsistent here (omitted @map) but snake_case is the project convention and the correct Prisma behavior.

---

## Current Execution State

- **Phase:** Phase 2
- **Milestone:** M1
- **Task:** M1.1

| Step | Status |
|---|---|
| Implementer | done |
| Spec-reviewer | passed |
| Code-reviewer | pending |
| Fixes | pending |
| Commit | pending |

## What Should Be Done Next

**M1.2 — Shared libs** (next task in M1):
- `apps/web/src/lib/encryption.ts` — AES-256-GCM, IV-prefixed, base64 output
- `apps/web/src/lib/llm.ts` — Anthropic client wrapper with `generateJson()`
- `apps/web/src/lib/search.ts` — Brave Search wrapper
- `apps/web/src/lib/email-render.ts` — react-email HTML renderer with tracking pixel
- `validateLetterOutput()` helper for §6.5 rules
- All unit-tested in isolation (mock fetch/SDK, no DB)

After M1.2, M2 (Briefs) and M3 (SMTP/Profile/Settings) can run in parallel, per plan execution order.

---

## Known Issues / Gotchas

- Phase 2 design decisions are finalized (see `docs/product/PHASE_2_PRODUCT_DECISIONS.md`) — do not redesign without explicit user approval.
- The `apps/web/` layout anticipates `apps/worker/` in Phase 2 but no monorepo tooling is added yet.
- Contact bucket transitions have strict rules (see `docs/product/PHASE_2_PRODUCT_DECISIONS.md`) — the import flow, the send worker, and the UI all need to respect them.
- `ENCRYPTION_KEY` env var: must be set before any SMTP config is saved. Rotation makes stored passwords undecryptable — document this clearly in ops runbook.
- 6 unit test suites require a live PostgreSQL DB to import; they fail in environments without DATABASE_URL. This is pre-existing Phase 1 behavior, not a Phase 2 regression.
