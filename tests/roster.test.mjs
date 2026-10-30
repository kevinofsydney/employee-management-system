import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { DateTime } from "luxon";
import { eventFromFileName, parseDateLabel, parseTimeRange, rosterNote, scanRoster, splitName } from "../src/shared/roster.ts";
import { readXlsx } from "../src/shared/xlsx.ts";

const today = DateTime.fromISO("2026-10-30", { zone: "Australia/Sydney" });

// A tour workbook shaped like the real ones: a pay summary, two city rosters and an email-less copy.
const sheets = [
  { name: "Sheet11", rows: [[], ["", "Name", "City", "Sep 22", "Standard hours", "Standard hourly rate"], ["", "Ada Lim", "Melbourne", "12.5", "12.5", "35"]] },
  { name: "MELBOURNE", rows: [
    ["MELBOURNE"],
    ["Role", "Name", "EMAIL", "STATUS", "SEP 22\nSHOW", "REIMBURSE"],
    ["LIGHTING", "Ada Lim", "Ada@Example.com", "Confirmed", "11:00 - 2330"],
    ["SOUND (MONITOR)", "(Hyun) Bo Park", "bo@example.com", "Confirmed", "15:00 - 2330"],
    ["CAMERA", "Cy Tan", "cy@example.com", "Tentative", "11:00 - 2330"],
    ["STAGE", "Di Ng", "di@example.com", "Confirmed", "TBC"],
    [],
    ["", "Working hours"],
    ["", "Ada Lim", "", "", "12.5"]
  ] },
  { name: "SYDNEY", rows: [
    ["SYDNEY"],
    ["Role", "Name", "EMAIL", "STATUS", "SEP 25 SHOW", "26/9"],
    ["LIGHTING", "Ada Lim", "ada@example.com", "Confirmed", "11:00 - 2330", "10pm - 2am"],
    ["STAGE", "Ed Wu", "not-an-email", "Confirmed", "11:00 - 2330"]
  ] },
  { name: "Sheet12", rows: [["MELBOURNE"], ["Role", "Name", "SEP 22\nSHOW"], ["LIGHTING", "Ada Lim", "11:00 - 2330"]] }
];

