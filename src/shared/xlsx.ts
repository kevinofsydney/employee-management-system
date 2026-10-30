import { strFromU8, unzipSync } from "fflate";

// Minimal .xlsx reader for roster imports: cell text only, no formulas or formatting. Date-formatted
// numeric cells come back as "YYYY-MM-DD" so a header like "22/09/2026" reads the same as "SEP 22".

export type Sheet = { name: string; rows: string[][] };

const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" }[lower]!;
  });
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

// Concatenates every <t> run, which covers plain and rich-text strings alike.
function runs(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  return [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function serialDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400) * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function dateStyles(xml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\s[^>]*>/g)) {
    custom.set(Number(attribute(m[0], "numFmtId")), decode(attribute(m[0], "formatCode") ?? ""));
  }
  const isDate = (id: number) => {
    if (BUILT_IN_DATE_FORMATS.has(id)) return true;
    const code = custom.get(id);
    // Strip quoted literals and colour/locale brackets before looking for day, month or year tokens.
    return !!code && /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, "")) && !/^[hms:.\s]+$/i.test(code);
  };
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const styles = new Set<number>();
  [...cellXfs.matchAll(/<xf\s[^>]*?\/?>/g)].forEach((m, index) => { if (isDate(Number(attribute(m[0], "numFmtId") ?? 0))) styles.add(index); });
  return styles;
}

export function readXlsx(bytes: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("This file isn't a readable .xlsx workbook. Save it as Excel Workbook (.xlsx) and try again.");
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : "");
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new Error("This file isn't a readable .xlsx workbook. Save it as Excel Workbook (.xlsx) and try again.");
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]));
  const dates = dateStyles(text("xl/styles.xml"));
  const targets = new Map<string, string>();
  for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\s[^>]*>/g)) {
    const target = attribute(m[0], "Target") ?? "";
    targets.set(attribute(m[0], "Id") ?? "", target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  return [...workbook.matchAll(/<sheet\s[^>]*>/g)].map((m) => {
    const xml = text(targets.get(attribute(m[0], "r:id") ?? "") ?? "");
    const rows: string[][] = [];
    for (const row of xml.matchAll(/<row\s([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const index = Number(attribute(` ${row[1]}`, "r") ?? rows.length + 1) - 1;
      const cells: string[] = [];
      for (const cell of (row[2] ?? "").matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = ` ${cell[1]}`;
        const body = cell[2] ?? "";
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        const type = attribute(tag, "t");
        let value = "";
        if (type === "s") value = shared[Number(raw)] ?? "";
        else if (type === "inlineStr") value = runs(body);
        else if (raw !== undefined) value = decode(raw);
        if (value && type !== "s" && type !== "inlineStr" && type !== "str" && dates.has(Number(attribute(tag, "s") ?? 0)) && Number.isFinite(Number(value))) {
          value = serialDate(Number(value));
        }
        const ref = attribute(tag, "r");
        cells[ref ? columnIndex(ref) : cells.length] = value;
      }
      rows[index] = Array.from(cells, (value) => value ?? "");
    }
    return { name: decode(attribute(m[0], "name") ?? "Sheet"), rows: Array.from(rows, (row) => row ?? []) };
  });
}
