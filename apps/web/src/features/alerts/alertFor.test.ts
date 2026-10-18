// Tests for deciding what each timer event plays and says.
import { describe, expect, it } from "vitest";
import { makeSession } from "../../test/fixtures";
import { alertFor } from "./alertFor";

describe("alertFor", () => {
  it("announces a completed session with its meters", () => {
    expect(
      alertFor({ type: "focusCompleted", session: makeSession("2026-10-17T09:25:00.000Z") }),
    ).toEqual({
      chime: "focusEnd",
      title: "Session complete!",
      body: "+250 m. Time for a break.",
    });
  });

  it("announces the end of a break with the break chime", () => {
    expect(alertFor({ type: "breakCompleted", mode: "shortBreak" })).toMatchObject({
      chime: "breakEnd",
      title: "Break's over",
    });
  });

  it("stays quiet when the user gives up (they just chose to)", () => {
    const session = makeSession("2026-10-17T09:10:00.000Z", { status: "ABANDONED" });

    expect(alertFor({ type: "focusAbandoned", session })).toBeNull();
  });
});
