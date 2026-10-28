import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { hoursByKind, isMissing, localToUtc, shiftWeek, splitWork, validateRange } from "../src/shared/time.ts";

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

describe("Expense week", () => {
  it("spans Monday to Sunday for a midweek shift", () => {
    // Wednesday 28 October 2026
    assert.deepEqual(shiftWeek(localToUtc("2026-10-28T09:00")), { start: "2026-10-26", end: "2026-11-01" });
  });
  it("puts a Sunday shift in the week that started six days earlier", () => {
    assert.deepEqual(shiftWeek(localToUtc("2026-10-25T10:00")), { start: "2026-10-19", end: "2026-10-25" });
  });
  it("uses the start date for a shift that crosses midnight", () => {
    const { startAt } = validateRange("2026-10-24T22:00", "2026-10-25T02:15");
    assert.deepEqual(shiftWeek(startAt), { start: "2026-10-19", end: "2026-10-25" });
  });
  it("allows a receipt dated earlier in the same week but not the week before", () => {
    const week = shiftWeek(localToUtc("2026-10-28T09:00"));
    const inside = (date) => date >= week.start && date <= week.end;
    assert.equal(inside("2026-10-26"), true);
    assert.equal(inside("2026-10-31"), true);
    assert.equal(inside("2026-10-25"), false);
    assert.equal(inside("2026-11-02"), false);
  });
});
