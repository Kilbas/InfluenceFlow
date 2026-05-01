# InfluenceFlow — Phase 2 Design

**Date:** 2026-04-30
**Status:** Approved (brainstorm complete, awaiting user review)
**Author:** Kilbas + Claude (brainstorming session)

---

## 1. Context

Phase 2 builds on the Phase 1 foundation (contacts, team, audit log, agent flag) and adds the **outbound first-email layer**: campaign briefs, LLM-generated personalized first emails, SMTP per member, web-search-based personalization, and the worker queue infrastructure.

**Phase 2 does NOT include:** sequences (Phase 3), IMAP / reply detection (Phase 3), reply classification or buckets like `replied`/`quoted_price`/`agreed` (Phase 3), closed-loop LLM negotiation (Phase 4), Instagram outreach (Phase 5).

After Phase 2, a manager can: create a campaign brief, configure their personal SMTP, select N contacts in the contacts list, click "Generate & Send", review/edit AI-generated personalized first emails, and have them sent via their own SMTP — with workspace-wide rate limits, model selection, and open-tracking.

---

## 2. Phase 2 Goal

Replace the manual outbound process: instead of a manager opening their inbox and typing 50 personalized emails to bloggers per day, the system generates each email individually via Claude using a campaign brief plus per-creator web-search context, and sends through the manager's own SMTP. The first ~100 letters per member go through manual review (calibration); after that, the system auto-sends.

**Critical requirement:** every email is personally written by the LLM. No templates, no `{{firstName}}` substitution. This is the core differentiator from Klenty/Lemlist.

---

## 3. Architecture

### 3.1 What's added to Phase 1

Phase 2 adds new tables, new API routes, and a separate worker process. No breaking changes to Phase 1 schema or behavior.

### 3.2 New components

```
┌─────────────────────────────────────────────────────────┐
│  Next.js (App Router) — main app process               │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  React UI   │  │  API Routes  │  │  BullMQ      │    │
│  │  +briefs    │→ │  +briefs     │→ │  + Redis     │    │
│  │  +review    │  │  +bulk-send  │  │  enqueue     │    │
│  │  +settings  │  │  +track/open │  │              │    │
│  │  +profile   │  │              │  │              │    │
│  └─────────────┘  └──────┬───────┘  └──────────────┘    │
│                          │                              │
└──────────────────────────┼──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Worker process (apps/worker) — separate Node process   │
│                                                         │
│  ┌──────────────────────────────────────────┐           │
│  │ generate_letter                          │           │
│  │ (Claude Sonnet + inline web context      │           │
│  │  fetch via Brave + Haiku if needed)      │           │
│  └──────────────────────────────────────────┘           │
│  ┌──────────────────────────────────────────┐           │
│  │ send_email                               │           │
│  │ (nodemailer)                             │           │
│  └──────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  PostgreSQL (Phase 1)│
                │  + briefs            │
                │  + sent_emails       │
                │  + web_context       │
                │  + member_smtp       │
                │  + email_open_events │
                │  + workspace_settings│
                └──────────────────────┘
```

### 3.3 New external dependencies

