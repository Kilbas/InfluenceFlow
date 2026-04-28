# InfluenceFlow — Phase 1 Design

**Date:** 2026-04-28
**Status:** Approved (brainstorm complete, awaiting user review of written spec)
**Author:** Kilbas + Claude (brainstorming session)

---

## 1. Context

InfluenceFlow is a self-hosted CRM with an autonomous LLM agent that contacts bloggers on behalf of a marketing team to negotiate promotional collaborations (free/barter or paid).

The product is built incrementally in phases. Each phase delivers a usable product layer; later phases stack on top of earlier ones. **All phases compose into a single application — one repo, one database, one deployment.**

### Phase roadmap (high level, for context only)

- **Phase 1 (this spec):** Foundation — contacts, Excel import, team/auth, base UI, audit log.
- **Phase 2:** Briefs + outbound email engine + LLM-generated first messages.
- **Phase 3:** Inbox polling, response classification, conversation buckets.
- **Phase 4:** Closed-loop negotiation agent, escalation policy.
- **Phase 5:** Public profile scraping for style adaptation.
- **Phase 6:** Instagram DM channel (high risk, optional).

This document specifies **only Phase 1**. Subsequent phases get their own spec documents.

---

## 2. Phase 1 Goal

Deliver a **self-hosted single-tenant CRM foundation** that lets a team of 5–20 people:

1. Run the system on their own infrastructure with a single `docker compose up -d`.
2. Log in with email/password.
3. Upload blogger contacts from Excel files following a fixed template.
4. Manage their own private list of contacts; admins/owners see everything.
5. Mark contacts as "in work for the LLM agent" via a checkbox (the agent itself does not exist in Phase 1 — the flag is recorded for future phases).
6. See a workspace-wide audit log of who did what.

**Phase 1 ships with no email sending, no LLM, no inbox polling.** It is purely the data foundation and team management layer.

---

## 3. Tenancy Model

- **Single-tenant per deployment.** One company per install. No public signup. No billing.
- **One default workspace** is created during initial setup.
- **SaaS-ready schema:** `workspace_id` is present in every business table (`users`, `contacts`, `import_batches`, `audit_events`, `invitations`). This makes future multi-tenant migration mechanical, not architectural.
- Owner is created during install with a temporary password printed to the container logs. Owner sets a real password on first login.

---

## 4. Roles & Visibility

### Roles

| Role | Cardinality | Powers |
|---|---|---|
| `owner` | exactly 1 per workspace | Cannot be deleted or demoted. All admin powers + immortality. Created at install time. |
| `admin` | 0..N | Full read/write across the workspace: every contact, every audit entry. Can also act as a member (own contacts, toggle agent flag on them). Manages team: invite, remove (soft-delete), change roles. (Contact ownership reassignment between members is recognized as an admin capability conceptually but is NOT part of Phase 1 UI; deferred to a later phase.) |
| `member` | 0..N | Sees and edits **only their own contacts**. Imports their own Excel files. Toggles the agent flag on their own contacts. Cannot see colleagues' contacts (privacy by design). |

### Visibility rules

- **Members see only their own contacts** in lists, search, and detail views. They cannot enumerate, retrieve, or count colleagues' contacts through any UI or API path.
- **Admins and owner see all contacts** in the workspace.
- **Audit log is visible only to admins and owner.** Members cannot access it.

### Deactivation semantics

"Deactivating" a user is a soft delete (`users.deleted_at` set). The deactivated user can no longer log in. Their contacts are NOT deleted — they remain in the database with the original `owner_user_id`, and admins/owner continue to see them under the read-only "deactivated user" attribution. Reassignment to another member is deferred to a later phase.

### One narrow visibility carve-out

Members CAN see **the existence** of colleagues' contacts in two specific contexts:

1. **In the post-import report**, which lists rows that overlap with colleagues' lists. The report shows the email/instagram handle (already in the member's own uploaded file anyway) plus the colleague's display name, so the member can coordinate offline.
2. **As a duplicate badge on a member's own contact row**, where a member's contact is also held by a colleague. The badge shows the colleague's display name on hover.

