#!/usr/bin/env node
// Preflight for deployment: catches the placeholder that silently ships a broken Worker.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const problems = [];
const notes = [];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const wrangler = readJson(resolve(root, "wrangler.jsonc"));

if (!wrangler) {
  problems.push("wrangler.jsonc is missing or is not valid JSON.");
} else {
  const databases = wrangler.d1_databases ?? [];
  if (databases.length === 0) problems.push("wrangler.jsonc has no d1_databases entry.");
  for (const database of databases) {
    if (!database.database_id || database.database_id === "REPLACE_WITH_D1_DATABASE_ID") {
      problems.push(`D1 database "${database.database_name}" still has the placeholder ID. Run "npx wrangler d1 create ${database.database_name}" and paste the returned ID into wrangler.jsonc.`);
    }
  }
}

const publishable = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
if (!publishable) {
  notes.push("VITE_CLERK_PUBLISHABLE_KEY is not set. Set it in the build environment, or the app shows the setup screen instead of sign-in.");
} else if (publishable.includes("replace_me")) {
  problems.push("VITE_CLERK_PUBLISHABLE_KEY still looks like a placeholder.");
}

const devVars = resolve(root, ".dev.vars");
if (!existsSync(devVars)) {
  notes.push(".dev.vars is absent, so local development has no Clerk secret key, JWT key or ADMIN_EMAILS.");
} else {
  const vars = readFileSync(devVars, "utf8");
  for (const key of ["CLERK_SECRET_KEY", "CLERK_JWT_KEY"]) {
    if (!new RegExp(`^${key}\\s*=\\s*\\S`, "m").test(vars)) notes.push(`.dev.vars has no value for ${key}, so sign-in will fail locally.`);
  }

  // ADMIN_EMAILS is the whole authorisation model: admins are auto-activated by matching it, and
  // everyone else waits for one. The app expects exactly two, so a typo here locks the wrong
  // person out or lets a third admin in silently.
  const adminLine = vars.match(/^ADMIN_EMAILS\s*=\s*(.*)$/m);
  // Wrangler strips surrounding quotes from .dev.vars values, so check the value it will see.
  const adminValue = adminLine ? adminLine[1].trim().replace(/^(["'])(.*)\1$/, "$2") : "";
  const legalEmail = /^[^@\s,"']+@[^@\s,"']+\.[^@\s,"']+$/;
  if (!adminValue.trim()) {
    problems.push(".dev.vars has no ADMIN_EMAILS value. Set the two admin email addresses, comma-separated.");
  } else {
    const admins = adminValue.split(",").map((part) => part.trim()).filter(Boolean);
    const invalid = admins.filter((email) => !legalEmail.test(email));
    let adminsOk = true;
    if (invalid.length) { problems.push(`ADMIN_EMAILS contains invalid addresses: ${invalid.join(", ")}.`); adminsOk = false; }
    if (admins.length !== 2) { problems.push(`ADMIN_EMAILS should list exactly two admins; found ${admins.length}.`); adminsOk = false; }
    if (new Set(admins.map((email) => email.toLowerCase())).size !== admins.length) { problems.push("ADMIN_EMAILS lists the same address twice."); adminsOk = false; }
    if (adminsOk) notes.push(`ADMIN_EMAILS: ${admins.length} admins (${admins.join(", ")}) — both must match the Clerk accounts exactly.`);
  }
}

if (process.env.VITE_DEMO === "true") {
  notes.push("VITE_DEMO=true is set: this build will serve the fictional demo at /?demo=admin without any sign-in.");
}

for (const note of notes) console.log(`note: ${note}`);
if (problems.length) {
  for (const problem of problems) console.error(`problem: ${problem}`);
  console.error(`\n${problems.length} blocking problem(s). Deployment would not work yet.`);
  process.exit(1);
}
console.log("Configuration looks deployable.");
