// Tests for the session history store.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeSession } from "../../test/fixtures";
import { useSessionHistory } from "./useSessionHistory";

describe("useSessionHistory", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSessionHistory());

    expect(result.current.sessions).toEqual([]);
  });

  it("adds sessions and keeps them across a reload", () => {
    const session = makeSession("2026-10-17T09:25:00.000Z");
    const first = renderHook(() => useSessionHistory());

    act(() => first.result.current.addSession(session));
    first.unmount();
    const second = renderHook(() => useSessionHistory());

    expect(second.result.current.sessions).toEqual([session]);
  });

  // If an event were ever delivered twice, history must not double-count it.
  it("ignores a session it already has", () => {
    const session = makeSession("2026-10-17T09:25:00.000Z");
    const { result } = renderHook(() => useSessionHistory());

    act(() => result.current.addSession(session));
    act(() => result.current.addSession(session));

    expect(result.current.sessions).toHaveLength(1);
  });

  it("drops a corrupted entry but keeps the rest of the history", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const good = makeSession("2026-10-17T09:25:00.000Z");
    // A tampered session claiming more meters than it earned.
    const tampered = { ...makeSession("2026-10-17T10:25:00.000Z"), metersGained: 99_999 };
    localStorage.setItem("summit:sessions", JSON.stringify([good, tampered]));

    const { result } = renderHook(() => useSessionHistory());

    expect(result.current.sessions).toEqual([good]);
    vi.restoreAllMocks();
  });
});
