# Courant Translator Employee Onboarding and Timesheet App

### TL;DR

Courant's current translator onboarding and time-tracking process is a mess of emails, PDFs, and spreadsheets. Kevin and David (the two co-founders running operations) lose hours every week chasing documents and reconciling hours. This app replaces all of that with a single mobile-friendly web app where translators self-onboard (upload docs, sign agreements, fill out tax forms) and submit weekly timesheets. Admins get a dashboard to review, approve, and export everything. That's it. No payroll integration, no job assignment, no client portal — just onboarding and timesheets, done well.

This doc is written for an LLM or developer who will vibe-code this thing. It's meant to be direct, specific, and honest about edge cases and tradeoffs. Read the whole thing before generating anything.

---

## Goals

### What We're Trying to Accomplish

1. **Cut onboarding time in half.** Right now it takes days/weeks of back-and-forth email. Target: a translator can finish everything in one sitting, under 30 minutes.
2. **100% timesheet compliance.** Every active translator submits on time every pay period. Currently people just forget and Kevin has to chase them.
3. **Save Kevin and David 5+ hours per week** they currently spend on manual document wrangling and spreadsheet reconciliation.
4. **Single source of truth.** All translator records, documents, and timesheet history in one place, searchable by admin.
5. **Support scaling to 50+ translators** without linearly increasing admin work. The system should handle up to \~500 users without re-architecture, but the near-term ceiling is probably 50–100.

### What Translators Get

* Self-service onboarding in under 30 minutes, guided step-by-step, with clear progress indication.
* Timesheet entry that takes under 2 minutes (project and language pair pre-populated from dropdowns).
* Visibility into their own records: submitted timesheets, approval status, onboarding completion.
* Zero ambiguity about what's still needed from them.

### What This App Is NOT

Be really clear about these boundaries:

* **Not a payroll system.** No pay calculations, no check generation, no payroll provider integration. Approved timesheets get exported as CSV for manual payroll processing. That's the handoff point.
* **Not a translation management system.** No job assignment, no translation file tracking, no delivery workflows.
* **Not client-facing.** No portal for Courant's end clients. Internal ops only.

---

## Users and Roles

There are exactly two roles:

| Role | Who | What They Can See |
| --- | --- | --- |
| **Translator** | Freelance or employee translators (the people doing translation work) | Only their own profile, documents, and timesheets |
| **Admin** | Kevin and David (co-founders) | Everything — all translators, all timesheets, all documents |

**Assumption:** There's no "manager" or "reviewer" role. Kevin and David are the only admins for the foreseeable future. If this changes, you'd need to revisit role-based access, but don't over-engineer it now.

---

## User Stories

### Translator

* I receive an onboarding invite via email (a unique link). I don't need to call or email anyone to get started.
* I complete all required forms and document uploads in one guided flow without missing anything or losing progress.
* I see a clear progress indicator so I know how many steps remain.
* I submit my weekly timesheet by selecting a project, language pair, and entering hours — fast and obvious.
* I can view my past timesheets and their approval status anytime.

### Admin (Kevin & David)

* I invite a new translator by entering their email. The system handles the rest.
* I see a dashboard of all translators with their onboarding completion status, so I know who needs follow-up at a glance.
* I review and approve or reject submitted timesheets (reject requires a comment explaining why).
* I get notified when a translator completes onboarding or submits a timesheet, so I don't have to poll the dashboard.
* I export approved timesheet data as CSV for a selected date range to feed into our existing payroll workflow.

---

## Functional Requirements

### Onboarding Module (High Priority)