No other field of the colleague's contact is exposed (no notes, no niche, no follower count, no agent state). This carve-out is the minimum needed to support the team-coordination use case.

---

## 5. Contact Data Model

### Required fields (every contact must have these)
- `email` — must be syntactically valid; mandatory
- `instagram_handle` or `instagram_url` — at least one
- `display_name`

### Personalization fields (used by future LLM agent)
- `language` — ISO 639-1 code, nullable
- `country` — ISO 3166-1 alpha-2 code, nullable
- `niche` — free text, nullable
- `followers_count` — integer, nullable
- `notes` — long free text, nullable

### Optional contact fields
- `phone` — nullable
- `youtube_channel_name` — nullable

### System fields
- `id` — UUID, primary key
- `workspace_id` — FK
- `owner_user_id` — FK; the user who imported or created the contact
- `agent_active` — boolean, default `false`; indicates whether the LLM agent should work this contact (Phase 1 only stores the flag; no agent yet)
- `source_import_batch_id` — FK to `import_batches`, nullable (for manually created contacts)
- `created_at`, `updated_at` — timestamps
- `deleted_at` — nullable, soft delete

### Fields explicitly NOT in Phase 1 model
- TikTok handle, engagement_rate, avg_likes, last_post_date, tags array — deferred until a concrete need surfaces.

---

## 6. Database Schema (8 tables)

All bigint IDs are UUIDs (uuidv7 preferred for sortability). All `timestamptz` columns use UTC.

### `workspaces`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| created_at | timestamptz | |

### `users`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK |
| email | text | unique within workspace |
| password_hash | text | Argon2id |
| display_name | text | |
| role | enum(`owner`, `admin`, `member`) | |
| created_at | timestamptz | |
| deleted_at | timestamptz | nullable, soft delete |

**Constraint:** exactly one row with `role = 'owner'` per workspace (partial unique index on `workspace_id` where `role = 'owner'`).

### `invitations`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK |
| email | text | |
| role | enum(`admin`, `member`) | role to assign on acceptance |
| token | text | URL-safe random, ≥256 bits entropy, unique |
| created_by_user_id | uuid | FK → users |
| expires_at | timestamptz | nullable; NULL = no expiry |
| accepted_at | timestamptz | nullable |
| accepted_by_user_id | uuid | nullable, FK |
| created_at | timestamptz | |

### `contacts`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK |
| owner_user_id | uuid | FK → users |
| email | text | required, validated |
| instagram_handle | text | nullable, normalized (lowercased, no `@`, no URL) |
| instagram_url | text | nullable, original URL as supplied |
| display_name | text | |
| language | text | nullable |
| country | text | nullable |
| niche | text | nullable |
| followers_count | int | nullable |
| notes | text | nullable |
| phone | text | nullable |
| youtube_channel_name | text | nullable |
| agent_active | bool | default false |
| source_import_batch_id | uuid | nullable, FK |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz | nullable |

**Unique constraint:** `(workspace_id, owner_user_id, email) WHERE deleted_at IS NULL`. This enforces "no duplicates within one user's list" while allowing the same email to exist across different members.

**Indexes:**
- `(workspace_id, owner_user_id, agent_active)` — list "my active contacts"
- `(workspace_id, email)` — cross-member dedup lookup
- `(workspace_id, instagram_handle)` — same, by handle
- `(workspace_id, agent_active)` — global active-conflict check

### `import_batches`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK |
| user_id | uuid | who imported |
| filename | text | original filename |
| file_hash | text | sha256 of file content |
| rows_total | int | |
| rows_imported_new | int | |
| rows_skipped_own_duplicate | int | |
| rows_imported_with_colleague_warning | int | |
| rows_rejected | int | |
| rejection_report | jsonb | array of `{row_number, reason, raw}` |
| created_at | timestamptz | |

