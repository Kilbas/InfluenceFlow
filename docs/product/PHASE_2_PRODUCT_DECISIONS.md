# Phase 2 Product Decisions

All decisions in this document are **final and approved**. Do not redesign without explicit instruction from the product owner.

---

## Overview

Phase 2 adds the outbound email engine on top of the Phase 1 foundation. Key additions: brief model, contact bucket state machine, LLM-generated first emails, human review queue, bulk send worker, per-member SMTP, rate limiting, tracking pixel, and calibration.

---

## Contact Buckets

### Bucket List

| Bucket | Meaning |
|---|---|
| `cold` | Not yet contacted. Starting state for all imported contacts. |
| `first_sent` | First outreach email has been delivered. |
| `replied` | Contact has replied. |
| `quoted_price` | Contact mentioned a price in their reply. |
| `agreed` | Deal agreed. |
| `rejected` | Contact declined. |
| `no_reply_email` | Email address is unreachable (hard bounce or permanent delivery failure). |
| `no_reply` | Contact was sent a first email but never replied within the follow-up window. |
| `archived` | Manually archived. No further automation. |

### Bucket Transition Rules

- **Import** creates contacts in `cold`.
- **Successful first email send** (worker confirms delivery) moves contact to `first_sent`. This is automatic, not manual.
- **Member** can manually move a contact only to `archived`.
- **Admin / Owner** can manually move a contact to any bucket.
- All other bucket transitions (replied, quoted_price, agreed, rejected, no_reply_email, no_reply) are set by the system in Phase 3+. In Phase 2, they can be set manually by admin/owner.

---

## LLM Email Generation

### Model

Use Claude (latest capable model available). Prompt includes the brief (product description, guidelines, tone) and the contact's personalization fields (niche, language, country, followers_count, notes).

### Error Handling

- On generation failure: retry **3 times with exponential backoff**.
- After 3 failed retries: mark the job as `generation_failed`. Do not retry further. Surface the failure in the review queue so the user can regenerate manually.

### Calibration

- Calibration learns from a member's approved edits to their review queue drafts.
- **Calibration threshold: 100** approved+edited emails before calibration activates.
- Below 100: LLM uses only the brief + contact fields.
- At or above 100: LLM also receives a sample of the member's past edits as style examples.
- Calibration is per-member (each member's editing style is learned separately).

---

## Review Queue

### Purpose

Every LLM-generated draft must pass through the review queue before sending. A human must explicitly approve each email. No draft is sent automatically.

### Review Queue Actions

- **Approve** — email is queued for sending as-is.
- **Edit + Approve** — member edits the draft inline, then approves. The edited version is sent.
- **Reject** — draft is discarded. Contact stays in `cold`. Member can trigger regeneration.
- **Inline AI Refinement** — while in edit mode, member can ask the AI to refine the draft (e.g., "make it shorter", "add a joke"). The AI updates the draft inline. Member can then approve or continue editing.

---

## Bulk Send

### Worker Architecture

- BullMQ + Redis for job queue.
- Separate `apps/worker/` process (Node.js, runs alongside `apps/web/`).
- `docker-compose.yml` adds `redis` and `worker` services.

### Rate Limiting

- **Default: 50 emails/day/member.**
- Configurable per workspace (admin/owner can change the limit in workspace settings).
- Rate limit is enforced by the worker before dispatching. If a member's daily limit is reached, remaining jobs stay in the queue and are processed the next day.

---

## SMTP Configuration

### Per-Member SMTP

- Each team member configures their own SMTP credentials (host, port, username, password).
- Emails are sent from the member's own address, not a shared workspace address.
- SMTP credentials are stored encrypted at rest.

### SMTP Error Handling

- **Network errors** (connection timeout, DNS failure, etc.): retry **3 times with exponential backoff**.
- **Authentication errors** (wrong credentials, account suspended, etc.): **fail immediately**, no retries. Surface the auth error to the member so they can fix their SMTP settings.
- After 3 failed network retries: mark the send job as `send_failed`. Do not move the contact bucket. Admin/owner can inspect and retry.

---

## Tracking Pixel

- Optional open-tracking pixel embedded in sent emails.
- **Workspace-level setting** — tracking is either on or off for the entire workspace.
- Admin/owner controls the setting.
- When enabled: a 1×1 pixel is embedded in all outgoing emails; opens are logged.
- When disabled: no pixel, no open tracking.

---

## Brief Model

A brief is a campaign configuration that drives LLM generation. One brief can be applied to many contacts.

### Brief Fields

| Field | Type | Notes |
|---|---|---|
| title | text | Human-readable name |
| product_description | text | What the product is |
| collaboration_type | enum | `free_barter` / `paid` |
| price_range | text | nullable; used for paid collaborations |
| tone | text | e.g., "friendly and casual", "professional" |
| language | text | ISO 639-1; overrides contact language if set |
| guidelines | text | Free-form instructions for the LLM |
| created_by_user_id | uuid | FK → users |
| workspace_id | uuid | FK → workspaces |

- Admin/owner can create briefs.
- Members select a brief when triggering bulk generation.

---

## Infrastructure Summary

| Addition | Detail |
|---|---|
| Redis | BullMQ backend; added to `docker-compose.yml` |
| Worker process | `apps/worker/` — Node.js; processes send queue |
| New env vars | `REDIS_URL`, SMTP fields per-user (stored in DB), `OPENAI_API_KEY` or Anthropic key |

---

## What Phase 2 Does NOT Include

- Inbox polling / reply detection (Phase 3)
- Autonomous follow-up or negotiation (Phase 4)
- Instagram DM (Phase 6)
- Self-service password reset (deferred)
- Dashboard / analytics
