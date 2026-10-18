// Tests for the validated localStorage helpers, including every way stored
// data can go wrong.
import { DEFAULT_TIMER_SETTINGS, TimerSettingsSchema } from "@summit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFromStorage, loadListFromStorage, saveToStorage } from "./storage";

const FALLBACK = DEFAULT_TIMER_SETTINGS;
const custom = { ...DEFAULT_TIMER_SETTINGS, focusMinutes: 50 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveToStorage + loadFromStorage", () => {
  it("round-trips a valid value", () => {
    expect(saveToStorage("settings", custom)).toBe(true);

    expect(loadFromStorage("settings", TimerSettingsSchema, FALLBACK)).toEqual(custom);
  });

  it("namespaces keys with a summit: prefix", () => {
    saveToStorage("settings", custom);

    expect(localStorage.getItem("summit:settings")).toBe(JSON.stringify(custom));
  });
});

describe("loadFromStorage falls back safely when", () => {
  it("nothing is saved yet", () => {
    expect(loadFromStorage("settings", TimerSettingsSchema, FALLBACK)).toBe(FALLBACK);
  });

  it("the saved text isn't valid JSON", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("summit:settings", "{not json");

    expect(loadFromStorage("settings", TimerSettingsSchema, FALLBACK)).toBe(FALLBACK);
  });

  // E.g. data from an older app version, or hand-edited in DevTools.
  it("the saved JSON doesn't match the schema", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("summit:settings", JSON.stringify({ ...custom, focusMinutes: -3 }));

    expect(loadFromStorage("settings", TimerSettingsSchema, FALLBACK)).toBe(FALLBACK);
    expect(warn).toHaveBeenCalledWith('Ignoring invalid saved data for "settings"');
  });

  it("reading storage throws (blocked in some private modes)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });

    expect(loadFromStorage("settings", TimerSettingsSchema, FALLBACK)).toBe(FALLBACK);
  });
});

describe("loadListFromStorage", () => {
  it("returns an empty list when nothing is saved", () => {
    expect(loadListFromStorage("sessions", TimerSettingsSchema)).toEqual([]);
  });

  it("returns every item when all are valid", () => {
    saveToStorage("list", [custom, FALLBACK]);

    expect(loadListFromStorage("list", TimerSettingsSchema)).toEqual([custom, FALLBACK]);
  });

  // One corrupted entry must not wipe out the rest of the history.
  it("drops only the invalid items and keeps the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    saveToStorage("list", [custom, { focusMinutes: "oops" }, FALLBACK, null]);

    expect(loadListFromStorage("list", TimerSettingsSchema)).toEqual([custom, FALLBACK]);
    expect(warn).toHaveBeenCalledWith('Dropped 2 invalid item(s) from "list"');
  });

  it("returns an empty list when the stored value isn't a list", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    saveToStorage("list", { not: "a list" });

    expect(loadListFromStorage("list", TimerSettingsSchema)).toEqual([]);
  });
});

describe("saveToStorage", () => {
  it("returns false instead of throwing when storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(saveToStorage("settings", custom)).toBe(false);
  });
});
