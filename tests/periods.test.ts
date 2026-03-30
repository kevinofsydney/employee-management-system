import { describe, expect, it } from "vitest";

import { getPayPeriodRange } from "@/lib/periods";

describe("getPayPeriodRange", () => {
  it("returns a Monday-to-Sunday period when configured for Monday", () => {
    const date = new Date("2026-03-30T10:00:00.000Z");
    const range = getPayPeriodRange(date, 1);

    expect(range.start.toISOString()).toBe("2026-03-30T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-04-05T23:59:59.999Z");
  });
});
