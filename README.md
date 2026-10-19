# Courant Translator Roster

A small, mobile-friendly roster and timesheet app for translators. Translators sign up with email, wait for one of two admins to activate them, see their shifts, and submit actual hours and expenses. Admins roster shifts, review hours, spot missing timesheets, and export approved work for MYOB Business.

## What it does

- Roster shifts in 15-minute steps, including shifts that cross midnight.
- Prefill each timesheet with rostered times. Translators can correct and resubmit until approval.
- Record paid time with no break deduction. Split actual hours at Sydney midnight so only Sunday hours use the Sunday payroll category.
- Record multiple expenses per shift, each with a date, short description, amount, and “receipt sent to David or an admin” confirmation. Receipts are not uploaded.
- Show unsubmitted shifts in the admin dashboard from 9am Sydney time the morning after the shift ends.
- Show approved lifetime hours by translator, with Standard and Sunday totals.
- Export an approved-hours CSV, a separate approved-expenses CSV, and a tab-delimited MYOB Business timesheet import file.

The application stores names, email addresses, rosters, worked hours, and expense records. It does not store tax file numbers, bank details, employee contracts, or receipt files.

## Stack and cost

- React + Vite frontend and API on one Cloudflare Worker.
- Cloudflare D1 SQLite database.
- Clerk email authentication.

The app can start on the Cloudflare Workers Free plan and Clerk's free authentication plan. Cloudflare Workers Paid is currently **USD $5/month** and offers more generous limits and longer D1 recovery history. A `workers.dev` address avoids a domain purchase. Confirm current terms and quotas before launch: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Clerk pricing](https://clerk.com/pricing).

## Local setup

All dependencies are installed inside this repository. No global npm package installation is needed.

1. Install dependencies: `npm install --cache .npm-cache`.
2. Create a Clerk application with email sign-up and email verification. Copy `.env.example` to `.env` and set its publishable key.
3. Copy `.dev.vars.example` to `.dev.vars`. Add the Clerk secret key and PEM JWT public key from the Clerk dashboard. Set `ADMIN_EMAILS` to the **two exact email addresses** allowed to administer the app. Keep these files out of Git.
4. Apply the local database migration: `npm run db:migrate:local`.
5. Start locally: `npm run dev`.
6. Sign up with an admin email. Admin accounts are activated automatically. Other sign-ups wait for activation.

To inspect the interface before configuring Clerk, run `npm run dev` and open `http://localhost:5173/?demo=admin` or `http://localhost:5173/?demo=translator`. This local development preview uses fictional data and does not save changes. It is unavailable on a production build.

If you develop on Windows in a restricted sandbox, set `XDG_CONFIG_HOME` to a writable project-local directory before running Wrangler. The project `.wrangler` and `.wrangler-config` directories are ignored by Git.

## Production setup

1. Create a Cloudflare account and authenticate Wrangler locally with `npx wrangler login`.
2. Run `npx wrangler d1 create translator-roster`. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with the returned database ID.
3. Set `VITE_CLERK_PUBLISHABLE_KEY` in the build environment. Configure Clerk for the production `workers.dev` URL or your custom domain.
4. Add Worker secrets with `npx wrangler secret put CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `ADMIN_EMAILS`, and `APP_URL`. `APP_URL` must be the exact public origin, such as `https://translator-roster.example.workers.dev`.
5. Run `npm run db:migrate:remote` and `npm run deploy`.
6. Sign in as one of the configured admins, activate translators, enter their MYOB card IDs, and set the Standard and Sunday payroll category names to exactly match MYOB.

Do not run the remote migration against an existing database without checking whether it contains live data. This repository had no local `.env` or Prisma migrations when rebuilt; no existing remote database was changed.

## MYOB exports

The **MYOB timesheets** download follows MYOB Business's documented timesheet import shape: a first row containing `{}`, a tab-separated header, employee name and card ID, payroll category, date, and decimal hours. Standard and Sunday parts of an overnight shift become separate entries. Match the two category names in the admin Export tab to your MYOB pay items. See [MYOB importing timesheets](https://www.myob.com/au/support/myob-business/import-export/importing-data/importing-timesheets).

The **expenses CSV** is a reimbursement review file, not a MYOB timesheet import. Reimbursements are handled separately in MYOB: [MYOB reimbursing an employee](https://www.myob.com/au/support/myob-business/payroll/reimbursing-an-employee). Review the expense file and receipt confirmations before paying. Import each timesheet period into MYOB only once to avoid duplicate hours.

## Checks

Run `npm test` for session-token checks and Sydney overnight, Sunday, daylight-saving, and missing-timesheet calculations. Run `npm run build` for TypeScript and production bundling. `npm audit --cache .npm-cache` checks installed packages.
