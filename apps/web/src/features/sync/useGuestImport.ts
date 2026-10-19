/**
 * Offers to copy this device's guest history into a signed-in account
 * (POST /api/sessions/import; the server decides what it accepts, see
 * decision 019).
 */
import type { ImportResult } from "@summit/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionHistory } from "../history/useSessionHistory";
import { importSessions } from "./sessionsApi";
import { CLIMB_KEY, HISTORY_KEY } from "./useSessionStore";

export interface GuestImport {
  /** Guest sessions on this device. */
  count: number;
  /** Show the offer: there's guest history, and this account hasn't declined. */
  offered: boolean;
  importNow: () => void;
  isImporting: boolean;
  result: ImportResult | undefined;
  error: Error | null;
}

export function useGuestImport({
  guestHistory,
  declined,
}: {
  guestHistory: SessionHistory;
  /** This account said "Not now" before. */
  declined: boolean;
}): GuestImport {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: importSessions,
    onSuccess: async () => {
      // The sessions live in the account now. Forget the device copy, so the
      // offer doesn't come back and nothing can be counted twice later.
      // (Sessions the server skipped couldn't be imported anyway.)
      guestHistory.clear();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
        queryClient.invalidateQueries({ queryKey: CLIMB_KEY }),
      ]);
    },
  });

  return {
    count: guestHistory.sessions.length,
    offered: guestHistory.sessions.length > 0 && !declined && !mutation.isSuccess,
    importNow: () => mutation.mutate(guestHistory.sessions),
    isImporting: mutation.isPending,
    result: mutation.data,
    error: mutation.error,
  };
}
