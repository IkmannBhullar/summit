// Keyboard and screen-reader navigation: the skip link, where focus goes
// after changing pages, and each page's title.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { renderRoomApp, signInAsAna } from "./test/renderRoomApp";

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  render(<App />);
  return userEvent.setup();
}

describe("navigation", () => {
  it("offers 'Skip to content' as the very first Tab stop", async () => {
    const user = renderAt("/");
    await screen.findByRole("button", { name: "Start focus" });

    await user.tab();

    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#content");
    // The target can take focus, but isn't a Tab stop itself.
    expect(document.getElementById("content")).toHaveAttribute("tabindex", "-1");
  });

  it("doesn't grab focus on the first page load", async () => {
    renderAt("/");
    await screen.findByRole("button", { name: "Start focus" });

    expect(document.body).toHaveFocus();
  });

  it("moves focus to the new page's content after following a link", async () => {
    const user = renderAt("/");

    await user.click(await screen.findByRole("link", { name: "See your stats" }));

    await waitFor(() => expect(document.getElementById("content")).toHaveFocus());
    expect(window.location.pathname).toBe("/stats");
  });
});

describe("page titles", () => {
  it.each([
    ["/login", "Sign in · Summit"],
    ["/register", "Create your account · Summit"],
    ["/stats", "Your stats · Summit"],
  ])("%s is titled %s", async (path, title) => {
    renderAt(path);

    await waitFor(() => expect(document.title).toBe(title));
  });

  it("titles signed-in pages too", async () => {
    signInAsAna();
    renderAt("/account");
    await waitFor(() => expect(document.title).toBe("Your account · Summit"));
  });

  it("names the room in a room page's title", async () => {
    signInAsAna();
    renderRoomApp("/rooms/K7QM2X");

    await waitFor(() => expect(document.title).toBe("Rope team K7Q-M2X · Summit"));
  });
});