describe("roster import", () => {
  it("reads only Name and Email tables and turns each filled date cell into a shift", () => {
    const scan = scanRoster(sheets, { today });
    assert.deepEqual(scan.sheetsUsed, ["MELBOURNE", "SYDNEY"]);
    assert.deepEqual(scan.sheetsSkipped, ["Sheet11", "Sheet12"]);
    const ok = scan.rows.filter((row) => !row.problem);
    assert.deepEqual(ok.map(({ city, role, email, startLocal, endLocal }) => ({ city, role, email, startLocal, endLocal })), [
      { city: "Melbourne", role: "Lighting", email: "ada@example.com", startLocal: "2026-09-22T11:00", endLocal: "2026-09-22T23:30" },
      { city: "Melbourne", role: "Sound (Monitor)", email: "bo@example.com", startLocal: "2026-09-22T15:00", endLocal: "2026-09-22T23:30" },
      { city: "Sydney", role: "Lighting", email: "ada@example.com", startLocal: "2026-09-25T11:00", endLocal: "2026-09-25T23:30" },
      { city: "Sydney", role: "Lighting", email: "ada@example.com", startLocal: "2026-09-26T22:00", endLocal: "2026-09-27T02:00" }
    ]);
    assert.equal(ok[0].startAt, "2026-09-22T01:00:00Z");
    assert.deepEqual(scan.rows.filter((row) => row.problem).map((row) => [row.name, row.problem]), [
      ["Cy Tan", "Status is “Tentative”"],
      ["Di Ng", "Couldn't read the time “TBC”"],
      ["Ed Wu", "Email address looks wrong"]
    ]);
  });

  it("flags a shift listed twice and honours an explicit year", () => {
    const twice = [{ name: "A", rows: [["Name", "Email", "Sep 22"], ["Ada Lim", "ada@example.com", "9-5"], ["Ada Lim", "ada@example.com", "9 - 5"]] }];
    assert.deepEqual(scanRoster(twice, { today }).rows.map((row) => row.problem), ["", "Listed twice in this file"]);
    assert.equal(scanRoster(twice, { today, year: 2027 }).rows[0].startLocal, "2027-09-22T09:00");
  });

  it("picks the nearest year for dates without one", () => {
    const january = [{ name: "A", rows: [["Name", "Email", "Jan 3"], ["Ada Lim", "ada@example.com", "9am - 5pm"]] }];
    assert.equal(scanRoster(january, { today: DateTime.fromISO("2026-12-20", { zone: "Australia/Sydney" }) }).rows[0].startLocal, "2027-01-03T09:00");
  });

  it("parses the date and time spellings seen in rosters", () => {
    assert.deepEqual(parseDateLabel("SEP 22\nSHOW"), { month: 9, day: 22 });
    assert.deepEqual(parseDateLabel("Mon 22nd September 2026"), { month: 9, day: 22, year: 2026 });
    assert.deepEqual(parseDateLabel("22/9/26"), { day: 22, month: 9, year: 2026 });
    assert.deepEqual(parseDateLabel("2026-09-22"), { year: 2026, month: 9, day: 22 });
    assert.equal(parseDateLabel("REIMBURSE"), null);
    assert.equal(parseDateLabel("Standard hours"), null);
    assert.deepEqual(parseTimeRange("11:00 - 2330"), { start: 660, end: 1410 });
    assert.deepEqual(parseTimeRange("9.30am to 5pm"), { start: 570, end: 1020 });
    assert.deepEqual(parseTimeRange("22:00–02:00"), { start: 1320, end: 1560 });
    assert.deepEqual(parseTimeRange("18:00 - 24:00"), { start: 1080, end: 1440 });
    assert.deepEqual(parseTimeRange("9-5"), { start: 540, end: 1020 });
    assert.deepEqual(parseTimeRange("11:00 - 2:30"), { start: 660, end: 870 });
    assert.deepEqual(parseTimeRange("22:00 - 2:00"), { start: 1320, end: 1560 });
    assert.deepEqual(parseTimeRange("9pm - 5am"), { start: 1260, end: 1740 });
    assert.equal(parseTimeRange("TBC"), null);
  });

  it("builds names, notes and a default event name", () => {
    assert.deepEqual(splitName("(Hyun) Young Park"), { first: "Hyun Young", surname: "Park" });
    assert.deepEqual(splitName("Cher"), { first: "Cher", surname: "" });
    assert.equal(rosterNote("MAMAMOO", { city: "Melbourne", role: "Sound (Monitor)" }), "MAMAMOO · Melbourne · Sound (Monitor)");
    assert.equal(eventFromFileName("MAMAMOO INTERPRETER SHEET.xlsx"), "MAMAMOO");
    assert.equal(eventFromFileName("Roster.xlsx"), "Roster");
  });

  it("reads cell text, shared strings and date cells from an .xlsx file", () => {
    const xml = (body) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
    const file = zipSync({
      "xl/workbook.xml": xml('<workbook xmlns:r="r"><sheets><sheet name="Perth &amp; co" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": xml('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      "xl/sharedStrings.xml": xml("<sst><si><t>Name</t></si><si><r><t>E</t></r><r><t>mail</t></r></si><si><t>Ada Lim</t></si></sst>"),
      "xl/styles.xml": xml('<styleSheet><numFmts><numFmt numFmtId="164" formatCode="mmm d"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>'),
      "xl/worksheets/sheet1.xml": xml('<worksheet><sheetData><row r="1"/><row r="2"><c r="B2" t="s"><v>0</v></c><c r="C2" t="s"><v>1</v></c><c r="D2" s="1"><v>46287</v></c></row>'
        + '<row r="3"><c r="B3" t="s"><v>2</v></c><c r="C3" t="inlineStr"><is><t>ada@example.com</t></is></c><c r="D3" t="str"><f>A1</f><v>9 - 5</v></c><c r="E3" s="0"/></row></sheetData></worksheet>')
    });
    const [sheet] = readXlsx(file);
    assert.equal(sheet.name, "Perth & co");
    assert.deepEqual(sheet.rows, [[], ["", "Name", "Email", "2026-09-22"], ["", "Ada Lim", "ada@example.com", "9 - 5", ""]]);
    assert.throws(() => readXlsx(strToU8("name,email")), /isn't a readable .xlsx/);
  });
});