### `audit_events`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK |
| actor_user_id | uuid | nullable (system actions) |
| action | text | namespaced (see below) |
| entity_type | text | `contact` / `user` / `invitation` / `import_batch` |
| entity_id | uuid | nullable |
| payload | jsonb | action-specific details (e.g. field diff) |
| created_at | timestamptz | |

**Index:** `(workspace_id, created_at desc)` for paginated UI listing.

**Action vocabulary (Phase 1):**
- `auth.login`, `auth.failed_login`, `auth.logout`
- `contact.created`, `contact.updated`, `contact.deleted`
- `contact.agent_active.toggled`
- `contact.agent_active.activation_blocked` — recorded when activation was rejected due to colleague conflict
- `import.completed`
- `user.invited`, `user.invitation_revoked`, `user.joined`
- `user.role_changed`, `user.deactivated`

### `auth_sessions`
Standard Auth.js session table (managed by Auth.js Prisma adapter — schema follows the library's conventions, not detailed here).

---

## 7. Critical Workflows

### 7.1 Excel Import

**Excel template:** Fixed schema. Column names and order are predefined and immutable. Users download `template.xlsx` from the UI and fill it in. Imports that don't match the schema are rejected with a clear error.

**Template columns:**
1. email (required)
2. instagram_handle_or_url (required — system normalizes)
3. display_name (required)
4. language
5. country
6. niche
7. followers_count
8. phone
9. youtube_channel_name
10. notes

**Import sequence:**

1. User uploads xlsx via UI (max 10 MB, max 5000 rows).
2. Server computes sha256 of file content → `file_hash`.
3. **File-hash check:** if a prior `import_batch` exists with same `file_hash` and same `user_id`, show a confirmation dialog ("you uploaded this file on YYYY-MM-DD; continue anyway?"). User can confirm or cancel.
4. Parse rows. For each row:
   - **Required-field check:** if `email`, `instagram_handle_or_url`, or `display_name` is empty/whitespace → row goes to `rejected` with reason `"missing_required_field:<field>"`.
   - **Validate email syntax.** Invalid → row goes to `rejected` with reason `"invalid_email"`.
   - **Normalize instagram:** strip whitespace, lowercase, remove leading `@`, extract handle from `instagram.com/<handle>` URL forms. Persist both normalized handle (`instagram_handle`) and original (`instagram_url`). If the value cannot be normalized to a non-empty handle → reject with reason `"invalid_instagram"`.
   - **Self-duplicate check:** does the importing user already have this email or instagram_handle (in non-deleted contacts)?
     - If yes → row goes to `skipped_own_duplicate`.
   - **Colleague-duplicate check:** does any other member in the workspace have this email or instagram_handle?
     - If yes → row is imported AND flagged with `colleague_owner_display_name` for the report.
   - Otherwise → clean new row.
5. **Single transaction:**
   - INSERT `import_batches` row with all counts and full `rejection_report`.
   - INSERT `contacts` rows (with `agent_active = false`, `source_import_batch_id`).
   - INSERT `audit_events` row: `action = "import.completed"`, payload includes counts.
6. Redirect to **Import Report screen** showing four buckets:
   - ✅ N new contacts added
   - 🔁 M rows already in your list (skipped) — with email list
   - ⚠️ K rows overlapping with colleagues (added with badge) — with email list and colleague names
   - ❌ X rows rejected — with downloadable CSV containing row number + reason + raw cells

**Performance:** synchronous within the request for files ≤5000 rows. Larger files are out of scope for Phase 1 (will move to background queue in Phase 2).

### 7.2 Activating the Agent Flag (with Conflict Detection)

This is the safety-critical flow that prevents two team members from having the system contact the same blogger from two different employees.

**Endpoint:** `POST /api/contacts/:id/activate`

**Sequence:**

1. Load the contact. Authorization: caller must be the contact's `owner_user_id` OR an admin/owner.
2. If `agent_active` is already true → 400, no-op.
3. **Inside a transaction**, with `SELECT ... FOR UPDATE` on rows matching the contact's email/handle in the workspace:
   - Search for any other contact in the same workspace where `agent_active = true` and (`email = me.email` OR `instagram_handle = me.instagram_handle`) and `owner_user_id != me.owner_user_id` and `deleted_at IS NULL`.
4. If a conflict is found:
   - Look up the colleague's `display_name`.
   - Insert `audit_events` row: `action = "contact.agent_active.activation_blocked"`, payload includes the conflicting colleague's user_id.
   - Return 409 Conflict with body `{ "blocked_by": "<display_name>" }`.
   - UI shows modal: "У коллеги {display_name} этот контакт уже в работе. Свяжитесь с ним перед активацией."
5. If no conflict:
   - UPDATE `contacts SET agent_active = true, updated_at = now()`.
   - INSERT `audit_events`: `action = "contact.agent_active.toggled"`, payload `{ "to": true }`.
   - COMMIT, return 200.

**Deactivation** (`POST /api/contacts/:id/deactivate`): no conflict check; always allowed. Records audit event.

**Race condition handling:** the `SELECT ... FOR UPDATE` ensures that concurrent activation attempts on the same email are serialized. Whichever transaction commits first wins; the second transaction's conflict check will then see the freshly-committed `agent_active = true` row and be rejected.

### 7.3 Invitation Flow

**Creating an invitation (admin/owner UI):**

1. Admin fills form: email, role (`admin` or `member`), expiry option:
   - "N days" (numeric input, default 30)
   - "no expiry" (checkbox; sets `expires_at = NULL`)
2. POST `/api/invitations`.
3. Generate URL-safe token with ≥256 bits entropy.
4. INSERT `invitations` with `expires_at` either set or NULL.
5. INSERT `audit_events`: `user.invited`.
6. Response includes invite URL: `https://<host>/invite/{token}`.
7. UI displays the URL with a "copy" button. Admin shares it through their own preferred channel (Slack, Telegram, email, etc.) — the system itself sends nothing in Phase 1.

**Accepting an invitation:**

1. Visitor opens `/invite/{token}`.
2. Server looks up invitation by token.
3. If `accepted_at IS NOT NULL` → 410 Gone, "ссылка уже использована".
4. If `expires_at IS NOT NULL AND expires_at < now()` → 410 Gone, "ссылка истекла".
5. Show form: display_name, password, password confirm.
6. On submit:
   - Inside transaction: INSERT user, UPDATE invitation (`accepted_at`, `accepted_by_user_id`), INSERT audit `user.joined`.
   - Create Auth.js session.
   - Redirect to `/contacts`.

**Revoking an invitation:** admin sets `expires_at = now()` from the team screen. Audit: `user.invitation_revoked`.

---

## 8. UI Surface (8 screens)

1. **Login** — email + password form. "Забыли пароль?" link is intentionally absent in Phase 1 (owner resets manually).
2. **Contact list** — main work surface. Table with columns: agent_active checkbox, display_name, email, instagram, niche, country, followers_count, created_at, duplicate badge. Search, sort, filter by `agent_active`. Members see own only; admins/owner see all (with extra `owner_display_name` column).
3. **Contact detail/edit** — full form, all editable fields, soft-delete button, history (last N audit events for this contact).
4. **Excel import** — file upload, file-hash duplicate confirmation modal, then post-upload report screen with four buckets and CSV download for rejections.
5. **Template download** — single button serving `template.xlsx`.
6. **Team** (admin/owner only) — list of users with role/created_at/last_login; list of pending invitations with status; "invite" form (email + role + expiry); "revoke" / "change role" / "deactivate" actions.
7. **Invitation acceptance** — public route `/invite/:token`; displays form for new users to set their display_name and password.
8. **Audit log** (admin/owner only) — paginated chronological table; filters by actor and action.

**Out of UI scope in Phase 1:** profile self-service (password change), forgot-password, dashboards, brief editor, sequences, templates, conversation views, buckets.

---

## 9. Tech Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Framework | Next.js 15+ (App Router) — single process for UI, API routes, and server actions |
| UI | React 19 + Tailwind CSS + shadcn/ui (vendored) |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Auth | Auth.js v5 with Prisma adapter, Credentials provider, Argon2id password hashing |
| Excel | `exceljs` |
| Validation | Zod |
| Logging | Pino (structured JSON to stdout) |
| Tests | Vitest (unit) + Playwright (e2e) |
| CI | GitHub Actions |
| Container | Docker + Docker Compose |

**Deferred (will be added in later phases):** Redis, BullMQ, Resend/SMTP, worker process, Python LLM microservice (only if the TS path proves insufficient).

---

## 10. Repository Layout

```
influenceflow/
├── apps/web/                 # Next.js application (only app in Phase 1)
│   ├── src/
│   │   ├── app/              # App Router pages and layouts
│   │   ├── components/       # React components
│   │   ├── lib/              # db client, auth helpers, utilities
│   │   ├── server/           # business logic (import, dedup, activation, audit)
│   │   └── styles/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── tests/                # Vitest + Playwright
│   └── package.json
├── docs/
│   ├── superpowers/
│   │   ├── specs/            # design documents (this file)
│   │   └── plans/            # implementation plans
│   └── README.md
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .github/workflows/
└── README.md
```

The `apps/web/` layout (rather than a flat repo) anticipates `apps/worker/` in Phase 2 and possibly `services/python-llm/` later. No monorepo tooling (Turborepo, Nx) is added in Phase 1 — too early.

---

## 11. Deployment Model

- **Two containers** in `docker-compose.yml`: `app` (Next.js production build) and `db` (Postgres 16, named volume).
- **Required env vars** (`.env.example` documents each):
  - `DATABASE_URL`
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL`
  - `ADMIN_INIT_EMAIL` — owner email created on first run
- **Bootstrap on first run:**
  - Prisma migrations apply automatically.
  - Seed script creates the workspace and the owner user with a temporary password printed to container logs.
  - Owner logs in, changes password.
- **Healthcheck:** `GET /api/health` returns 200 when DB connection is live.
- **Reverse proxy / TLS:** out of scope for Phase 1; documented in README as the operator's responsibility (recommend Caddy for self-host).

---

## 12. Security Posture

- Passwords stored as Argon2id hashes only.
- Invitation tokens cryptographically random, ≥256 bits entropy.
- All mutating endpoints CSRF-protected (Auth.js default).
- All state-changing actions go through server-side authorization checks. Authorization is the **sole gate**; no client-trusted role.
- Member accessing another user's contact by direct ID returns 404 (not 403) to avoid existence leaks.
- HTTP-only, SameSite=Lax session cookies.
- No secrets in repo. `.env.example` shipped, `.env` gitignored.

---

## 13. Audit Logging Contract

Every mutation listed in §6 (`audit_events.action`) must write a row in the same transaction as the mutation it records. Audit logging failures fail the parent operation. The audit log is append-only — no UPDATE or DELETE on `audit_events` from application code.

---

## 14. Acceptance Criteria

### Functional

**Setup**
- [ ] `docker compose up -d` boots the system from scratch with no manual DB steps.
- [ ] Owner is created on first run with a temporary password visible in container logs.
- [ ] Owner can log in and change password.

**Team management**
- [ ] Admin/owner can invite a new team member via shareable link.
- [ ] Invitation expiry is configurable (number of days OR no-expiry); default is 30 days.
- [ ] Invited user accepts via link, sets password, lands authenticated.
- [ ] Admin/owner can change a user's role or deactivate them.
- [ ] Owner cannot be deleted or demoted (enforced at API and DB).
- [ ] Expired or already-accepted invitation returns 410 with a clear message.

**Contacts**
- [ ] Member sees only their own contacts in lists, search, and direct lookups.
- [ ] Admin/owner sees all contacts with an `owner` column.
- [ ] All contact fields are editable (except system fields).
- [ ] Soft delete hides the contact but preserves the row.

**Import**
- [ ] "Download template" produces a valid `template.xlsx` matching §7.1 column schema.
- [ ] Valid xlsx import processes up to 5000 rows in a single request.
- [ ] Post-import report shows the four buckets (new / own-duplicate / colleague-warning / rejected).
- [ ] Rejected rows are downloadable as CSV with row number, reason, and raw cell values.
- [ ] Re-uploading a file with a previously-seen `file_hash` triggers a confirmation prompt.
- [ ] Invalid email rejects the row; everything else is best-effort.

**Agent flag**
- [ ] `agent_active` is false on every newly created/imported contact.
- [ ] Activating with no conflict succeeds with no extra prompts.
- [ ] Activating when an active duplicate exists for a colleague returns 409 with the colleague's display_name and is denied.
- [ ] Deactivation always succeeds.
- [ ] Concurrent activation attempts on the same email are correctly serialized (only one wins).

**Audit log**
- [ ] Every action listed in §6 generates a row.
- [ ] Admin/owner can paginate the log and filter by actor and action.
- [ ] Members cannot reach the audit log via UI or API.

### Security

- [ ] Member cannot retrieve a colleague's contact by guessing the ID (404).
- [ ] Member cannot toggle `agent_active` on a colleague's contact.
- [ ] Mutations are CSRF-protected.
- [ ] Passwords never appear in logs or audit events.

### Quality gates

- [ ] CI passes: lint, typecheck, unit tests, e2e tests.
- [ ] E2E tests cover at minimum: login, full import flow with all four bucket types, activation conflict.
- [ ] README documents the Docker Compose deploy path end-to-end.
- [ ] `.env.example` lists every required variable with a comment.

### Manual acceptance scenario

> **"Five users, 250 contacts, 12 overlaps":**
> 1. Owner installs the system, invites 5 colleagues.
> 2. Each user fills the template with 50 contacts and imports it.
> 3. The dataset contains 12 cases where the same blogger appears in two different users' files.
> 4. For all 12 cases, the second importer's UI shows a "duplicate with colleague X" badge.
> 5. One user activates the agent flag on a duplicate. A second user attempts to activate the matching duplicate and is blocked, seeing the first user's name.
> 6. Admin opens the audit log and sees the import events, the activation, and the blocked activation attempt in chronological order.
> 7. Owner deactivates one user; the user's contacts remain in the system but the user can no longer log in.

---

## 15. Out of Scope for Phase 1 (Recap)

To keep implementation focused, the following are **explicitly deferred** (covered by future phase specs):

- All outbound email (transactional or marketing): invitation emails, password resets, blogger outreach.
- Email templates, sequences, sending engine.
- Briefs (campaign briefs that drive the agent).
- LLM integration of any kind. The `agent_active` flag is a stored boolean only; nothing reads it in Phase 1.
- Inbox polling, response parsing, classification, conversation buckets.
- Dashboards and analytics.
- Self-service password reset; 2FA; OAuth providers.
- Smart Excel column mapping (rigid template only).
- Public-profile scraping for blogger style adaptation.
- Instagram DM integration.
- Background job runtime (Redis, BullMQ, worker process).
- Multi-tenant signup, billing, public landing.

---

## 16. Glossary

- **Workspace** — the single top-level tenant of an InfluenceFlow installation. Phase 1 has exactly one workspace per deployment.
- **Owner** — the immortal super-admin user of a workspace.
- **Member** — a regular team user, scoped to their own contacts.
- **Contact** — a blogger record in the CRM.
- **Agent flag** (`agent_active`) — boolean per contact indicating eligibility for future LLM-driven outreach. Phase 1 does not act on this flag; it is stored only.
- **Import batch** — one Excel upload event, with summary counts and a rejection report.
- **Brief** — campaign configuration for the agent (deferred to Phase 2; out of scope here).
