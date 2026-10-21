// Tests for the rope team mountain drawing.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BEN_ID, makeMember } from "../../test/fakeRoomConnection";
import { climberColor, describeTeam } from "./climberPlacement";
import { RoomMembers } from "./RoomMembers";
import { TeamMountain } from "./TeamMountain";

const ana = makeMember({ climb: { peakId: "mt-fuji", metersGained: 250 } });
const ben = makeMember({
  userId: BEN_ID,
  displayName: "Ben",
  isHost: false,
  climb: { peakId: "mt-rainier", metersGained: 1_250 },
});

describe("TeamMountain", () => {
  it("describes where everyone is in one sentence, for screen readers", () => {
    render(<TeamMountain members={[ana, ben]} roped={false} />);

    expect(
      screen.getByRole("img", {
        name: "Rope team of 2 climbers: Ana at 250 m of 3,776 m on Mt. Fuji; Ben at 1,250 m of 4,392 m on Mt. Rainier",
      }),
    ).toBeInTheDocument();
  });

  it("draws one marker per climber, with their initial", () => {
    const { container } = render(<TeamMountain members={[ana, ben]} roped={false} />);

    const initials = [...container.querySelectorAll("text")].map((t) => t.textContent);
    expect(initials).toEqual(["A", "B"]);
  });

  it("ropes the team together: slack between sessions, taut during one", () => {
    const { rerender } = render(<TeamMountain members={[ana, ben]} roped={false} />);
    expect(screen.getByTestId("rope")).toHaveAttribute("stroke-dasharray", "3 4");

    rerender(<TeamMountain members={[ana, ben]} roped />);

    expect(screen.getByTestId("rope")).not.toHaveAttribute("stroke-dasharray");
  });

  it("has no rope for a climber on their own", () => {
    render(<TeamMountain members={[ana]} roped />);

    expect(screen.queryByTestId("rope")).not.toBeInTheDocument();
  });
});

// The member list and the mountain must agree, or the colors mean nothing.
it("colors each climber the same on the mountain and in the member list", () => {
  const { container } = render(
    <>
      <TeamMountain members={[ana, ben]} roped={false} />
      <RoomMembers members={[ana, ben]} myUserId={undefined} serverNow={0} />
    </>,
  );

  const markers = [...container.querySelectorAll("circle")];
  const avatars = screen.getAllByRole("listitem").map((item) => item.querySelector("span"));
  [0, 1].forEach((i) => {
    expect(markers[i]).toHaveClass(climberColor(i).fill);
    expect(avatars[i]).toHaveClass(climberColor(i).bg);
  });
  expect(climberColor(0).fill).not.toBe(climberColor(1).fill);
});

describe("describeTeam", () => {
  it("counts a single climber in the singular", () => {
    expect(describeTeam([makeMember()])).toBe(
      "Rope team of 1 climber: Ana at 0 m of 3,776 m on Mt. Fuji",
    );
  });
});
