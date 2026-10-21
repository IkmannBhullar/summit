// Tests for /rooms: starting a rope team and joining one with a code.
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { renderRoomApp, signInAsAna } from "../../test/renderRoomApp";
import { server } from "../../test/server";

const ROOM = { code: "K7QM2X", createdAt: "2026-10-20T09:00:00.000Z" };

/** Every room lookup the page made, by code. */
let lookups: string[];

beforeEach(() => {
  lookups = [];
  server.use(
    http.post("*/api/rooms", () => HttpResponse.json({ room: ROOM }, { status: 201 })),
    http.get("*/api/rooms/:code", ({ params }) => {
      lookups.push(String(params.code));
      return params.code === ROOM.code
        ? HttpResponse.json({ room: ROOM })
        : HttpResponse.json(
            { error: { code: "NOT_FOUND", message: "There's no open room with that code." } },
            { status: 404 },
          );
    }),
  );
});

describe("the rope teams page", () => {
  it("sends guests to sign in first", async () => {
    renderRoomApp("/rooms");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the Rope teams link in the header only when signed in", async () => {
    signInAsAna();
    renderRoomApp("/");

    expect(await screen.findByRole("link", { name: "Rope teams" })).toHaveAttribute(
      "href",
      "/rooms",
    );
  });

  it("starts a rope team and opens its room", async () => {
    signInAsAna();
    const { user } = renderRoomApp("/rooms");

    await user.click(await screen.findByRole("button", { name: "Start a rope team" }));

    await waitFor(() => expect(window.location.pathname).toBe("/rooms/K7QM2X"));
  });

  it("joins with a code typed any which way", async () => {
    signInAsAna();
    const { user } = renderRoomApp("/rooms");

    await user.type(await screen.findByLabelText("Room code"), "k7q-m2x");
    await user.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => expect(window.location.pathname).toBe("/rooms/K7QM2X"));
    expect(lookups).toEqual(["K7QM2X"]);
  });

  it("says so under the field when no room has that code", async () => {
    signInAsAna();
    const { user } = renderRoomApp("/rooms");

    await user.type(await screen.findByLabelText("Room code"), "AAAAAA");
    await user.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Room code")).toHaveAccessibleDescription(
        "There's no open room with that code.",
      ),
    );
    expect(window.location.pathname).toBe("/rooms");
  });

  // The same shared schema as the server, so a malformed code never leaves the browser.
  it("checks the code's shape before asking the server", async () => {
    signInAsAna();
    const { user } = renderRoomApp("/rooms");

    await user.type(await screen.findByLabelText("Room code"), "abc");
    await user.click(screen.getByRole("button", { name: "Join" }));

    expect(screen.getByLabelText("Room code")).toHaveAccessibleDescription(
      "Room codes are 6 letters and numbers.",
    );
    expect(lookups).toEqual([]);
  });
});
