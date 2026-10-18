// Tests for the mountain view's information (the drawing's animation is
// visual; its geometry is tested in trail.test.ts).
import { applyMeters, createInitialProgress, type ClimbProgress } from "@summit/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MountainView } from "./MountainView";

const NOW = new Date("2026-10-17T12:00:00.000Z");

/** Progress after earning `meters` from a fresh start. */
const progressAt = (meters: number): ClimbProgress =>
  applyMeters(createInitialProgress(), meters, NOW).progress;

describe("MountainView", () => {
  it("describes the climb for screen readers in one sentence", () => {
    render(<MountainView progress={progressAt(250)} />);

    expect(
      screen.getByRole("img", { name: "Climber at 250 m of 3,776 m on Mt. Fuji" }),
    ).toBeInTheDocument();
  });

  it("shows the peak, its place in the list, and the meters left", () => {
    render(<MountainView progress={progressAt(250)} />);

    expect(screen.getByRole("heading", { name: "Mt. Fuji" })).toBeInTheDocument();
    expect(screen.getByText("Peak 1 of 8 · Honshu, Japan")).toBeInTheDocument();
    expect(screen.getByText("250 m of 3,776 m · 3,526 m to summit")).toBeInTheDocument();
  });

  it("moves on to the next peak after a summit, carrying extra meters", () => {
    render(<MountainView progress={progressAt(4000)} />);

    expect(screen.getByRole("heading", { name: "Mt. Rainier" })).toBeInTheDocument();
    expect(screen.getByText("224 m of 4,392 m · 4,168 m to summit")).toBeInTheDocument();
  });

  it("celebrates the end when every peak is summited", () => {
    render(<MountainView progress={progressAt(100_000)} />);

    expect(screen.getByRole("heading", { name: "Every peak summited!" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Climber at 8,849 m of 8,849 m on Mt. Everest" }),
    ).toBeInTheDocument();
  });
});