* **Invite system:** Admin enters translator's email → system sends a unique onboarding link. The link should be single-use and tied to that email.
* **Profile creation:** Translator fills in: full legal name, preferred name, email, phone, mailing address, language pairs (multi-select from admin-managed list), years of experience, certifications.
* **Document upload:** Required documents are:
  * Employee contract
  * Services confidentiality agreement
  * Tax File Number Declaration Form
  * Superannuation details form
  * Letter of consent from Super Fund All documents: PDF, JPG, or PNG only. Max 10 MB per file. Inline error on type/size validation failure. Thumbnail/filename preview on successful upload. Provide “download blank form” link where applicable—especially for the TFN and Super forms if available. All uploads go direct to company Google Drive (service account/API); nothing stored in DB except the Drive reference (ID/link). If Drive integration fails, user can tick a box to declare docs have been emailed. Completion of onboarding blocked unless all required docs are present or declared as sent by email. Admins and user can view their own docs; all doc upload/view/download events are logged and timestamped.

Tradeoff: No support for government-issued ID or US-based tax forms—everything follows Australian requirements as listed. Make all doc upload steps required except if Drive fails, in which case the declaration/tickbox suffices. Accept only PDF/JPG/PNG and max 10MB. No partial uploads accepted.

* **E-signature:** Contractor agreement and NDA displayed inline (scrollable). Translator checks "I agree" and provides a signature (typed name or drawn). Capture timestamp and IP address for legal defensibility. Store signed copies accessible to both translator and admin.
* **Progress tracker:** Visual progress bar — gray (not started), blue (in progress), green (complete). Numbered checklist of steps.
* **Status management:** Admin can mark onboarding complete, request resubmission of a specific document (with a comment), or archive/deactivate a translator.

**Implicit business rules to be aware of:**

* A translator cannot access the timesheet section until an admin explicitly activates their account (after reviewing onboarding docs). This is a manual gate, not automatic.
* If onboarding isn't completed within 7 days, send an automatic reminder email. After 30 days, expire the invitation and notify the admin. Expired translators would need a fresh invite.

### Timesheet Module (High Priority)

* **Entry form:** Translator selects the pay period (default to current), then adds line items. Each line item: project/client (dropdown, admin-managed), language pair (dropdown), hours worked (numeric), optional note (free text). Multiple line items per submission allowed.
* **Running total** of hours displayed at the bottom of the form.
* **Submission:** Prominent "Submit" button. On submit, show a confirmation modal ("Timesheet submitted for \[date range\]. You'll be notified once it's reviewed.") and send a confirmation email.
* **Edit/resubmit:** Translator can edit a timesheet before admin approval. After rejection, translator can revise and resubmit.
* **Timesheet history:** List of all past submissions with status: Draft, Submitted (Pending), Approved, Rejected.
* **Duplicate guard:** Prevent submitting a timesheet for a pay period that already has an approved entry — unless the admin has explicitly reopened it. This is important; without it, you'll get double submissions.

**Tradeoff note:** "Pay period" is assumed to be weekly. The spec doesn't define whether it's Mon–Sun or some other range. Kevin and David need to decide this. Hard-code it for now and make it a config value if possible.

### Admin Panel (High Priority)

* **Translator dashboard:** Filterable/sortable list of all translators. Columns: name, onboarding status (invited / in-progress / complete / active / inactive), last timesheet submitted date. Filter by status.
* **Timesheet review queue:** List of pending timesheets. Each shows translator name, period, total hours. Expandable to show line-item detail. One-click "Approve." "Reject" requires a comment (the comment goes to the translator via email).
* **Document viewer:** View uploaded documents inline in the browser without downloading. This means rendering PDFs and images in an iframe or viewer component.
* **CSV export:** Select a date range → export all approved timesheets as CSV. The format should match Kevin and David's existing payroll spreadsheet. **You need to ask them for the exact column format.** Sensible default: translator name, email, period start, period end, project/client, language pair, hours, notes.

### Notifications & Reminders (Medium Priority)

Automated emails for:

* Onboarding invitation (with unique link)
* Onboarding completion (to admin)
* Timesheet submission confirmation (to translator)
* Timesheet approved (to translator)
* Timesheet rejected (to translator, includes admin's comment and link to revise)
* Overdue timesheet reminder (to translator if not submitted by configurable deadline, e.g., Monday at 9 AM)

**Use a real transactional email provider** (SendGrid, Postmark, Resend, etc.). Do not use raw SMTP. Set up SPF/DKIM or your magic links will land in spam.

### Authentication (High Priority)

* **Magic link (passwordless) login recommended.** Translator enters email, gets a link, clicks it, they're in. This avoids password reset flows and reduces support burden. Session-based or JWT, either is fine.
* Two roles: Translator and Admin. Role determined at account creation and stored on the user record.
* Translators see only their own data. Admins see everything. Enforce this at the API level, not just the UI.

---

## User Experience Flow

### Onboarding (New Translator)

1. Admin enters translator's email in the admin panel → system sends invite email with unique link.
2. Translator clicks link → opens in mobile browser (mobile-first design). Prompted to create an account with their email.
3. After account creation, translator lands on the **Onboarding Checklist** — numbered steps with progress bar.
4. Brief welcome message from Kevin and David: what to expect, estimated time (\~20–30 minutes).
5. **Step 1: Profile info.** Required fields enforced, email format validated, at least one language pair required. On completion, green checkmark, progress bar advances.
6. **Step 2: Document uploads.** List of required docs with descriptions and helpful links (e.g., blank W-9). Drag-and-drop or tap-to-upload. File type/size validation with inline errors. Thumbnail preview on success.
7. **Step 3: Contractor Agreement & NDA.** Displayed inline. "I agree" checkbox + signature field. Timestamp and IP captured.
8. **Step 4: Confirmation screen.** "You're all set! Kevin or David will review your documents and activate your account shortly." Admin gets notified.
9. Admin reviews documents inline, activates the translator.
10. Translator can now access Timesheets.

### Timesheet Submission

1. Translator opens app → Timesheet section defaults to current pay period.
2. Add line items: select project/client, language pair, enter hours, optional note.
3. See running total. Hit "Submit."
4. Confirmation modal + email receipt.
5. Admin sees it in the review queue. Approve (one click) or Reject (with comment).
6. Translator gets notified either way. On rejection, they can revise and resubmit.

### Edge Cases — Don't Skip These

* **Incomplete onboarding timeout:** 7-day reminder email. 30-day expiration. Admin notified on expiration.
* **Duplicate timesheet submission:** Block if approved entry exists for that period, unless admin has reopened it.
* **Connectivity loss during upload:** Show clear error, prompt retry. **Auto-save form state on field blur** so partially completed forms aren't lost. (Note: auto-save on blur introduces complexity around partial/invalid data and potential race conditions. Keep it simple — debounce saves, store to local storage or a server-side draft, don't try to be clever.)
* **Admin deactivation:** Deactivating a translator hides the timesheet section from their view and grays them out on the admin dashboard. Their historical data is preserved.
* **All destructive actions (reject timesheet, deactivate translator) require confirmation modals.**

---

## Data Models

These are the core entities. Adjust column names to your ORM conventions.

**User**

* `id`, `email`, `name`, `preferred_name`, `role` (translator | admin), `status` (invited | onboarding | active | inactive), `phone`, `mailing_address`, `language_pairs` (array or join table), `years_of_experience`, `created_at`, `updated_at`

**OnboardingSubmission**

* `id`, `user_id`, `step_statuses` (JSON or individual boolean columns for each step), `e_signature_data` (typed name, timestamp, IP), `completed_at`

**Document**

* `id`, `user_id`, `type` (w9 | w8ben | government_id | contractor_agreement | nda | certification), `file_url`, `status` (uploaded | accepted | resubmission_requested), `admin_comment`, `uploaded_at`

**Timesheet**

* `id`, `user_id`, `period_start`, `period_end`, `status` (draft | submitted | approved | rejected), `admin_comment`, `submitted_at`, `reviewed_at`

**TimesheetLineItem**

* `id`, `timesheet_id`, `project_client` (string or FK to a projects table), `language_pair`, `hours` (decimal), `note`

**Index on:** `Timesheet.user_id`, `Timesheet.period_start`, `Timesheet.period_end`, `Timesheet.status`.

---

## Technical Considerations

