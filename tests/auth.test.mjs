import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { currentUser } from "../worker/auth.ts";

// Just enough of D1 over node:sqlite to run the real migrations and queries.
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${file}`, "utf8"));
  const bound = (statement, args) => ({ first: async () => statement.get(...args) ?? null, run: async () => statement.run(...args), all: async () => ({ results: statement.all(...args) }) });
  return { db, DB: { prepare: (sql) => { const statement = db.prepare(sql); return { bind: (...args) => bound(statement, args), ...bound(statement, []) }; } } };
}

describe("API authentication", () => {
  it("requires a signed Clerk token from the configured app origin", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const user = { id: "user_test", email: "translator@example.com", role: "TRANSLATOR", status: "ACTIVE" };
    const env = {
      CLERK_JWT_KEY: await exportSPKI(publicKey), APP_URL: "https://roster.example.com",
      DB: { prepare: () => ({ bind: () => ({ first: async () => user }) }) }
    };
    const token = await new SignJWT({ azp: env.APP_URL }).setProtectedHeader({ alg: "RS256" }).setSubject(user.id)
      .setIssuedAt().setNotBefore("0s").setExpirationTime("5m").sign(privateKey);
    const request = new Request("https://roster.example.com/api/me", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await currentUser(request, env)).id, user.id);
    await assert.rejects(currentUser(new Request("https://roster.example.com/api/me"), env), { status: 401 });
    const otherOriginToken = await new SignJWT({ azp: "https://other.example.com" }).setProtectedHeader({ alg: "RS256" }).setSubject(user.id)
      .setIssuedAt().setNotBefore("0s").setExpirationTime("5m").sign(privateKey);
    await assert.rejects(currentUser(new Request("https://roster.example.com/api/me", { headers: { Authorization: `Bearer ${otherOriginToken}` } }), env), { status: 401 });
  });

  it("lets a person added by a roster import claim their row and shifts on first sign-in", async (t) => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const { db, DB } = database();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO users (id, clerk_id, email, role, status, created_at, updated_at) VALUES ('admin-1', 'user_admin', 'david@example.com', 'ADMIN', 'ACTIVE', ?, ?)").run(now, now);
    db.prepare("INSERT INTO users (id, clerk_id, email, legal_first_name, surname, role, status, created_at, updated_at) VALUES ('invited-1', NULL, 'ada@example.com', 'Ada', 'Lim', 'TRANSLATOR', 'ACTIVE', ?, ?)").run(now, now);
    db.prepare("INSERT INTO shifts (id, user_id, start_at, end_at, created_by, created_at, updated_at) VALUES ('shift-1', 'invited-1', '2026-09-22T01:00:00Z', '2026-09-22T13:30:00Z', 'admin-1', ?, ?)").run(now, now);
    const identities = { user_ada: "Ada@Example.com", user_new: "new@example.com" };
    t.mock.method(globalThis, "fetch", async (url) => {
      const id = String(url).split("/").pop();
      return Response.json({ id, first_name: "Clerk", last_name: "Name", primary_email_address_id: "e1", email_addresses: [{ id: "e1", email_address: identities[id], verification: { status: "verified" } }] });
    });
    const env = { CLERK_JWT_KEY: await exportSPKI(publicKey), CLERK_SECRET_KEY: "sk_test", ADMIN_EMAILS: "david@example.com,kevin@example.com", APP_URL: "https://roster.example.com", DB };
    const signIn = async (sub) => currentUser(new Request("https://roster.example.com/api/me", { headers: {
      Authorization: `Bearer ${await new SignJWT({ azp: env.APP_URL }).setProtectedHeader({ alg: "RS256" }).setSubject(sub).setIssuedAt().setNotBefore("0s").setExpirationTime("5m").sign(privateKey)}`
    } }), env);

    const ada = await signIn("user_ada");
    assert.deepEqual([ada.id, ada.clerk_id, ada.status, ada.legal_first_name], ["invited-1", "user_ada", "ACTIVE", "Ada"]);
    assert.equal((await signIn("user_ada")).id, "invited-1");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'ada@example.com'").get().n, 1);
    const stranger = await signIn("user_new");
    assert.deepEqual([stranger.id, stranger.clerk_id, stranger.status], ["user_new", "user_new", "PENDING"]);
  });
});
