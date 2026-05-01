# Phase Roadmap

All phases build on one another in a single repo, single database, single deployment.

---

## Phase 1 — Foundation

**Status: Complete**
**Spec:** `docs/superpowers/specs/2026-04-28-influenceflow-phase-1-design.md`
**Plan:** `docs/superpowers/plans/2026-04-28-influenceflow-phase-1.md`

### What ships

- Self-hosted Docker Compose deployment (app + Postgres)
- Email/password authentication via Auth.js v5 + Argon2id
- Three roles: `owner`, `admin`, `member`
- Contact model with all personalization fields
- Excel import (fixed template, up to 5000 rows per upload)
- Workspace-wide deduplication with 4-bucket import report
- `agent_active` flag per contact with cross-user conflict detection (SELECT FOR UPDATE)
- Workspace audit log (admin/owner only)
- Team management: invite by link, role change, deactivation (soft delete)

### What Phase 1 does NOT include

No email sending, no LLM, no inbox polling, no buckets, no briefs. Pure data foundation.

---

## Phase 2 — Outbound Email Engine

**Status: In progress (M1.1 in progress)**
**Design decisions:** `docs/product/PHASE_2_PRODUCT_DECISIONS.md`
**Spec:** `docs/superpowers/specs/2026-04-30-influenceflow-phase-2-design.md`
**Plan:** `docs/superpowers/plans/2026-04-30-influenceflow-phase-2.md`

**Execution model:** All implementation must follow strict subagent-driven pipeline:

`implementer → spec-reviewer → code-reviewer → fixes → tests → commit`

No task is considered complete without passing all stages.

### What ships

- **Brief model** — campaign configuration (product, price, message guidelines) that drives the LLM
- **Contact buckets** — state machine tracking where each outreach stands
- **LLM-generated first emails** — Claude drafts the first message per contact/brief
- **Review queue** — human reviews and approves (or edits + AI-refines) each draft before sending
- **Bulk send** — approved emails dispatched via BullMQ worker + Redis
- **Per-member SMTP** — each team member sends from their own email address
- **Rate limiting** — configurable cap per workspace (default 50 emails/day/member)
- **Tracking pixel** — optional open tracking (workspace-level toggle)
- **Calibration** — LLM uses a sample of approved edits to tune generation style

### Infrastructure added in Phase 2

- Redis (BullMQ backend)
- `apps/worker/` — Node.js worker process (alongside existing `apps/web/`)
- `docker-compose.yml` gains `redis` and `worker` services

### Contact buckets (Phase 2)

```
cold → [LLM generates + human approves + worker sends] → first_sent
first_sent → [reply received] → replied
replied → [price mentioned] → quoted_price
quoted_price → [agreed] → agreed
quoted_price → [rejected] → rejected
any → no_reply_email  (email hard-bounced or unreachable)
any → no_reply        (no response within window)
any → archived        (manual, member-accessible; admin/owner can move to any bucket)
```

Import creates contacts in `cold`. Successful first email send moves to `first_sent`.

---

## Phase 3 — Inbox Polling

**Status: Future**

- Poll member SMTP inboxes for replies
- Match replies to contacts
- Response classification (replied with interest / quoted / rejected / no-reply)
- Conversation view per contact

---

## Phase 4 — Closed-Loop Agent

**Status: Future**

- Autonomous negotiation replies
- Escalation policy (agent escalates to human when it hits uncertainty threshold)
- Negotiation history per contact

---

## Phase 5 — Profile Intelligence

**Status: Future**

- Scrape public blogger profiles for style and topic signals
- Feed signals into LLM prompt for personalized outreach
- Niche auto-detection

---

## Phase 6 — Instagram DM

**Status: Future (high risk, optional)**

- Instagram DM channel as an alternative to email
- Requires Instagram API access or unofficial automation (legal/ToS risk)
- Only considered if Phase 2–4 email path proves insufficient
