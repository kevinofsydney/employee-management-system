import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { currentUser } from "../worker/auth.ts";

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
});
