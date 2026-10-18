// Smoke test for the home page: proves React, jsdom and the shared package
// all work together in the test environment.
import { METERS_PER_FOCUS_MINUTE } from "@summit/shared";
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

  it("shows elevation values from @summit/shared", () => {
    render(<App />);

    expect(screen.getByText(new RegExp(`${METERS_PER_FOCUS_MINUTE} m per focus minute`))).toBeInTheDocument();
    expect(screen.getByText(/25-minute session climbs 250 m/)).toBeInTheDocument();
  });
});
