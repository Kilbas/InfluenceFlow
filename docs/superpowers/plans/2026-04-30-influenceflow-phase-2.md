# InfluenceFlow — Phase 2 Implementation Plan

**Spec (single source of truth):** [docs/superpowers/specs/2026-04-30-influenceflow-phase-2-design.md](../specs/2026-04-30-influenceflow-phase-2-design.md)
**Date:** 2026-04-30
**Execution model:** subagent-driven development. Tasks are sized for one fresh subagent each, completed top-to-bottom within a milestone, with a spec-compliance + code-quality review pass after every task. Milestones are mostly sequential; cross-milestone parallelism noted where safe.

> **Rule for every task:** the spec is authoritative. If this plan and the spec disagree, the spec wins. Do not invent features outside the spec.

---

## Milestone M1 — Schema & Shared Libraries

Foundation everything else builds on. Must merge before M2+.

### Task M1.1 — Prisma schema, migration, env scaffolding
**Spec refs:** §3.4, §5.1, §5.2, §5.3, §11.

Add to Prisma schema:
- `Bucket` enum + `Contact.bucket` (default `cold`) + `@@index([workspaceId, bucket])`.
- `User.approvedLettersCount`, `User.forcePreviewMode`.
- New models: `Brief`, `MemberSmtp`, `WebContext`, `SentEmail` (+ `SentEmailStatus`), `EmailOpenEvent`, `WorkspaceSettings`. All field maps, indexes, relations exactly per §5.2.
- `ToneOfVoice` enum.

Other deliverables:
- Single migration `phase-2-init` covering all of the above.
- Update `audit_events.action` allow-list (or constants module) with the new actions in §5.3 — without changing existing Phase 1 audit semantics.
- `.env.example` additions: `REDIS_URL`, `ANTHROPIC_API_KEY`, `BRAVE_SEARCH_API_KEY`, `ENCRYPTION_KEY` with the `openssl rand -hex 32` note from §11.
- Backfill rule: existing contacts get `bucket = 'cold'` (the default handles this; verify migration is non-destructive on the seeded Phase 1 data).

**Acceptance:** `pnpm prisma migrate dev` clean on a Phase-1 DB; `pnpm prisma generate` typechecks; existing Phase 1 unit/e2e tests still pass.

### Task M1.2 — Shared libs (encryption, llm, search, email-render)
**Spec refs:** §5.2 (`member_smtp`), §6, §7.4, §9, §12.

Create under `apps/web/src/lib/`:
- `encryption.ts` — AES-256-GCM, IV-prefixed, base64 output. Key from `ENCRYPTION_KEY` (32-byte hex). Throws on missing/invalid key. Round-trip unit tests; tamper test (modified ciphertext → auth failure).
- `llm.ts` — thin Anthropic client wrapper exposing a typed `generateJson({ system, user, model, cacheBlocks })` helper that returns parsed JSON or throws a typed error (`TransientLLMError` for 429/5xx, `MalformedJsonError`, `ValidationError`). Supports prompt-caching markers per §6.3. No business logic here.
- `search.ts` — Brave Search wrapper: `searchCreator({ displayName, instagramHandle, niche })` returns top-10 raw results. Surfaces a `BraveUnavailableError` distinct from "0 results".
- `email-render.ts` — `renderHtml({ bodyText, trackingPixelId | null })` using `react-email`. Pixel only when id is provided. Returns `{ html, text }`.

Validation helpers (used later by worker):
- `validateLetterOutput({ subject, body })` enforcing §6.5 rules; pure function with unit tests.

**Acceptance:** all helpers unit-tested in isolation; no DB or network in tests (mock fetch / SDK).

---

## Milestone M2 — Briefs

Self-contained CRUD slice. Can start immediately after M1.

### Task M2.1 — Briefs server module + API
**Spec refs:** §5.2 (`briefs`), §5.3, §7 (archive behavior), §12.

- `apps/web/src/server/briefs.ts` — list (workspace-scoped, optional `archived` filter), create, get, update, archive. Permissions: any member can list/read/create; edit + archive limited to admin/owner OR original creator.
- API routes under `apps/web/src/app/api/briefs/`: `GET /`, `POST /`, `GET /[id]`, `PATCH /[id]`, `POST /[id]/archive`.
- Required-field validation per §5.2 schema.
- Audit `brief.created` / `brief.updated` / `brief.archived` on every successful mutation.
- Archive **must not** cascade to queued letters — worker keeps reading by id (§7 archive behavior). No DB-level cascade, no soft filter on the worker read path.

