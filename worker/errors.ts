import type { Env, User } from "./types";

// Every failure leaves a durable, machine-readable row behind. The point is that an agent (or a
// future maintainer) can read the log and reconstruct what broke without replaying a request.
// Records are deliberately small, secret-free and cheap: this path must never throw.

export type ErrorLevel = "warn" | "error";

export type ErrorRecord = {
  id: string;
  created_at: string;
  level: ErrorLevel;
  status: number;
  method: string;
  path: string;
  code: string;
  message: string;
  stack: string;
  user_id: string;
  user_email: string;
  request_id: string;
  details_json: string;
};

const LIMITS = { path: 300, code: 120, message: 1000, stack: 4000, email: 200 };

// Tokens, bearer headers and obviously secret-looking values are stripped before storage.
const REDACTIONS: [RegExp, string][] = [
  // Key/value forms go first so "Authorization: Bearer x" is replaced as a whole.
  [/(CLERK_SECRET_KEY|CLERK_JWT_KEY|ADMIN_EMAILS|Authorization)(["']?\s*[:=]\s*["']?)[^"'\r\n]+/gi, "$1$2[redacted]"],
  [/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[redacted]"],
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "[redacted-key]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, "[redacted-jwt]"]
];

export function redact(value: string): string {
  let output = value;
  for (const [pattern, replacement] of REDACTIONS) output = output.replace(pattern, replacement);
  return output;
}

function clip(value: unknown, max: number): string {
  return redact(String(value ?? "")).trim().slice(0, max);
}

// 4xx responses are logged too — a rejected timesheet or a bad export range is exactly the kind of
// thing worth auditing — except the three that are pure noise: not signed in, not allowed, not found.
export function shouldLog(status: number): boolean {
  if (status >= 500) return true;
  if (status < 400) return false;
  return ![401, 403, 404].includes(status);
}

export function buildErrorRecord(input: {
  request: Request;
  error: unknown;
  status: number;
  requestId: string;
  user?: User | null;
  now?: Date;
}): ErrorRecord {
  const { request, error, status, requestId, user } = input;
  const isError = error instanceof Error ? error : null;
  const url = new URL(request.url);
  return {
    id: crypto.randomUUID(),
    created_at: (input.now ?? new Date()).toISOString(),
    level: status >= 500 ? "error" : "warn",
    status,
    method: request.method,
    path: clip(url.pathname, LIMITS.path),
    code: clip(isError?.name ?? (error === undefined ? "UnknownError" : typeof error), LIMITS.code),
    message: clip(isError?.message ?? String(error), LIMITS.message),
    stack: clip(isError?.stack ?? "", LIMITS.stack),
    user_id: clip(user?.id, 80),
    user_email: clip(user?.email, LIMITS.email),
    request_id: requestId,
    details_json: JSON.stringify({
      search: clip(url.search, LIMITS.path),
      role: user?.role ?? "",
      account: user?.status ?? ""
    })
  };
}

export async function recordError(env: Env, record: ErrorRecord): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO error_logs(id, created_at, level, status, method, path, code, message, stack, user_id, user_email, request_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      record.id, record.created_at, record.level, record.status, record.method, record.path,
      record.code, record.message, record.stack, record.user_id, record.user_email,
      record.request_id, record.details_json
    ).run();
  } catch (cause) {
    // Never let logging break the response. The console copy is the fallback for wrangler tail.
    console.error("error_logs insert failed", cause instanceof Error ? cause.message : cause);
  }
}

export async function logFailure(env: Env, input: Parameters<typeof buildErrorRecord>[0]): Promise<ErrorRecord | null> {
  if (!shouldLog(input.status)) return null;
  const record = buildErrorRecord(input);
  console.error(JSON.stringify({ level: record.level, status: record.status, path: record.path, code: record.code, message: record.message, request_id: record.request_id }));
  await recordError(env, record);
  return record;
}
