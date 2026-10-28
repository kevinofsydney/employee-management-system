import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExportError, buildExport, exportFileInfo, isExportKind } from "../src/shared/export.ts";
import { localToUtc } from "../src/shared/time.ts";

const user = { legal_first_name: "Ava", nickname: "", surname: "Chen", email: "ava@example.invalid", myob_card_id: "AVA001" };
const overnight = {
  id: "shift-overnight",
  start_at: localToUtc("2026-10-24T22:00"),
  end_at: localToUtc("2026-10-25T02:15"),
  user,
  timesheet: {
    id: "sheet-1",
    start_at: localToUtc("2026-10-24T22:00"),
    end_at: localToUtc("2026-10-25T02:15"),
    expenses: [
      { incurred_on: "2026-10-24", description: "Taxi to venue", amount_cents: 2850, receipt_sent: 1 },
      { incurred_on: "2026-10-25", description: "=HYPERLINK(\"http://evil\")", amount_cents: 500, receipt_sent: 0 }
    ]
  }
};
const plain = {
  id: "shift-plain",
  start_at: localToUtc("2026-10-27T09:00"),
  end_at: localToUtc("2026-10-27T17:00"),
  user: { ...user, myob_card_id: "" },
  timesheet: { id: "sheet-2", start_at: localToUtc("2026-10-27T09:00"), end_at: localToUtc("2026-10-27T17:00"), expenses: [] }
};
const unsubmitted = { ...overnight, id: "shift-open", timesheet: null };
const categories = { standard: "Base Hourly", sunday: "Sunday Hours" };
const lines = (body) => body.split("\r\n").filter((line) => line.length > 0);

describe("Export builders", () => {
  it("writes a BOM, a quoted header and one row per Sydney day", () => {
    const body = buildExport("review", [overnight], categories);
    assert.equal(body.startsWith("\uFEFF"), true);
    const rows = lines(body.slice(1));
    assert.equal(rows.length, 3);
    assert.match(rows[0], /^"Legal first name","Nickname","Surname"/);
    assert.match(rows[1], /"2026-10-24","2026-10-24T22:00","2026-10-25T02:15","2026-10-24T22:00","2026-10-25T00:00","2.00","Standard","sheet-1"$/);
    assert.match(rows[2], /"2026-10-25","2026-10-24T22:00","2026-10-25T02:15","2026-10-25T00:00","2026-10-25T02:15","2.25","Sunday","sheet-1"$/);
    assert.match(rows[2], /"2.25"/);
  });

  it("uses rostered times, not the corrected actual times, in the rostered columns", () => {
    const corrected = { ...overnight, timesheet: { ...overnight.timesheet, start_at: localToUtc("2026-10-24T22:15"), end_at: localToUtc("2026-10-25T02:00") } };
    const row = lines(buildExport("review", [corrected], categories).slice(1))[1];
    assert.match(row, /"2026-10-24T22:00","2026-10-25T02:15"/, "rostered start and end come from the shift");
    assert.match(row, /"2026-10-24T22:15","2026-10-25T00:00","1.75"/, "actual columns come from the corrected timesheet");
  });

  it("neutralises spreadsheet formulas in expense text", () => {
    const rows = lines(buildExport("expenses", [overnight], categories).slice(1));
    assert.equal(rows.length, 3);
    assert.match(rows[1], /"Taxi to venue","28.50","Yes"/);
    assert.match(rows[2], /"'=HYPERLINK\(""http:\/\/evil""\)","5.00","No"/);
  });

  it("filters by Sydney date and skips unsubmitted shifts", () => {
    const only = buildExport("review", [overnight, plain, unsubmitted], categories, "2026-10-25", "2026-10-25");
    const rows = lines(only.slice(1));
    assert.equal(rows.length, 2, "header plus the single Sunday segment");
    assert.match(rows[1], /"2026-10-25"/);
    assert.doesNotMatch(only, /shift-open/);
  });

  it("builds the MYOB file with the leading {} row and tab separators", () => {
    const rows = lines(buildExport("myob", [overnight], categories));
    assert.equal(rows[0], "{}");
    assert.equal(rows[1], ["Employee Co./Last Name", "Employee First Name", "Payroll Category", "Date", "Units", "Employee Card ID", "Start/Stop Time", "Notes"].join("\t"));
    assert.equal(rows[2], ["Chen", "Ava", "Base Hourly", "24/10/2026", "2.00", "AVA001", "Worked 22:00 to 00:00", "Shift shift-overnight"].join("\t"));
    assert.equal(rows[3], ["Chen", "Ava", "Sunday Hours", "25/10/2026", "2.25", "AVA001", "Worked 00:00 to 02:15", "Shift shift-overnight"].join("\t"));
  });

  it("refuses a MYOB export when a card ID or a category is missing", () => {
    assert.throws(() => buildExport("myob", [plain], categories), (error) => error instanceof ExportError && /MYOB card ID for Ava Chen/.test(error.message));
    assert.throws(() => buildExport("myob", [overnight], { standard: "Base Hourly", sunday: "  " }), (error) => error instanceof ExportError && /payroll categories/.test(error.message));
  });

  it("rejects malformed or reversed date ranges", () => {
    assert.throws(() => buildExport("review", [overnight], categories, "2026-13-01", ""), ExportError);
    assert.throws(() => buildExport("review", [overnight], categories, "2026-10-25", "2026-10-24"), ExportError);
  });

  it("names each file and recognises only the three export kinds", () => {
    assert.deepEqual(exportFileInfo("review"), { filename: "approved-hours.csv", contentType: "text/csv; charset=utf-8" });
    assert.deepEqual(exportFileInfo("expenses"), { filename: "approved-expenses.csv", contentType: "text/csv; charset=utf-8" });
    assert.deepEqual(exportFileInfo("myob"), { filename: "myob-timesheets.txt", contentType: "text/plain; charset=utf-8" });
    assert.equal(isExportKind("review"), true);
    assert.equal(isExportKind("payroll"), false);
    assert.equal(isExportKind(null), false);
  });
});