**Acceptance:** unit tests for permission matrix; audit row asserted per mutation; archived brief still resolvable by id from server module.

### Task M2.2 — `/briefs` UI (list + new/edit form)
**Spec refs:** §8.1, §8.3, §5.2.

- `/briefs` list page: name / creator / created / status (active/archived) / actions, "New brief" CTA.
- `/briefs/new` and `/briefs/[id]` form page with the field grouping called out in §8.1 (Identity, Product, Partnership, Style, Constraints, Optional). Required fields enforced client + server.
- Sidebar nav link "Briefs" added per §8.3 (do not yet add Review/Settings — those land with their milestones).
- Tone, language, model selectors restricted to spec-allowed values.

**Acceptance:** Playwright happy-path: create → edit → archive; archived brief no longer in active list, still reachable by direct URL.

---

## Milestone M3 — Member SMTP, Profile, Workspace Settings

These three slices share the "settings-ish" surface and are independent of M2. They can run after M1 in parallel with M2 if needed; internally do them in this order to keep the `/profile` screen complete in one pass.

### Task M3.1 — Member SMTP API (test + save)
**Spec refs:** §5.2 (`member_smtp`), §7.3, §12, §13.1 (SMTP).

- `POST /api/profile/smtp/test` — body `{host, port, username, password, senderName, senderEmail}`. Construct nodemailer transporter, call `verify()`. On success: encrypt password (M1.2 lib), upsert `member_smtp`, set `isActive=true`, `testedAt=now()`. Audit `member_smtp.tested` and `member_smtp.configured`. On failure: return structured error message; **do not persist** credentials.
- `GET /api/profile/smtp` — returns current row minus password.
- Bulk-send pre-flight (used in M7) will read `isActive`. Make `senderUserId` always come from session (§12).

**Acceptance:** unit tests with mocked nodemailer for success / auth-fail / connection-refused; encryption round-trip asserted via `member_smtp.passwordEncrypted` — never plaintext.

### Task M3.2 — `/profile` screen
**Spec refs:** §8.2 (profile), §7.6, §13.1.

Full profile screen replacing the Phase 1 deferral:
- Display name + password change (existing Auth.js wiring).
- SMTP config form with "Test Connection" button → renders the M3.1 endpoint result. Status pill: "✓ Connected" once `isActive`, otherwise "Not configured".
- Calibration block: shows `approvedLettersCount / workspace.calibrationThreshold`, "Reset counter" button (sets to 0), `forcePreviewMode` toggle. Both wired through new `PATCH /api/profile/calibration` endpoint that audits `workspace_settings.updated`-style nothing — instead just persists user fields (no audit needed per spec; do not invent one).
- Today's send count surfaced (`sent_emails` count where `sender_user_id = me` and `created_at` is today UTC, status in `approved|sending|sent`) — a read-only display per §13.1.

**Acceptance:** Playwright: configure SMTP with mocked verify success, see "Connected"; toggle force-preview persists across reload.

### Task M3.3 — Workspace settings (`/settings` + API)
**Spec refs:** §5.2 (`workspace_settings`), §8.1, §8.3, §12, §13.1.

- `apps/web/src/server/workspace-settings.ts` — get + update; admin/owner only for update.
- `GET /api/workspace/settings`, `PATCH /api/workspace/settings`. Validate enum-like fields against spec allow-lists (§5.2): `letterModel ∈ {claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5}`, `summarizeModel ∈ {claude-haiku-4-5, claude-sonnet-4-6}`. `defaultBriefId` must reference an existing brief in the same workspace if non-null.
- `/settings` UI (admin/owner only; member sees read-only): letter model, summarize model, daily rate limit, calibration threshold, tracking toggle, default brief.
- Audit `workspace_settings.updated` with a diff of changed fields.
- Sidebar "Settings" link visible only to admin/owner per §8.3.
- Auto-create the row at first read if missing (defaults from schema).

**Acceptance:** member receives 403 on PATCH; valid model values accepted, invalid rejected; audit row carries the diff.

---

## Milestone M4 — Worker Process & Prompt Builders

Standing up the second process. Blocks M5+M6.

### Task M4.1 — `apps/worker` scaffold, BullMQ wiring, docker-compose
**Spec refs:** §3.2, §3.3, §3.4, §10, §11, §13.2 (idempotency).

