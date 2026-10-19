import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { hoursByKind, isMissing, localToUtc, splitWork, validateRange } from "../src/shared/time.ts";

describe("Sydney work time", () => {
  it("allocates only the Sunday portion of an overnight shift to Sunday", () => {
    const range = validateRange("2026-10-24T22:00", "2026-10-25T02:15");
    assert.deepEqual(splitWork(range.startAt, range.endAt).map(({ date, kind, minutes }) => ({ date, kind, minutes })), [
      { date: "2026-10-24", kind: "STANDARD", minutes: 120 },
      { date: "2026-10-25", kind: "SUNDAY", minutes: 135 }
    ]);
    assert.deepEqual(hoursByKind(range.startAt, range.endAt), { standard: 2, sunday: 2.25 });
  });
  it("uses Sydney daylight saving time for elapsed hours", () => {
    const range = validateRange("2026-10-04T01:00", "2026-10-04T04:00");
    assert.equal(hoursByKind(range.startAt, range.endAt).sunday, 2);
    assert.throws(() => localToUtc("2026-10-04T02:15"));
  });
  it("flags missing timesheets at 9am the morning after a shift ends", () => {
    const { endAt } = validateRange("2026-10-24T22:00", "2026-10-25T02:00");
    assert.equal(isMissing(endAt, DateTime.fromISO("2026-10-26T08:59", { zone: "Australia/Sydney" })), false);
    assert.equal(isMissing(endAt, DateTime.fromISO("2026-10-26T09:00", { zone: "Australia/Sydney" })), true);
  });
});
