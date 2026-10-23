import { RoomCodeSchema } from "@summit/shared";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PrimaryButton, SecondaryButton } from "../../components/Buttons";
import { TextField } from "../../components/TextField";
import { ApiRequestError } from "../../lib/api";
import { createRoom, findRoom } from "./roomsApi";
import { usePageTitle } from "../../lib/usePageTitle";

/** /rooms (signed-in only): start a new rope team, or join one with a code. */
export function RoomsPage() {
  usePageTitle("Rope teams");
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();

  const create = useMutation({
    mutationFn: createRoom,
    onSuccess: (room) => void navigate(`/rooms/${room.code}`),
  });

  // Check the code exists before leaving this page, so a typo shows up
  // right under the field instead of on a separate "not found" page.
  const join = useMutation({
    mutationFn: findRoom,
    onSuccess: (room) => void navigate(`/rooms/${room.code}`),
    onError: (error) =>
      setCodeError(
        error instanceof ApiRequestError && error.status === 404
          ? error.message
          : "Couldn't check that code. Try again.",
      ),
  });

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    // Same shared schema as the server: accepts "k7q-m2x" or a pasted invite link.
    const parsed = RoomCodeSchema.safeParse(code);
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message);
      return;
    }
    setCodeError(undefined);
    join.mutate(parsed.data);
  };

  return (
    <section className="flex w-full max-w-sm flex-col gap-10">
      <div>
        <h2 className="text-2xl font-bold">Rope teams</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Focus together. Everyone starts at the same moment, and if anyone lets go early, the whole
          team slips.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Start a rope team</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          You&apos;ll get a link to send to friends.
        </p>
        <PrimaryButton onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Start a rope team"}
        </PrimaryButton>
        {create.isError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {create.error instanceof ApiRequestError
              ? create.error.message
              : "Couldn't create a room. Try again."}
          </p>
        )}
      </div>

      <form onSubmit={submitCode} noValidate className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Join with a code</h3>
        <TextField
          label="Room code"
          name="code"
          value={code}
          onChange={setCode}
          error={codeError}
          hint="6 letters and numbers, like K7Q-M2X"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <SecondaryButton type="submit" disabled={join.isPending}>
          {join.isPending ? "Checking…" : "Join"}
        </SecondaryButton>
      </form>
    </section>
  );
}
