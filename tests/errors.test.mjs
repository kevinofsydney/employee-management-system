import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RETENTION_DAYS, buildErrorRecord, pruneErrorLogs, redact, retentionCutoff, retentionDays, shouldLog } from "../worker/errors.ts";

const request = (path = "/api/my/timesheets?shiftId=abc", method = "POST") => new Request(`https://roster.example.com${path}`, { method });

function fakeDb(changes) {
  const calls = [];
  let index = 0;
  return {
    calls,
    prepare(sql) {
      return {
        bind(value) {
          calls.push({ sql, value });
          return {
            async run() {
              const next = changes[index++];
              if (next === "throw") throw new Error("d1 unavailable");
              return { meta: { changes: next ?? 0 } };
            }
          };
        }
      };
    }
  };
}

describe("Error logging", () => {
  it("logs server faults and rejected requests, but not auth or not-found noise", () => {
    assert.equal(shouldLog(500), true);
    assert.equal(shouldLog(503), true);
    assert.equal(shouldLog(400), true);
    assert.equal(shouldLog(409), true);
    assert.equal(shouldLog(401), false);
    assert.equal(shouldLog(403), false);
    assert.equal(shouldLog(404), false);
    assert.equal(shouldLog(200), false);
  });

  it("redacts tokens that leak into a message", () => {
    assert.equal(redact("failed with Bearer abc123def456"), "failed with Bearer [redacted]");
    assert.equal(redact("key sk-live-1234567890 rejected"), "key [redacted-key] rejected");
    assert.equal(redact('{"Authorization":"Bearer xyz"}'), '{"Authorization":"[redacted]"}');
    assert.equal(redact("nothing to hide"), "nothing to hide");
  });

  it("classifies severity from the status code and keeps the request identity", () => {
    const server = buildErrorRecord({ request: request(), error: new Error("boom"), status: 500, requestId: "req-1" });
    assert.equal(server.level, "error");
    assert.equal(server.code, "Error");
    assert.equal(server.message, "boom");
    assert.equal(server.method, "POST");
    assert.equal(server.path, "/api/my/timesheets");
    assert.equal(server.request_id, "req-1");
    assert.match(server.details_json, /shiftId=abc/);

    const client = buildErrorRecord({ request: request("/api/admin/export?kind=myob"), error: new Error("Invalid date range."), status: 400, requestId: "req-2" });
    assert.equal(client.level, "warn");
    assert.equal(client.message, "Invalid date range.");
  });

  it("records who was acting, when known", () => {
    const user = { id: "user_123", email: "luca@example.invalid", role: "TRANSLATOR", status: "ACTIVE" };
    const record = buildErrorRecord({ request: request(), error: new Error("nope"), status: 409, requestId: "req-3", user });
    assert.equal(record.user_id, "user_123");
    assert.equal(record.user_email, "luca@example.invalid");
    assert.match(record.details_json, /TRANSLATOR/);
  });

  it("truncates long messages and stacks so a row stays small", () => {
    const long = new Error("x".repeat(5000));
    const record = buildErrorRecord({ request: request(), error: long, status: 500, requestId: "req-4" });
    assert.equal(record.message.length, 1000);
    assert.ok(record.stack.length <= 4000);
  });

  it("handles a thrown non-Error without losing the value", () => {
    const record = buildErrorRecord({ request: request(), error: "plain string failure", status: 500, requestId: "req-5" });
    assert.equal(record.message, "plain string failure");
    assert.equal(record.code, "string");
    assert.equal(record.stack, "");
  });
});

describe("Error log retention", () => {
  it("defaults to 90 days and ignores nonsense values", () => {
    assert.equal(retentionDays(undefined), DEFAULT_RETENTION_DAYS);
    assert.equal(retentionDays(""), DEFAULT_RETENTION_DAYS);
    assert.equal(retentionDays("abc"), DEFAULT_RETENTION_DAYS);
    assert.equal(retentionDays("0"), DEFAULT_RETENTION_DAYS);
    assert.equal(retentionDays("-5"), DEFAULT_RETENTION_DAYS);
    assert.equal(retentionDays("30"), 30);
    assert.equal(retentionDays("7.9"), 7);
    assert.equal(retentionDays("99999"), 3650, "clamped so a typo cannot keep rows forever");
  });

  it("computes the cutoff from the given clock", () => {
    const now = new Date("2026-10-28T00:00:00.000Z");
    assert.equal(retentionCutoff(now, 90), "2026-07-30T00:00:00.000Z");
    assert.equal(retentionCutoff(now, 1), "2026-10-27T00:00:00.000Z");
  });

  it("deletes in bounded chunks until the table is clear", async () => {
    const db = fakeDb([500, 500, 120]);
    const result = await pruneErrorLogs({ DB: db, ERROR_LOG_RETENTION_DAYS: "30" }, new Date("2026-10-28T00:00:00.000Z"));
    assert.equal(result.deleted, 1120);
    assert.equal(result.cutoff, "2026-09-28T00:00:00.000Z");
    assert.equal(db.calls.length, 3);
    assert.match(db.calls[0].sql, /DELETE FROM error_logs/);
    assert.equal(db.calls[0].value, "2026-09-28T00:00:00.000Z");
  });

  it("stops after one pass when nothing is old enough", async () => {
    const db = fakeDb([0]);
    const result = await pruneErrorLogs({ DB: db }, new Date("2026-10-28T00:00:00.000Z"));
    assert.equal(result.deleted, 0);
    assert.equal(db.calls.length, 1);
  });

  it("never throws when the database fails", async () => {
    const db = fakeDb(["throw"]);
    const result = await pruneErrorLogs({ DB: db }, new Date("2026-10-28T00:00:00.000Z"));
    assert.equal(result.deleted, 0);
  });
});
