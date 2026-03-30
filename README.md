# Courant Translator Employee Onboarding and Timesheet App

This repository contains a production-oriented application scaffold for the Courant translator onboarding and timesheet system.

## Stack

- Next.js 15 with TypeScript
- Clerk for passwordless authentication
- Prisma with PostgreSQL
- Google Drive as the document store via a controlled service layer
- CSV export, audit logging, onboarding workflow, and admin review flows

## What is implemented

- Clerk-ready auth middleware and webhook user sync
- App-level roles and account lifecycle states
- Prisma schema for users, invites, onboarding, documents, audits, timesheets, projects, language pairs, and config
- Admin dashboard for invites, activation, review queue, and exports
- Translator dashboard for onboarding status and timesheet submission
- Multi-line timesheet drafting, editing, and resubmission for the current pay period
- Google Drive upload/access abstraction with Shared Drive assumptions
- In-app document viewer backed by app-authorized Google Drive access
- Audit logging hooks for security-sensitive actions
- Core API routes for invites, onboarding, document upload/access, timesheets, reviews, status changes, and CSV export
- Seed script for default projects, language pairs, pay-period config, and admin records
- Protected job runner endpoint for reminder emails and invite expiry processing
- Status-triggered emails for onboarding submission, timesheet review, account activation, and document resubmission
- Manual document-email fallback flow for Google Drive outages

## Required setup

1. Copy `.env.example` to `.env`.
2. Provision a PostgreSQL database.
3. Create a Clerk app with email magic links enabled.
4. Create a dedicated Google Shared Drive and service account with scoped access.
5. Install dependencies:

```bash
npm install
```

6. Generate Prisma client and run a migration:

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
```

7. Start the app:

```bash
npm run dev
```

8. Run background jobs from a scheduler or manually with the repo-local secret:

```bash
curl -X POST http://localhost:3000/api/jobs/run -H "Authorization: Bearer $JOB_RUNNER_SECRET"
```

9. Optional malware scanning integration:

Set `MALWARE_SCAN_API_URL` and optionally `MALWARE_SCAN_API_KEY`. The app will POST raw file bytes to that endpoint and expect JSON shaped like `{"clean": true}` or `{"clean": false, "threat": "..."}`. Set `MALWARE_SCAN_FAIL_CLOSED=true` if scanning outages should quarantine uploads instead of allowing them through.

## Security notes

- Keep Google Drive membership limited to Kevin, David, and the app integration identity.
- Do not expose broad Drive links to translators.
- Require MFA for admin Workspace and Clerk accounts.
- Configure a real malware scanning endpoint and set `MALWARE_SCAN_FAIL_CLOSED=true` before production launch if you want scan outages to block uploads.
- Wire a real email sender domain and DNS records before live invite or sign-in traffic.

## Known follow-up work

- Add richer multi-line-item timesheet editing in the UI
- Add inline translator document viewing without redirecting to Drive
- Replace the stubbed malware-scan hook with a real scanning/quarantine provider
- Add end-to-end tests once credentials and local services are configured
