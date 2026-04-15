import { describe, expect, it } from "vitest";

import { roundStartTime, roundEndTime, calculateHours } from "@/lib/time";

describe("roundStartTime", () => {
  it("rounds down to nearest 15 minutes", () => {
    expect(roundStartTime("09:07")).toBe("09:00");
    expect(roundStartTime("09:14")).toBe("09:00");
    expect(roundStartTime("09:15")).toBe("09:15");
    expect(roundStartTime("09:22")).toBe("09:15");
    expect(roundStartTime("09:30")).toBe("09:30");
    expect(roundStartTime("09:44")).toBe("09:30");
    expect(roundStartTime("09:45")).toBe("09:45");
    expect(roundStartTime("09:59")).toBe("09:45");
    expect(roundStartTime("09:00")).toBe("09:00");
  });
});

describe("roundEndTime", () => {
  it("rounds up to nearest 15 minutes", () => {
    expect(roundEndTime("17:00")).toBe("17:00");
    expect(roundEndTime("17:01")).toBe("17:15");
    expect(roundEndTime("17:15")).toBe("17:15");
    expect(roundEndTime("17:16")).toBe("17:30");
    expect(roundEndTime("17:30")).toBe("17:30");
    expect(roundEndTime("17:31")).toBe("17:45");
    expect(roundEndTime("17:45")).toBe("17:45");
    expect(roundEndTime("17:46")).toBe("18:00");
  });
});

describe("calculateHours", () => {
  it("calculates hours between two times", () => {
    expect(calculateHours("09:00", "17:00")).toBe(8);
    expect(calculateHours("09:00", "12:30")).toBe(3.5);
    expect(calculateHours("09:15", "09:45")).toBe(0.5);
    expect(calculateHours("09:00", "09:15")).toBe(0.25);
  });

  it("returns 0 for invalid ranges", () => {
    expect(calculateHours("17:00", "09:00")).toBe(0);
    expect(calculateHours("09:00", "09:00")).toBe(0);
  });
});
