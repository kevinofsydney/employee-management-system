import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildErrorRecord, redact, shouldLog } from "../worker/errors.ts";

const request = (path = "/api/my/timesheets?shiftId=abc", method = "POST") => new Request(`https://roster.example.com${path}`, { method });

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
