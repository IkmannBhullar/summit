/**
 * Renders the whole app for rope team tests: signed in as Ana (via MSW),
 * with fake room connections instead of real sockets.
 */
import type { User } from "@summit/shared";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import App from "../App";
import { RoomConnectionContext } from "../features/rooms/useRoom";
import { ANA_ID, FakeRoomConnection } from "./fakeRoomConnection";
import { server } from "./server";

export const ANA: User = {
  id: ANA_ID,
  email: "ana@example.com",
  displayName: "Ana",
  createdAt: "2026-10-18T09:00:00.000Z",
};

/** Makes /api/auth/me answer with Ana. */
export function signInAsAna(): void {
  server.use(http.get("*/api/auth/me", () => HttpResponse.json({ user: ANA })));
}

/**
 * Renders <App /> at `path`.
 * @param configure - Runs on each new connection, e.g. to set its replies.
 */
export function renderRoomApp(
  path: string,
  configure: (connection: FakeRoomConnection) => void = () => {},
) {
  const connections: FakeRoomConnection[] = [];
  const createConnection = () => {
    const connection = new FakeRoomConnection();
    // The same clock as the server unless a test says otherwise.
    connection.replies.ping = (clientTime) =>
      Promise.resolve({ clientTime, serverTime: clientTime });
    configure(connection);
    connections.push(connection);
    return connection;
  };

  window.history.replaceState(null, "", path);
  render(
    <RoomConnectionContext value={createConnection}>
      <App />
    </RoomConnectionContext>,
  );

  return {
    user: userEvent.setup(),
    connections,
    /** The most recent connection (throws if none was opened yet). */
    connection: () => {
      const latest = connections.at(-1);
      if (!latest) throw new Error("no room connection was opened");
      return latest;
    },
  };
}
