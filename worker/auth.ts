import { importSPKI, jwtVerify } from "jose";
import type { Env, User } from "./types";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type ClerkUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string; verification?: { status?: string } }[];
};

let cachedPem = "";
let cachedKey: Awaited<ReturnType<typeof importSPKI>> | null = null;

async function jwtKey(pem: string) {
  const normalized = pem.replaceAll("\\n", "\n");
  if (!cachedKey || cachedPem !== normalized) {
    cachedKey = await importSPKI(normalized, "RS256");
    cachedPem = normalized;
  }
  return cachedKey;
}

async function clerkUser(env: Env, id: string): Promise<{ email: string; first: string; last: string }> {
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` }
  });
  if (!response.ok) throw new HttpError(503, "Could not verify your account with the sign-in provider.");
  const identity = await response.json() as ClerkUser;
  const primary = identity.email_addresses.find((address) => address.id === identity.primary_email_address_id);
  if (!primary || primary.verification?.status !== "verified") throw new HttpError(403, "A verified email address is required.");
  return { email: primary.email_address.toLowerCase(), first: identity.first_name ?? "", last: identity.last_name ?? "" };
}

export async function currentUser(request: Request, env: Env): Promise<User> {
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "");
  if (!match) throw new HttpError(401, "Sign in is required.");
  let clerkId: string;
  try {
    const key = await jwtKey(env.CLERK_JWT_KEY);
    const { payload } = await jwtVerify(match[1], key, { algorithms: ["RS256"], requiredClaims: ["exp", "nbf", "sub"] });
    if (payload.azp && payload.azp !== env.APP_URL) throw new Error("Invalid authorized party.");
    if (typeof payload.sub !== "string" || !payload.sub.startsWith("user_")) throw new Error("Invalid user ID.");
    clerkId = payload.sub;
  } catch {
    throw new HttpError(401, "Your session has expired. Sign in again.");
  }

  const existing = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(clerkId).first<User>();
  if (existing) {
    if (existing.role === "ADMIN") {
      const identity = await clerkUser(env, clerkId);
      const allowed = (env.ADMIN_EMAILS ?? "").split(",").map((part) => part.trim().toLowerCase()).includes(identity.email);
      if (!allowed || identity.email !== existing.email) throw new HttpError(403, "Admin account configuration has changed. Contact the site owner.");
    }
    return existing;
  }

  const identity = await clerkUser(env, clerkId);
  const admins = (env.ADMIN_EMAILS ?? "").split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  const admin = admins.includes(identity.email);
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, legal_first_name, surname, nickname, role, status, myob_card_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)")
    .bind(clerkId, identity.email, identity.first, identity.last, "", admin ? "ADMIN" : "TRANSLATOR", admin ? "ACTIVE" : "PENDING", now, now).run();
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(clerkId).first<User>();
  if (!user) throw new HttpError(409, "This email is already registered to another account.");
  return user;
}

export function requireActive(user: User): void {
  if (user.status !== "ACTIVE") throw new HttpError(403, "Your account is awaiting admin activation.");
}

export function requireAdmin(user: User): void {
  if (user.role !== "ADMIN" || user.status !== "ACTIVE") throw new HttpError(403, "Admin access is required.");
}