- New workspace package `apps/worker/` with `package.json`, `tsconfig.json`, `src/index.ts` bootstrap.
- BullMQ queues: `generate-letter`, `send-email`. (Per §7.2 there is **no** `fetch-web-context` queue — context fetch is inline inside the generate job.) A single connection module shared with the web app via `apps/web/src/lib/queue.ts` (or `packages/queue/`) so producers can enqueue.
- Job-handler skeletons that read `sent_emails.status` first and no-op when already past their starting state (§13.2 idempotency).
- `docker-compose.yml`: add `worker` service (built from `apps/worker/Dockerfile`) and `redis:7-alpine` with named volume; both `app` and `worker` `depends_on` `db` and `redis` healthchecks; both run `pnpm prisma migrate deploy` before boot.
- `.env` plumbing for `REDIS_URL`, `ANTHROPIC_API_KEY`, `BRAVE_SEARCH_API_KEY`, `ENCRYPTION_KEY` in worker.
- README operational notes: worker process, env vars, "do not rotate ENCRYPTION_KEY" warning (§5.2, §11).

**Acceptance:** `docker compose up` brings up 4 healthy containers; worker logs show queue listeners attached; an enqueued no-op job is picked up.

### Task M4.2 — Prompt builders
**Spec refs:** §6.1, §6.2, §6.3, §6.5.

- `apps/worker/src/lib/prompts.ts`:
  - `buildSystemPrompt()` — exact text per §6.2 (subject to spec wording); designed to be prompt-cached.
  - `buildUserPrompt({ brief, contact, sender, workspace, webContextSummary })` — exact template per §6.2. Brief portion sliced to allow caching.
  - `resolveLanguage(brief, contact)` — per §6.2 ("auto" → `contact.language` ?? `"en"`).
- Output validation reuses `validateLetterOutput` from M1.2; corrective-retry message builder per §6.5.
- Pure functions with snapshot/unit tests covering: `letterLanguage="auto"` with and without `contact.language`, web-context-null fallback, forbidden-phrases plumbing, all 6-element constraints surfaced in system prompt.

**Acceptance:** unit tests pass; no I/O; all branches of language resolution covered.

---

## Milestone M5 — Web Context & Letter Generation

The LLM pipeline. Depends on M1, M3.3 (model setting), M4.

### Task M5.1 — Web-context fetch (inline) + cleanup cron
**Spec refs:** §6.1, §7.2, §13.1 (web search), §5.2 (`web_context`).

- Helper `ensureFreshWebContext(contactId)` callable from inside the generate-letter job (§7.2 — no separate queue):
  1. Read `web_context` for contact. If row exists and `expiresAt > now()`: return summary as-is.
  2. Else: call Brave (M1.2 `search.ts`). On `BraveUnavailableError` upsert row with `summary=null`, `rawSearchResults=[]`, `expiresAt=now()+30d` and return null (do **not** block letter generation).
  3. On 0 results: same null upsert.
  4. On results: call Haiku via `llm.ts` (model = `workspace_settings.summarizeModel`) with the §6.1 summarizer prompt → 3-paragraph profile. If model returns `"insufficient context"` store `summary=null`. Else store the summary.
  5. Always persist `rawSearchResults` for debugging.
- Daily cleanup cron (BullMQ repeatable or simple cron in worker) deletes `web_context` rows with `fetched_at < now() - 90d`.

**Acceptance:** unit tests mocking Brave + LLM cover all four branches (fresh-cached / unavailable / zero-results / good-results); cleanup query asserted by integration test.

### Task M5.2 — `generate-letter` job
**Spec refs:** §6.1, §6.4, §6.5, §7.1, §7.6, §13.1 (letter generation).

Full job pipeline:
1. Idempotency: load `sent_emails` by id; if status is past `generating` or terminal, return.
2. Set `status='generating'`, `modelUsed = workspace.letterModel`.
3. Call `ensureFreshWebContext` (M5.1).
4. Build prompts (M4.2) and call `llm.generateJson` with the workspace's letter model. Apply prompt caching per §6.3.
5. Retry policy per §6.4: 3 attempts on transient (429/5xx) with exponential backoff 2s/4s/8s; immediate fail on other errors.
6. Validate output (§6.5); on validation failure run **one** corrective retry; second failure → `generation_failed`.
7. Persist subject/bodyText/generatedAt.
8. Routing per §7.1 + §7.6: if `sender.forcePreviewMode || sender.approvedLettersCount < workspace.calibrationThreshold` → `awaiting_review`. Else → `approved` and enqueue `send-email`.
9. Audit `letter.generated` per attempt (success or terminal failure).

