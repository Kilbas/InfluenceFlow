# START HERE — New Session Orientation

**Read this first. It takes 2 minutes and replaces 30 minutes of codebase spelunking.**

---

## What is InfluenceFlow?

Self-hosted, single-tenant CRM for blogger outreach. A marketing team uses it to manage contacts (bloggers), send outreach emails, and eventually run an autonomous LLM negotiation agent. One Docker Compose command deploys it.

Single repo, single database, one deployment — phases stack on top of each other.

---

## Current Status

| Phase | Status |
|---|---|
| Phase 1 — Foundation (contacts, import, auth, team, audit log) | **Complete** |
| Phase 2 — Bulk email engine (briefs, outbound SMTP, LLM first emails, review queue, buckets) | **Planned, not started** |
| Phase 3+ | Future |

---

## Key Documents

| Document | Purpose |
|---|---|
| `docs/ai/TASK_RUNBOOK.md` | How to pick up a task and work on it |
| `docs/ai/SESSION_HANDOFF.md` | What the last session did; what's next |
| `docs/product/PRODUCT_VISION.md` | Full product vision and goals |
| `docs/product/PHASES.md` | Per-phase scope and status |
| `docs/product/PHASE_2_PRODUCT_DECISIONS.md` | All Phase 2 design decisions (read before implementing) |
| `docs/superpowers/specs/2026-04-28-influenceflow-phase-1-design.md` | Full Phase 1 spec (authoritative) |

---

## Codebase at a Glance

```
apps/web/                  # Next.js 15 App Router — the only app right now
  prisma/schema.prisma     # Single Prisma schema
  src/app/                 # Pages and API routes
  src/lib/                 # Pure utilities (db, auth, audit, excel, logger)
  src/server/              # Business logic server actions
  tests/                   # Vitest (unit) + Playwright (e2e)
docs/
  ai/                      # Session orientation docs (this folder)
  product/                 # Product vision and phase docs
  superpowers/specs/       # Detailed design specs per phase
  superpowers/plans/       # Step-by-step implementation plans
docker-compose.yml         # Production: app + db
docker-compose.dev.yml     # Dev: db only
```

---

## Tech Stack (one-liner per concern)

- **Language:** TypeScript (strict)
- **Framework:** Next.js 15 App Router — UI + API in one process
- **UI:** React 19 + Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL 16 via Prisma ORM
- **Auth:** Auth.js v5, Credentials provider, Argon2id passwords
- **Validation:** Zod
- **Logging:** Pino (structured JSON)
- **Tests:** Vitest (unit) + Playwright (e2e)
- **CI:** GitHub Actions
- **Phase 2 additions:** Redis, BullMQ, worker process (`apps/worker/`)

---

## Roles (quick reference)

| Role | Sees | Can do |
|---|---|---|
| `owner` | Everything | All admin powers; cannot be deleted or demoted |
| `admin` | Everything | Full CRUD across workspace; manages team |
| `member` | Own contacts only | Import, edit, toggle agent flag on own contacts |

---

## Development Quick Start

```bash
docker compose -f docker-compose.dev.yml up -d   # Start Postgres
cp .env.example apps/web/.env                    # Fill in secrets
cd apps/web
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed                              # Creates workspace + owner
pnpm dev                                         # http://localhost:3000
```

Tests:
```bash
pnpm test        # Vitest unit tests
pnpm test:e2e    # Playwright e2e (starts dev server automatically)
```

---

## Before You Write Any Code

1. Read `docs/ai/SESSION_HANDOFF.md` to know what the previous session left off.
2. If working on Phase 2, read `docs/product/PHASE_2_PRODUCT_DECISIONS.md` — all key decisions are already made.
3. Check the git log: `git log --oneline -20`
4. Run `pnpm test` to confirm the baseline is green.
