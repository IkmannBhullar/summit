// Tests for the stats contract's time zone rule.
import { describe, expect, it } from "vitest";
import { isValidTimeZone, StatsQuerySchema } from "./stats";

describe("time zones", () => {
  it.each(["America/Vancouver", "Europe/Paris", "Asia/Kolkata", "UTC"])("accepts %s", (tz) => {
    expect(isValidTimeZone(tz)).toBe(true);
  });

  it.each(["Mars/Olympus_Mons", "", "'; DROP TABLE users; --"])("refuses %j", (tz) => {
    expect(StatsQuerySchema.safeParse({ tz }).success).toBe(false);
  });

  it("requires one", () => {
    expect(StatsQuerySchema.safeParse({}).success).toBe(false);
  });
});