* **Front-end:** Responsive web app, mobile-first. No native app for MVP. Component-based (React, Vue, Svelte — whatever the vibe coder prefers). Needs: form handling, file upload (direct-to-storage preferred to avoid backend bottlenecks), role-based view rendering.
* **Back-end:** RESTful API. Handles auth, onboarding workflow state, timesheet CRUD, file storage references, notification triggers. Keep it straightforward.
* **File storage:** Use encrypted cloud storage (S3 with SSE or equivalent). Documents contain high-value PII (government IDs, tax forms). Access restricted to authenticated admin and the owning translator. Log all document views and downloads.
* **PII handling:** Encrypt PII at rest in the database. Include a privacy notice during onboarding. Maintain access audit logs.
* **E-signature:** Capture timestamp, IP, consent checkbox, and the signature itself. This needs to be legally defensible. Consider using a lightweight e-signature library rather than rolling your own, but a custom implementation that captures these data points is also fine for an MVP.
* **Email:** Use a reputable transactional provider. Set up SPF/DKIM/DMARC. Magic links must reliably reach inboxes.
* **WCAG 2.1 AA compliance:** High-contrast text, accessible form labels, keyboard navigable. Do this from the start — retrofitting accessibility is painful.
* **Performance targets:** Pages load in ≤ 2 seconds on 3G. 99.5% uptime. File upload success rate ≥ 99%.

---

## Analytics / Tracking Events

Implement these events for measuring success and debugging:

* `onboarding_invite_sent` — admin sends invite (translator email, timestamp)
* `onboarding_step_completed` — translator completes a step (step name, timestamp)
* `onboarding_completed` — translator finishes all steps
* `onboarding_activated` — admin activates translator account
* `timesheet_created` — translator starts a new timesheet
* `timesheet_submitted` — translator submits (period, total hours)
* `timesheet_approved` / `timesheet_rejected` — admin action
* `csv_exported` — admin exports data
* `reminder_email_sent` — system sends reminder
* `document_uploaded` — translator uploads a file (type, size)

---

## Success Metrics

| Metric | Target | How to Measure |
| --- | --- | --- |
| Onboarding completion rate | ≥ 90% complete within 7 days | Completions / invites sent |
| Average onboarding time | ≤ 30 min | Timestamp: invite opened → onboarding submitted |
| Timesheet submission rate | 100% of active translators on time | Submissions / active translators per period |
| Admin time on onboarding + timesheets | Down ≥ 5 hrs/week | Kevin & David self-report before/after |
| Payroll errors from timesheets | Zero | Count payroll corrections per quarter |
| Time from invite to active | ≤ 3 business days | Invite sent → admin activation timestamp |

---

## Build Phases

**Estimated total: 3–4 weeks** with one full-stack developer. Kevin or David act as product owner (provide requirements, test, give design direction).

### Phase 1: Auth & Admin Foundation (5 days)

* Magic link auth, role-based access, user data model + API
* Admin dashboard skeleton, translator invite flow
* **Blockers:** Need email service account and cloud storage bucket set up before starting

### Phase 2: Onboarding Flow (5 days)

* Full translator onboarding: profile form, document upload with validation, e-signature, progress tracker
* Admin side: document viewer, onboarding status on dashboard, activation toggle
* **Test with 1–2 real translators** as beta
* **Depends on:** Phase 1 complete

### Phase 3: Timesheet Module (4 days)

* Timesheet entry form, line items, submission + confirmation, history view
* Admin review queue: approve/reject with comments, CSV export
* **Need from Kevin/David:** Exact CSV column format for payroll, and the pay period definition (which day of the week does it start/end?)
* **Depends on:** Phase 1 auth; active translator accounts from Phase 2

### Phase 4: Notifications, Polish & Launch (3 days)

* All email notifications and reminders
* Auto-save for onboarding forms
* Responsive design QA, bug fixes, accessibility pass
* Soft launch with full translator pool
* **Depends on:** Phases 1–3 complete, email templates approved by Kevin/David