**Acceptance:** unit tests for transient retries, malformed-JSON corrective retry, calibration routing both ways, idempotent re-run after worker restart.

---

## Milestone M6 — Send Pipeline & Tracking

Depends on M1, M3.1 (SMTP creds), M4 (queue), M3.3 (tracking toggle).

### Task M6.1 — `send-email` job
**Spec refs:** §7.1 (send portion), §7.4, §13.1 (send pipeline), §13.2.

- Idempotent: no-op if `status='sent'`.
- Set `status='sending'`.
- Decrypt member SMTP password (M1.2).
- Render HTML via `email-render.ts`. Pass `trackingPixelId = sentEmail.trackingPixelId` only if `workspace.trackingEnabled`; else null.
- nodemailer transport from member SMTP creds; capture returned Message-ID.
- On success: `status='sent'`, `sentAt`, `smtpMessageId`, set `contact.bucket='first_sent'` (if currently `cold`), audit `email.sent`.
- On network/transient error: retry up to 3 times with backoff (BullMQ attempts).
- On auth error: immediate fail, `status='send_failed'`, `errorMessage="SMTP authentication failed — update password in /profile"`, audit `email.send_failed`.

**Acceptance:** unit tests with mocked nodemailer for success / auth-fail / network-retry / already-sent idempotency; bucket transition asserted.

### Task M6.2 — Tracking-pixel endpoint
**Spec refs:** §7.4, §13.1 (tracking).

- `GET /api/track/open/[id].gif` (unauthenticated):
  1. UUID-format regex on `id`; non-UUID → 404 with no DB hit.
  2. Lookup `sent_emails` by `trackingPixelId`. Not found → still return 1×1 GIF, do not log event, do not reveal mismatch.
  3. Insert `email_open_events` row with `ipAddress`, `userAgent`.
  4. If this is the first event for the email → audit `email.opened`. Subsequent opens recorded but not audited.
  5. Return 1×1 transparent GIF, `Content-Type: image/gif`, `Cache-Control: no-store`.
- README ops note: recommend reverse-proxy rate-limiting on this endpoint (§12).

**Acceptance:** unit tests for non-UUID 404, unknown-id silent-200, first-vs-subsequent audit, content-type + cache-control headers.

---

## Milestone M7 — Bulk Send & Review Queue

Brings the user-facing flow together. Depends on M2, M3, M5, M6.

### Task M7.1 — `POST /api/letters/bulk` + pre-flight + rate limit
**Spec refs:** §7.1 (pre-flight), §7.5, §13.1 (rate limiting, bulk progress).

- Body: `{ briefId, contactIds[] }`. Sender is session user.
- Pre-flight (all 4 must pass; any failure returns structured error):
  - Member SMTP exists and `isActive`.
  - Brief exists, not archived, in workspace.
  - Rate-limit check using the SQL in §7.5 → `available = workspace.rateLimitPerMember - sentToday`.
  - No-duplicate check: skip / refuse contacts that already have a non-terminal-failure `sent_emails` row for this brief (define exact rule per spec wording — "no-duplicates" as listed in §7.1; if ambiguous, conservative: refuse contact already with any non-`rejected`/`generation_failed` row for the same brief).
- If `selected > available`: respond with confirmation payload `{ todayCount, deferredCount }`. On confirmed retry call: enqueue first N immediately, remaining M as BullMQ delayed jobs with `delay = msUntilNextMidnightUTC`.
- Insert `sent_emails` rows in `status='queued'` with `senderUserId = session.user.id` (§12 — never trust client). Enqueue `generate-letter` per row.
- Bulk-progress poll endpoint `GET /api/letters/progress?briefId=&since=` returning counts {generated, sent, in_review, failed} for the requesting user (every 2s polling, §13.1 bulk progress).

**Acceptance:** unit tests for each pre-flight failure branch; deferred-job math correct against fixed `Date.now()`; sender id cannot be spoofed.

### Task M7.2 — `/review` screen + approve/reject/edit/refine
**Spec refs:** §7.1 (review), §8.1, §13.1 (review queue, calibration).

