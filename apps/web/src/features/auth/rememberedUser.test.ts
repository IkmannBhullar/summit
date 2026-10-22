// Tests for remembering the signed-in user on this device.
import type { User } from "@summit/shared";
import { describe, expect, it, vi } from "vitest";
import { rememberedUser, rememberUser } from "./rememberedUser";

const ANA: User = {
  id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
  email: "ana@example.com",
  displayName: "Ana",
  createdAt: "2026-10-18T09:00:00.000Z",
};

describe("rememberedUser", () => {
  it("remembers the signed-in user, and forgets them", () => {
    rememberUser(ANA);
    expect(rememberedUser()).toEqual(ANA);

    rememberUser(null);
    expect(rememberedUser()).toBeNull();
  });

  it("is nobody on a fresh device", () => {
    expect(rememberedUser()).toBeNull();
  });

  // Saved data is untrusted: an edited or corrupted entry means nobody.
  it("ignores a saved user that doesn't match the schema", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("summit:signed-in-user", JSON.stringify({ ...ANA, id: "not-a-uuid" }));

    expect(rememberedUser()).toBeNull();
    vi.restoreAllMocks();
  });

  it("replaces the older yes/no hint", () => {
    localStorage.setItem("summit:signed-in-hint", "1");

    rememberUser(ANA);

    expect(localStorage.getItem("summit:signed-in-hint")).toBeNull();
  });
});
