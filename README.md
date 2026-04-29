# InfluenceFlow

Self-hosted single-tenant CRM for blogger outreach with an autonomous LLM agent (agent ships in later phases — Phase 1 is the data foundation).

## Phase 1 features

- Excel-based contact import with workspace-wide deduplication
- Per-user private contact lists (members) + admin/owner full visibility
- Invitation links for team onboarding
- "Agent active" flag with cross-user conflict detection
- Audit log for accountability

## Quick start (production)

1. Copy `.env.example` to `.env` and fill in:
   - `DB_PASSWORD` — Postgres password
   - `AUTH_SECRET` — generate with `openssl rand -hex 32`
   - `AUTH_URL` — public URL of the app (e.g. `https://crm.example.com`)
   - `ADMIN_INIT_EMAIL` — owner email
   - `WORKSPACE_NAME` — your company name

2. Boot:
   ```bash
   docker compose up -d
   ```

3. Watch the app logs for the temporary owner password:
   ```bash
   docker compose logs app
   ```

4. Sign in at the configured URL with `ADMIN_INIT_EMAIL` and the temp password.

## Development

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres only
cp .env.example apps/web/.env
cd apps/web
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

Tests:

```bash
pnpm test           # Vitest unit
pnpm test:e2e       # Playwright (boots dev server)
```

## Reverse proxy / TLS

Out of scope for this image. Recommended: front it with [Caddy](https://caddyserver.com/) or nginx for HTTPS.

## Spec & plans

- Spec: `docs/superpowers/specs/2026-04-28-influenceflow-phase-1-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-28-influenceflow-phase-1.md`