- `/review` table: `awaiting_review` + `generation_failed`. Member sees own only; admin/owner sees workspace-wide. Calibration counter shown at top.
- Preview modal: subject, body, contact, brief, web-context summary, reasoning. Buttons: Approve / Reject / Edit.
- Endpoints:
  - `POST /api/letters/[id]/approve` — status → `approved`, increment `approvedLettersCount`, enqueue `send-email`. Audit `letter.approved`.
  - `POST /api/letters/[id]/reject` — status → `rejected`, contact stays `cold`. Audit `letter.rejected`.
  - `PATCH /api/letters/[id]` — plain-text edit; sets `editedByUserId`. Audit `letter.edited`.
  - `POST /api/letters/[id]/refine` — body `{ instruction }`; calls Anthropic with current draft + instruction + 3-button quick prompts (per §13.1 "AI refinement accepts custom prompt + 3 quick-buttons"); returns new draft, persists current draft as edited body. Audit `letter.refined`. May be called repeatedly before approval.
- Sidebar nav "Review queue" with red badge when any `generation_failed` exists for the user (§8.3).
- "Failed" tab shows `generation_failed` rows with `errorMessage`.

**Acceptance:** Playwright — generate (mocked LLM) → row appears in review → edit → refine twice → approve → counter increments → send job enqueued. Reject path leaves contact `cold`.

---

## Milestone M8 — Contacts UI Updates, E2E, Docs

Final integration polish.

### Task M8.1 — `/contacts` + `/contacts/[id]` updates
**Spec refs:** §8.2, §13.1 (buckets, bulk progress).

- `/contacts`:
  - Row checkboxes; "select all on page" affordance.
  - Sticky bulk-action bar appearing when rows selected: brief dropdown (active briefs only) + "Generate & Send" button → calls M7.1; handles confirmation modal for over-limit case.
  - Bucket badge column + bucket filter (Phase 2 visible buckets: `cold`, `first_sent`, `archived`; other enum values may appear if seeded but are not user-settable here).
  - Generation/sending spinners driven by the M7.1 progress poll endpoint.
  - Manual bucket move: member can move only to `archived`; admin/owner to any bucket. Audit `bucket.changed_manually`.
- `/contacts/[id]`:
  - "Email history" section: list of `sent_emails` for the contact with subject / sent date / open status (latest open from `email_open_events`).

**Acceptance:** Playwright — select 3 contacts, run bulk send (mocked LLM + SMTP), see progress, verify history page shows entries and open status updates after pixel hit.

### Task M8.2 — E2E acceptance scenario, README, .env.example
**Spec refs:** §13.2, §13.3, §11.

- Playwright test reproducing the §13.3 manual scenario in a compressed form (1 member, 3 contacts, full happy path: brief → SMTP → import → bulk select → generate → review (approve / edit-refine / reject one) → send via mocked SMTP → tracking pixel hit → bucket transition → audit log assertions).
- BullMQ idempotency test (§13.2): kill + restart worker mid-job; assert no duplicate sends.
- README updates: new env vars, worker process, redis container, ENCRYPTION_KEY rotation warning, tracking-pixel rate-limit recommendation, operational runbook (`pnpm prisma migrate deploy` on boot).
- `.env.example` final pass — every Phase 2 var documented.

**Acceptance:** CI green: lint, typecheck, unit, e2e. The §13.3 scenario is automated and passes.

---

## Cross-cutting standards (apply to every task)

- **TDD:** every task writes failing tests first, then implementation. Use `superpowers:test-driven-development` per task.
- **Audit-first:** any new mutating server action must write an audit row in the same transaction as the mutation, using the vocabulary in §5.3. No silent mutations.
- **Permissions:** check session role at the API layer; never trust client-supplied `senderUserId`, `workspaceId`, etc. (§12).
- **Idempotency:** every worker job re-checks `sent_emails.status` at start and no-ops if already past its starting state (§13.2).
- **Spec compliance > code style:** if a quality reviewer suggests behavior that diverges from the spec, the spec wins; raise a concern, do not silently change behavior.

---

## Suggested execution order & parallelism

```
M1 ──► M2 (briefs)
   ├──► M3 (settings/profile/SMTP)
   └──► M4 (worker scaffold) ──► M5 (LLM)
                              └─► M6 (send + tracking)

M2 + M3 + M5 + M6 ──► M7 (bulk + review)
                  └─► M8 (contacts UI + E2E)
```

M2 and M3 are independent of M4/M5/M6 and may be implemented by different subagents in sequence within one session. Inside a milestone, tasks run sequentially.

---

## Out of scope (do not implement in Phase 2)

Per §13 and §14, do not touch: sequences, IMAP, reply detection/classification, click tracking, analytics dashboards, Instagram, LLM negotiation, public profile scraping. Buckets `replied`/`quoted_price`/`agreed`/`rejected`/`no_reply_email`/`no_reply` exist in the schema but are not populated by Phase 2 code paths.
