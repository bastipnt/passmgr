import type { SessionInfo } from "@repo/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useTRPCClient } from "../util/trpc";

const SESSIONS_KEY = "account-sessions";

/**
 * The account's signed-in devices (server sessions), this one first. Only
 * `online`: the list lives on the server. Ending another device's session
 * locks it like a sign-out (`SESSION_SIGNED_OUT`); its local vault stays.
 */
export function useSessions() {
  const { mode } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();
  const online = mode === "online";

  const { data, isPending, error } = useQuery({
    queryKey: [SESSIONS_KEY],
    enabled: online,
    queryFn: async (): Promise<SessionInfo[]> => {
      const sessions = await trpc.session.list.query();
      return [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
    },
  });

  const mutation = useMutation({
    networkMode: "always",
    mutationFn: async (run: () => Promise<unknown>) => await run(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [SESSIONS_KEY] }),
  });

  return {
    sessions: online ? (data ?? []) : [],
    isPending: online && isPending,
    error,
    /** End another device's session by its `id`. */
    revoke: (id: string) => mutation.mutateAsync(() => trpc.session.revoke.mutate({ id })),
    /** End every session but this device's ("log out other devices"). */
    revokeOthers: () => mutation.mutateAsync(() => trpc.session.revokeOthers.mutate({})),
    pending: mutation.isPending,
  };
}
