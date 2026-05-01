# Product Vision — InfluenceFlow

## What It Is

InfluenceFlow is a **self-hosted, single-tenant CRM** that helps a marketing team manage blogger outreach at scale. It starts as a structured contact database and progressively adds an autonomous LLM agent that handles the full outreach lifecycle — from first contact to negotiating a collaboration deal.

## Who It's For

A marketing team of 5–20 people at a single company. They contact bloggers (Instagram, YouTube) to arrange promotional collaborations (paid or barter). They want automation without losing control.

## The Core Problem

Outreach to dozens or hundreds of bloggers is tedious, error-prone, and hard to coordinate across a team:
- Team members accidentally contact the same blogger twice from different accounts.
- Personalized first messages take time to write.
- Tracking where each conversation stands is manual.
- Negotiation follow-ups are forgotten or inconsistent.

## The Solution

A CRM where every blogger contact lives in a structured record, a team can collaborate safely (no duplicate outreach), and an LLM agent does the repetitive work: drafting first messages, sending follow-ups, classifying replies, negotiating terms — escalating to humans only when needed.

## Deployment Model

**Self-hosted, single-tenant.** One company per install. One `docker compose up -d` command. No public SaaS, no multi-tenancy, no billing. The company owns their data and runs it on their own infrastructure.

SaaS-ready schema (`workspace_id` on every table) means a future multi-tenant migration is mechanical, not architectural.

## Phase Roadmap

| Phase | Theme | Key Capabilities |
|---|---|---|
| 1 | Foundation | Contacts, Excel import, team auth, agent flag, audit log |
| 2 | Outbound email engine | Briefs, bulk send, LLM first emails, review queue, buckets, SMTP, tracking |
| 3 | Inbox polling | Email reply detection, response classification, conversation view |
| 4 | Closed-loop agent | Autonomous negotiation, escalation policy |
| 5 | Profile intelligence | Public scraper for blogger style adaptation |
| 6 | Instagram DM | DM channel (high risk, optional) |

Each phase ships a usable product layer. Phases are additive — later phases require earlier ones. See `docs/product/PHASES.md` for details.

## Design Principles

**Privacy by default.** Members see only their own contacts. Colleagues' data is never leaked — not counts, not fields, not identifiers — except the minimal overlap signal needed for team coordination.

**Auditability.** Every mutation writes an audit event in the same transaction. The audit log is append-only and visible only to admins and owner.

**Safety over automation.** The agent flag has conflict detection to prevent two team members from having the system contact the same blogger simultaneously. Automation never happens without an explicit human opt-in.

**Incremental.** No feature is added speculatively. Each phase has a concrete spec and ships something usable. Abstractions are added when the third use case arrives, not the first.

## Non-Goals (All Phases)

- Public SaaS / multi-tenant sign-up
- Billing / subscription management
- TikTok or platforms beyond Instagram and YouTube (Phase 1–4)
- AI hallucination risk without human review gate (Phase 2 has a review queue)