- **Redis** (Docker container) for BullMQ queues
- **Anthropic API** (`@anthropic-ai/sdk`) for letter generation and search summarization
- **Brave Search API** for web research per blogger
- **Nodemailer** for SMTP sending
- (Phase 1's existing Postgres, Auth.js, Prisma, Vitest, Playwright unchanged)

### 3.4 Deployment topology

`docker-compose.yml` updated to 4 containers:
- `app` — Next.js app
- `worker` — `apps/worker/` Node process
- `db` — Postgres 16 (unchanged)
- `redis` — Redis 7 alpine

Worker reads from same database. Both `app` and `worker` need: `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `BRAVE_SEARCH_API_KEY`, `ENCRYPTION_KEY`.

---

## 4. Letter Anatomy (the product decision)

The first email follows a fixed 6-element structure. The LLM is instructed to produce ALL 6 elements, in order, every time.

### 4.1 Structure

1. **Subject line** — short, specific, human. Max 8 words. References niche or recent activity. Never marketing-style ("🔥 Exciting opportunity!").
2. **Personalized opener** — 1–2 lines proving the sender actually knows who the creator is. References something specific from web context.
3. **Who I am / why writing** — 1 line, brief context, not a pitch yet.
4. **Value for them** — 2–3 lines framed in the creator's interest. Uses brief's `whyWorkWithUs` or `keyProductBenefits` depending on which fits.
5. **Specific ask** — 1 line, low-friction ("Curious if this could fit?", "Would you be open to chatting?"). Never "let's hop on a call".
6. **Soft out + signature** — "If not a fit, no worries". Then signature: name, role, company.

### 4.2 Hard constraints (system prompt)

- 5–8 lines total body length
- Plain text, no HTML tags, no markdown formatting
- No specific prices in the first email (controlled by `brief.noPriceFirstEmail`)
- No trackable links in body, no images, no unsubscribe footer
- Never invent facts about the creator not present in context
- Never use "{{firstName}}"-style template substitution

### 4.3 Why this structure

This follows established cold-outreach playbooks (Klenty, Lemlist, sales engagement orgs). The first email's job is **not** to pitch fully — it's to earn the right to a follow-up by being human, specific, and low-pressure. Phase 3 sequences will deepen the pitch across follow-up emails 2, 3, 4.

---

## 5. Data Model

### 5.1 Phase 1 tables modified

#### `contacts` — add `bucket`

```prisma
enum Bucket {
  cold
  first_sent
  replied            // Phase 3
  quoted_price       // Phase 3
  agreed             // Phase 3
  rejected           // Phase 3
  no_reply_email     // Phase 3 (email sequence exhausted)
  no_reply           // Phase 5 (also Instagram exhausted)
  archived
}

model Contact {
  // ... all Phase 1 fields ...
  bucket Bucket @default(cold)

  @@index([workspaceId, bucket])
}
```

In Phase 2 only `cold`, `first_sent`, and `archived` are populated. The other enum values are reserved for future phases — defining them now avoids a migration later.

#### `users` — add calibration fields

```prisma
model User {
  // ... all Phase 1 fields ...
  approvedLettersCount Int     @default(0) @map("approved_letters_count")
  forcePreviewMode     Boolean @default(false) @map("force_preview_mode")
}
```

### 5.2 New tables

#### `briefs`

```prisma
enum ToneOfVoice { friendly casual professional playful }

model Brief {
  id                  String   @id @default(uuid()) @db.Uuid
  workspaceId         String   @map("workspace_id") @db.Uuid
  createdByUserId     String   @map("created_by_user_id") @db.Uuid

  name                String
  productDescription  String   @map("product_description") @db.Text
  audienceOverlap     String   @map("audience_overlap") @db.Text
  whyWorkWithUs       String   @map("why_work_with_us") @db.Text
  keyProductBenefits  String   @map("key_product_benefits") @db.Text

  acceptsBarter       Boolean  @default(true) @map("accepts_barter")
  barterOffer         String?  @map("barter_offer") @db.Text
  acceptsPaid         Boolean  @default(false) @map("accepts_paid")
  paidBudgetRange     String?  @map("paid_budget_range")
  desiredFormat       String   @map("desired_format") @db.Text

  toneOfVoice         ToneOfVoice @default(friendly) @map("tone_of_voice")
  letterLanguage      String   @default("auto")
  senderRole          String   @map("sender_role")

  forbiddenPhrases    String[] @map("forbidden_phrases")
  noPriceFirstEmail   Boolean  @default(true) @map("no_price_first_email")

  landingUrl          String?  @map("landing_url")
  promoCode           String?  @map("promo_code")

  archived            Boolean  @default(false)
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  workspace  Workspace   @relation(fields: [workspaceId], references: [id])
  createdBy  User        @relation(fields: [createdByUserId], references: [id])
  sentEmails SentEmail[]

  @@index([workspaceId, archived])
  @@map("briefs")
}
```

Briefs are workspace-wide visible (any member can use any brief). Edit/archive permissions: admin/owner OR the original creator.

**Archive behavior:** if a brief is archived while letters are queued (`status` ∈ {queued, generating, awaiting_review, approved, sending}) referencing it, those letters complete normally. The worker always reads `briefs` by ID regardless of `archived` flag — archive only hides the brief from the bulk-send dropdown.

#### `member_smtp`

```prisma
model MemberSmtp {
  userId            String   @id @map("user_id") @db.Uuid
  host              String
  port              Int
  username          String
  passwordEncrypted String   @map("password_encrypted")
  senderName        String   @map("sender_name")
  senderEmail       String   @map("sender_email")
  isActive          Boolean  @default(false) @map("is_active")
  testedAt          DateTime? @map("tested_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id])

  @@map("member_smtp")
}
```

`passwordEncrypted` is AES-256-GCM ciphertext, IV-prefixed, base64-encoded. Encryption key comes from `ENCRYPTION_KEY` environment variable (32-byte hex). The key is set once at install and must not change after — rotating it makes existing passwords undecryptable. Documented in README and `.env.example`.

`isActive = true` is set only after a successful "Test Connection" SMTP handshake. Until then, the member cannot trigger bulk-send.

#### `web_context`

```prisma
model WebContext {
  id               String   @id @default(uuid()) @db.Uuid
  contactId        String   @unique @map("contact_id") @db.Uuid
  workspaceId      String   @map("workspace_id") @db.Uuid
  summary          String   @db.Text
  rawSearchResults Json     @map("raw_search_results")
  fetchedAt        DateTime @default(now()) @map("fetched_at")
  expiresAt        DateTime @map("expires_at")

  contact   Contact   @relation(fields: [contactId], references: [id])
  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([expiresAt])
  @@map("web_context")
}
```

`expiresAt = fetchedAt + 30 days`. Cleanup job runs daily and deletes records older than 90 days (cap on storage).

If Brave returns 0 useful results or the summarizer outputs "insufficient context", `summary` is stored as `null` (still create the row with `rawSearchResults` for debugging). The letter-generation prompt sees `summary: null` and falls back to generic niche-based opener.

#### `sent_emails`

```prisma
enum SentEmailStatus {
  queued
  generating
  awaiting_review
  approved
  sending
  sent
  generation_failed
  send_failed
  rejected
}

model SentEmail {
  id               String   @id @default(uuid()) @db.Uuid
  workspaceId      String   @map("workspace_id") @db.Uuid
  contactId        String   @map("contact_id") @db.Uuid
  senderUserId     String   @map("sender_user_id") @db.Uuid
  briefId          String   @map("brief_id") @db.Uuid

  modelUsed        String?  @map("model_used")
  subject          String?
  bodyText         String?  @db.Text
  bodyHtml         String?  @db.Text

  status           SentEmailStatus @default(queued)
  generatedAt      DateTime? @map("generated_at")
  approvedAt       DateTime? @map("approved_at")
  sentAt           DateTime? @map("sent_at")
  editedByUserId   String?   @map("edited_by_user_id") @db.Uuid

  smtpMessageId    String?  @map("smtp_message_id")  // Phase 3 thread matching
  sequenceStep     Int?     @map("sequence_step")    // NULL in Phase 2; Phase 3 sets 1,2,3...
  trackingPixelId  String   @default(uuid()) @map("tracking_pixel_id") @db.Uuid

  errorMessage     String?  @map("error_message") @db.Text
  retryCount       Int      @default(0) @map("retry_count")

  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  workspace  Workspace        @relation(fields: [workspaceId], references: [id])
  contact    Contact          @relation(fields: [contactId], references: [id])
  sender     User             @relation("SentEmailSender", fields: [senderUserId], references: [id])
  brief      Brief            @relation(fields: [briefId], references: [id])
  openEvents EmailOpenEvent[]

  @@index([workspaceId, status])
  @@index([senderUserId, status])
  @@index([trackingPixelId])
  @@map("sent_emails")
}
```

`smtpMessageId` and `sequenceStep` are Phase-3-ready: they're populated by Phase 2 (Message-ID from nodemailer) and used by Phase 3 (matching IMAP replies, tracking sequence position). In Phase 2, `sequenceStep = NULL` always (= first email).

#### `email_open_events`

```prisma
model EmailOpenEvent {
  id          String   @id @default(uuid()) @db.Uuid
  sentEmailId String   @map("sent_email_id") @db.Uuid
  workspaceId String   @map("workspace_id") @db.Uuid
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  openedAt    DateTime @default(now()) @map("opened_at")

  sentEmail SentEmail @relation(fields: [sentEmailId], references: [id])

  @@index([sentEmailId, openedAt])
  @@map("email_open_events")
}
```

`ipAddress` and `userAgent` are stored for debugging. The first open per email triggers an `email.opened` audit event; subsequent opens do not (to avoid log noise).

#### `workspace_settings`

```prisma
model WorkspaceSettings {
  workspaceId           String   @id @map("workspace_id") @db.Uuid
  letterModel           String   @default("claude-sonnet-4-6") @map("letter_model")
  summarizeModel        String   @default("claude-haiku-4-5") @map("summarize_model")
  trackingEnabled       Boolean  @default(true) @map("tracking_enabled")
  rateLimitPerMember    Int      @default(50) @map("rate_limit_per_member")
  calibrationThreshold  Int      @default(100) @map("calibration_threshold")
  defaultBriefId        String?  @map("default_brief_id") @db.Uuid
  updatedAt             DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@map("workspace_settings")
}
```

Allowed values for `letterModel`: `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5`. Allowed for `summarizeModel`: `claude-haiku-4-5`, `claude-sonnet-4-6`. Validated at API layer.

### 5.3 Audit log — new actions

Added to existing `audit_events.action` vocabulary:

- `brief.created`, `brief.updated`, `brief.archived`
- `member_smtp.configured`, `member_smtp.tested`
- `letter.generated`, `letter.approved`, `letter.rejected`, `letter.edited`, `letter.refined`
- `email.sent`, `email.send_failed`, `email.opened`
- `bucket.changed_manually`
- `workspace_settings.updated`

---

## 6. LLM Pipeline

### 6.1 Three-stage pipeline per email

For each contact in a bulk-send:

1. **Web search** (Brave Search API) — query: `${displayName} @${instagramHandle} ${niche} instagram OR youtube OR podcast OR interview`. Returns top 10 results. Cached in `web_context` for 30 days.

2. **Summarize** (Claude Haiku 4.5 by default) — Brave results → 3-paragraph creator profile. Output stored in `web_context.summary`. If the model outputs "insufficient context", `summary = null`.

3. **Generate letter** (Claude Sonnet 4.6 by default) — system prompt with letter constraints + user prompt with brief + creator + sender context → JSON output `{ subject, body, reasoning }`.

### 6.2 Letter generation prompt structure

**System prompt** (cached via Anthropic prompt caching):

```
You are a partnership outreach specialist writing the FIRST email to a content creator. Your job is to earn the right to a second email by getting them interested enough to reply or at least open the next message.

## Hard constraints

1. Length: 5–8 lines total. Subject line max 8 words.
2. Tone: human, conversational. Never use marketing-speak ("synergy", "exciting opportunity").
3. NEVER use generic openers like "Hi {firstName}, I love your content!" — those signal mass outreach.
4. NEVER mention specific prices in the first email unless brief explicitly allows it.
5. NEVER include trackable links, images, unsubscribe footers, or HTML formatting.
6. NEVER claim things not provided in context (don't invent recent posts).

## Letter structure (6 elements, all required)

1. Subject line — short, specific, human
2. Personalized opener (1–2 lines) — reference something specific from context
3. Who I am / why writing (1 line)
4. Value for them (2–3 lines) — frame in their interest
5. Specific ask (1 line) — low-friction
6. Soft out + signature (1–2 lines)

## Output

Return JSON only:
{
  "subject": "...",
  "body": "...",
  "reasoning": "1 sentence on which signal you used for personalization"
}

If web context is insufficient, fall back to niche-based opener and note in `reasoning`.
```

**User prompt** (per-call, partially cached):

```
## The brief

Campaign: {brief.name}
Product: {brief.productDescription}
Audience this product fits: {brief.audienceOverlap}
Why work with us: {brief.whyWorkWithUs}
Key product benefits: {brief.keyProductBenefits}

What we offer the creator:
- Barter: {brief.acceptsBarter ? brief.barterOffer : "not offered"}
- Paid: {brief.acceptsPaid ? brief.paidBudgetRange : "not offered"}

What we're asking for: {brief.desiredFormat}
Tone: {brief.toneOfVoice}
Language: {resolvedLanguage — see below}
{Forbidden phrases if any}

## The creator

Name: {contact.displayName}
Instagram: @{contact.instagramHandle}
Niche: {contact.niche}
Country: {contact.country}
Followers: {contact.followersCount}

## Research context

{webContext.summary OR "No web context available — use niche/country only."}

## Sender info

Name: {sender.displayName}
Role: {brief.senderRole}
Signature line: {sender.displayName}\n{brief.senderRole}\n{workspace.name}

Now write the email. Output JSON only.
```

**Language resolution:** if `brief.letterLanguage = "auto"`, use `contact.language` if non-null, otherwise default to English (`en`). The resolved language is what's passed to the LLM.

### 6.3 Prompt caching

Anthropic prompt caching reduces cost ~70%:
- System prompt — cached (constant across all letters)
- Brief portion of user prompt — cached (changes only when brief is edited)
- Creator + sender portion — not cached (unique per call)

Estimated input: ~3000 tokens, ~2000 cached. Per-letter cost drops from ~$0.009 to ~$0.003.

### 6.4 Retry policy

Generation: 3 attempts with exponential backoff (2s, 4s, 8s) on `429` or `5xx` errors. Other errors fail immediately.

After all retries fail: `sent_emails.status = generation_failed`, `errorMessage` saved, visible in `/review` Failed tab.

### 6.5 Output validation

Parse returned JSON; verify:
- `subject` non-empty, ≤ 80 chars, no HTML
- `body` non-empty, ≤ 2000 chars, no HTML tags
- `reasoning` present (non-blocking — for debugging)

If validation fails: one retry with explicit "previous output was malformed: {error}, return strict JSON" appended to user prompt. If second attempt also fails → `generation_failed`.

---

## 7. Workflows

### 7.1 Bulk send (the main UX path)

```
Manager selects N contacts in /contacts → "Generate & Send" with brief →
  Pre-flight checks (SMTP active, brief active, rate limit, no-duplicates) →
  POST /api/letters/bulk → INSERT N sent_emails (status=queued) →
  Enqueue N "generate_letter" jobs in BullMQ →

Worker per job:
  status = generating →
  Ensure web_context fresh (else enqueue fetch_web_context, await) →
  Call Sonnet → JSON {subject, body, reasoning} →
  Validate output →
  Determine target status:
    if member.approvedLettersCount < workspace.calibrationThreshold OR forcePreviewMode → awaiting_review
    else → approved (and enqueue send_email immediately)

Manager in /review (if awaiting_review):
  approve → status=approved, approvedLettersCount++, enqueue send_email
  edit (plain text or AI refine) → updates body, then approve flow
  reject → status=rejected, contact stays in cold

Worker per send_email job:
  status = sending →
  Decrypt member SMTP password →
  Render HTML with tracking pixel (if workspace.trackingEnabled) →
  nodemailer send via member's SMTP →
  On success: status=sent, sentAt, smtpMessageId saved, contact.bucket=first_sent, audit email.sent
  On network error: retry up to 3 times with backoff
  On auth error: immediate fail, status=send_failed, errorMessage="SMTP authentication failed — update password in /profile"
```

### 7.2 Web context fetch (lazy)

When a contact is created OR `web_context.expiresAt < now()` AND a letter generation needs it:

1. Generate-letter worker checks `web_context` for the contact at start of job
2. If row missing or `expiresAt < now()`: worker calls `fetch_web_context` synchronously **inside the same job** (Brave search → Haiku summarize → upsert row). No separate queue needed; this avoids cross-job coordination complexity.
3. If `fetch_web_context` fails (e.g., Brave API down), worker upserts `web_context` with `summary = null` and `rawSearchResults = []`, lets generation continue with generic fallback. Failure of context fetch should not block the letter.

If Brave returns 0 results: row created with `summary = null`, `rawSearchResults` empty. Future re-fetch happens after 30 days (no point hammering search if it returned nothing).

### 7.3 SMTP test connection

`POST /api/profile/smtp/test` with body `{host, port, username, password, senderName, senderEmail}`:

1. Construct nodemailer transporter
2. Call `transporter.verify()` — does SMTP handshake, no email sent
3. On success: encrypt password with ENCRYPTION_KEY, upsert `member_smtp` row, set `isActive = true`, `testedAt = now()`. Audit `member_smtp.tested`.
4. On failure: return error message ("connection refused", "auth failed", etc.); do NOT save creds.

### 7.4 Tracking pixel

Endpoint `GET /api/track/open/[id].gif`:

1. Validate id is UUID format (regex). If not, return 404 immediately without DB hit.
2. Lookup `sent_emails.trackingPixelId = id`. If not found, return 1×1 GIF anyway (don't reveal mismatch).
3. INSERT `email_open_events` row.
4. If this is the first open for this email (no prior events) → audit `email.opened`.
5. Return 1×1 transparent GIF with `Cache-Control: no-store`.

Endpoint is unauthenticated by design (recipient can't auth).

### 7.5 Rate limiting

At bulk-send enqueue time:

```sql
SELECT count(*) FROM sent_emails
WHERE sender_user_id = $userId
  AND status IN ('approved', 'sending', 'sent')
  AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE;
```

`available = workspace.rateLimitPerMember - sentToday`.

If `selected > available`:
- Show confirmation modal: "You have N today, M will be deferred to tomorrow. Continue?"
- If confirmed: first N are enqueued normally; remaining M are enqueued as BullMQ `delayed` jobs with `delay = msUntilNextMidnightUTC`.

### 7.6 Calibration counter

Each member starts with `approvedLettersCount = 0`. Every successful approval (manual or auto) increments. When the count reaches `workspace.calibrationThreshold` (default 100), generated letters bypass review and go straight to `approved`.

Member can:
- Reset counter to 0 (in /profile) — back to preview mode
- Toggle `forcePreviewMode = true` — overrides counter, keeps preview always on
- Change threshold (admin only, in /settings, applies workspace-wide)

---

## 8. UI Surface

### 8.1 New screens (4)

1. **`/briefs`** — list of all briefs in workspace with name/creator/created/status/actions. "New brief" CTA.
2. **`/briefs/[id]`** (and `/briefs/new`) — large form with all brief fields grouped (Identity, Product, Partnership, Style, Constraints, Optional). Validation enforces required fields.
3. **`/review`** — table of letters with `awaiting_review` or `generation_failed` status. Calibration counter shown. Clicking a row opens preview modal with approve/edit/reject. Edit modal has plain text editor + AI refinement bar.
4. **`/settings`** — admin/owner only. Workspace settings: letter model, summarize model, daily rate limit, calibration threshold, tracking pixel toggle, default brief.

### 8.2 Modified screens (Phase 1)

- **`/contacts`** — adds: row checkboxes, sticky bulk action bar (brief dropdown + "Generate & Send"), bucket badge column, bucket filter, generation/sending spinners.
- **`/contacts/[id]`** — adds: "Email history" section listing all sent_emails for this contact with subject/sent date/open status.
- **`/profile`** — new (Phase 1 explicitly deferred this). Display name + password change + SMTP config + calibration counter + force-preview toggle.

### 8.3 AppShell sidebar updates

Add nav links:
- `Briefs` (all members)
- `Review queue` (all members; red badge if any failed)
- `Settings` (admin/owner only)

`Profile` accessed via user dropdown in header.

### 8.4 Out of UI scope in Phase 2

- Analytics dashboard (open rate, reply rate per member) — Phase 3
- Sequence editor (steps 2, 3, 4) — Phase 3
- Per-contact full conversation thread — Phase 3
- Click tracking — Phase 3
- Email template editor — never (LLM-only generation)

---

## 9. Tech Stack additions

| Concern | Choice |
|---|---|
| Background queue | BullMQ + Redis 7 |
| Email sending | Nodemailer (SMTP) |
| LLM SDK | `@anthropic-ai/sdk` |
| Web search | Brave Search API |
| Encryption | Node `crypto` (AES-256-GCM) |
| HTML email render | `react-email` + `@react-email/render` |

(Phase 1 stack — Next.js 16, TypeScript, Prisma 7, Postgres 16, Auth.js v5, Vitest, Playwright — unchanged.)

---

## 10. Repository Layout additions

```
influenceflow/
├── apps/
│   ├── web/                       # Next.js (existing)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── briefs/    # NEW
│   │   │   │   │   ├── review/    # NEW
│   │   │   │   │   ├── settings/  # NEW
│   │   │   │   │   └── profile/   # NEW
│   │   │   │   └── api/
│   │   │   │       ├── letters/    # NEW
│   │   │   │       ├── briefs/     # NEW
│   │   │   │       ├── profile/smtp/ # NEW
│   │   │   │       └── track/open/ # NEW
│   │   │   ├── lib/
│   │   │   │   ├── llm.ts          # NEW — Anthropic client
│   │   │   │   ├── search.ts       # NEW — Brave wrapper
│   │   │   │   ├── encryption.ts   # NEW — AES-GCM
│   │   │   │   └── email-render.ts # NEW — react-email
│   │   │   └── server/
│   │   │       ├── briefs.ts       # NEW
│   │   │       ├── letters.ts      # NEW
│   │   │       ├── smtp-config.ts  # NEW
│   │   │       └── workspace-settings.ts # NEW
│   ├── worker/                    # NEW separate process
│   │   ├── src/
│   │   │   ├── index.ts            # bootstrap workers
│   │   │   ├── jobs/
│   │   │   │   ├── generate-letter.ts
│   │   │   │   ├── fetch-web-context.ts
│   │   │   │   └── send-email.ts
│   │   │   └── lib/
│   │   │       └── prompts.ts      # system + user prompt builders
│   │   ├── package.json
│   │   └── tsconfig.json
├── docker-compose.yml             # add worker + redis
└── ...
```

---

## 11. Deployment

`.env` additions:
- `REDIS_URL` (e.g. `redis://redis:6379`)
- `ANTHROPIC_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `ENCRYPTION_KEY` — 32-byte hex (`openssl rand -hex 32`); set once, do not change

`docker-compose.yml` adds:
- `worker` service (built from `apps/worker/Dockerfile`)
- `redis` service (`redis:7-alpine`, named volume)
- Both `app` and `worker` depend on `db` and `redis` healthchecks

Both processes run `pnpm prisma migrate deploy` at startup before boot.

---

## 12. Security

- SMTP passwords stored as AES-256-GCM ciphertext, key from env (never in DB or repo)
- Tracking pixel endpoint validates UUID format before DB lookup; rate-limited at the reverse proxy layer (recommended in README)
- Rate limit enforced server-side; member cannot bypass via direct API call
- Member cannot send letters from another member's identity (sender_user_id forced from session)
- Brief edit/archive: admin/owner OR original creator
- Workspace settings: admin/owner only; member sees read-only view
- All mutating endpoints CSRF-protected (Auth.js default)
- Audit log captures every brief change, SMTP config, letter approval, send, open, settings change

---

## 13. Acceptance Criteria

### 13.1 Functional

**Briefs**
- [ ] Members create/edit/archive briefs (visible workspace-wide)
- [ ] Required fields enforced; optional fields nullable
- [ ] Audit events for create/update/archive

**SMTP per member**
- [ ] Profile form for host/port/user/password/sender info
- [ ] "Test Connection" performs real SMTP handshake
- [ ] Password AES-256-GCM encrypted; never plaintext in DB
- [ ] Bulk send blocked without active SMTP config

**Web search + summarization**
- [ ] Brave Search hit on contact creation OR when context expires
- [ ] Claude Haiku summarizes results into 3-paragraph profile
- [ ] 30-day TTL; cleanup job deletes records older than 90 days
- [ ] `summary = null` when search returns 0 results; LLM falls back to generic opener

**Letter generation**
- [ ] Each contact in bulk gets unique LLM call (no template substitution)
- [ ] Subject ≤ 80 chars; body plain text, ≤ 2000 chars
- [ ] 3-attempt retry with exponential backoff on transient errors
- [ ] Validation failure triggers one corrective retry; second failure marks `generation_failed`
- [ ] Audit `letter.generated` per attempt

**Calibration**
- [ ] New member starts at 0/100, all letters go to review
- [ ] Counter increments on each approval
- [ ] Auto-mode kicks in when `count >= threshold`
- [ ] Reset counter / force preview mode work
- [ ] Threshold is workspace-wide setting

**Review queue**
- [ ] `/review` shows `awaiting_review` and `generation_failed` letters
- [ ] Member sees own only; admin/owner sees all
- [ ] Approve / Reject / Edit (with AI refinement) all work
- [ ] AI refinement accepts custom prompt + 3 quick-buttons; can refine multiple times before approve

**Send pipeline**
- [ ] On approve, BullMQ `send_email` job enqueued
- [ ] HTML render includes tracking pixel only if `trackingEnabled = true`
- [ ] Member's SMTP creds decrypted, used for nodemailer transport
- [ ] On success: `status=sent`, `smtpMessageId` saved, `contact.bucket=first_sent`, audit `email.sent`
- [ ] Network errors retried up to 3 times; auth errors fail immediately with helpful message

**Tracking**
- [ ] `/api/track/open/[id].gif` returns 1×1 transparent GIF, logs event
- [ ] First-open audit only; subsequent opens recorded but not audited
- [ ] Email history in `/contacts/[id]` shows opens

**Rate limiting**
- [ ] `availableToday = limit - sent_today` calculated correctly per member
- [ ] Over-limit bulk show confirmation; deferred portion enqueued as delayed jobs
- [ ] Member sees today's count in `/profile`

**Bulk progress**
- [ ] Progress bar in `/contacts` polls every 2s
- [ ] Shows: Generated / Sent / In review / Failed counts
- [ ] Disappears when all done or manually dismissed

**Workspace settings**
- [ ] Admin/owner can change letter model, summarize model, rate limit, threshold, tracking toggle
- [ ] Letter model change applies to subsequent generations only
- [ ] Audit `workspace_settings.updated` with diff

**Buckets**
- [ ] Imported contacts default to `cold`
- [ ] Successful send transitions to `first_sent`
- [ ] Member can move to `archived` only; admin/owner can move to any bucket
- [ ] Bucket filter in `/contacts` works
- [ ] Audit `bucket.changed_manually`

### 13.2 Quality gates

- [ ] CI passes: lint, typecheck, unit tests, e2e tests
- [ ] Unit tests cover: brief CRUD, encrypt/decrypt round-trip, rate limit calculation, calibration logic, LLM JSON validation, tracking pixel UUID lookup, prompt builder
- [ ] E2E tests cover: brief create → bulk send 3 contacts → approve in review → SMTP send (mock) → open pixel → bucket transition
- [ ] BullMQ jobs idempotent: worker checks `sent_emails.status` at start of `send_email` job; if already `sent`, no-op. Same for `generate_letter` — if already past `generating`, no-op. Worker restart cannot duplicate sends.
- [ ] README updated with new env vars and operational notes

### 13.3 Manual acceptance scenario

> **"5 members, 100 contacts, 1 campaign"**
>
> 1. Owner creates brief "Pillow Q2 2026" with all fields. In `/settings` confirms model = sonnet-4-6, rate limit = 50, threshold = 100.
> 2. All 5 members configure SMTP in `/profile`, see "✓ Connected".
> 3. A member imports Excel with 100 bloggers. System enqueues web context fetches in background.
> 4. Member selects 50 contacts in `/contacts`, picks "Pillow Q2", clicks "Generate & Send".
> 5. Pre-flight passes; 50 letters enqueued. Progress bar shows generation.
> 6. All 50 reach `awaiting_review` (member is in calibration: 0/100).
> 7. Member opens `/review`, approves first letter directly. Edits next letter via AI refinement ("make 1 line shorter") → new version → approves. Continues for all 50.
> 8. Each approve sends through member's SMTP, status=sent, contact.bucket=first_sent. Counter = 50/100.
> 9. Next day: another bulk-send 50, all reviewed and approved. Counter = 100/100. Banner: "Auto-mode active".
> 10. Third bulk-send 50 — sent automatically without preview.
> 11. Tracking pixels record opens; `/contacts/[id]` shows "Opened: 2026-05-01 14:23".
> 12. Admin checks `/audit`: chronology of brief.created, member_smtp.configured ×5, letter.generated ×150, letter.approved ×100, email.sent ×150, email.opened ×N, bucket.changed_manually ×0.
> 13. SMTP failure simulation: invalidate one member's password externally → next bulk send fails for that member with helpful error in `/review` Failed tab. Member fixes password, retries → succeeds.

If this scenario passes without UX surprises, Phase 2 is done.

---

## 14. Out of Scope (Recap)

Deferred to later phases:

- Sequences (follow-up emails 2, 3, 4) — Phase 3
- IMAP listener / inbox parsing — Phase 3
- Auto-stop on reply — Phase 3
- Buckets `replied`, `quoted_price`, `agreed`, `rejected`, `no_reply_email` — populated in Phase 3
- Click tracking — Phase 3
- Analytics dashboard (open rate / reply rate per member) — Phase 3
- LLM-driven negotiation on replies — Phase 4
- Public profile scraping (Instagram) — Phase 5
- Instagram DM channel — Phase 5+

---

## 15. Glossary

- **Brief** — campaign configuration: product, offer terms, tone, who it's for. Workspace-wide visible. Multiple per workspace.
- **Letter** — single generated email; record in `sent_emails`. Always associated with one contact and one brief.
- **Sent email** / **letter** — used interchangeably for a record in `sent_emails`.
- **Bucket** — communication state of a contact (cold, first_sent, etc.). Phase 2 populates only `cold`, `first_sent`, `archived`.
- **Calibration** — phase where a new member's letters require manual approval before sending; ends when `approvedLettersCount >= calibrationThreshold`.
- **Web context** — cached Brave-Search-derived creator profile, expires after 30 days.
- **Tracking pixel** — 1×1 transparent GIF embedded in HTML email; loaded by recipient's email client; records open event.
