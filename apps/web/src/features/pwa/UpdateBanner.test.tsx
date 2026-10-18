// Tests for the update/offline banner (the presentational part only; the
// service worker wiring is checked in a real browser).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UpdateBanner, type UpdateBannerProps } from "./UpdateBanner";

function setup(props: Partial<UpdateBannerProps>) {
  const onReload = vi.fn();
  const onClose = vi.fn();
  render(
    <UpdateBanner
      needRefresh={false}
      offlineReady={false}
      onReload={onReload}
      onClose={onClose}
      {...props}
    />,
  );
  return { onReload, onClose, user: userEvent.setup() };
}

describe("UpdateBanner", () => {
  it("renders nothing when there's no news", () => {
    setup({});

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers a reload when a new version is ready, reassuring about sessions", async () => {
    const { user, onReload } = setup({ needRefresh: true });

    expect(screen.getByRole("status")).toHaveTextContent("Reloading keeps any session in progress");
    await user.click(screen.getByRole("button", { name: "Reload" }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("can be postponed with 'Later'", async () => {
    const { user, onClose, onReload } = setup({ needRefresh: true });

    await user.click(screen.getByRole("button", { name: "Later" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });

  it("announces when the app is ready to work offline", async () => {
    const { user, onClose } = setup({ offlineReady: true });

    expect(screen.getByRole("status")).toHaveTextContent("ready to work offline");
    expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
