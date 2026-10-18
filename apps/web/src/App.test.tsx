// Smoke test for the app shell: the pieces render together.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  // Query by role, the way a screen reader sees the page, instead of by
  // CSS class. Tests then survive styling changes and double as a basic
  // accessibility check.
  it("shows the Summit heading", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Summit" })).toBeInTheDocument();
  });

  it("shows the focus timer, ready to start", () => {
    render(<App />);

    expect(screen.getByRole("timer")).toHaveTextContent("25:00");
    expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });
});
