import type { AccountEvent, SealedAccountEvent } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useTRPCClient } from "../util/trpc";

export const ACCOUNT_ACTIVITY_KEY = "account-activity";

/**
 * The account's security activity (sign-ins, failed sign-ins, password, key
 * and two-factor changes, devices), newest first. Only `online`: the log
 * lives on the server.
 */
async function openEvent({
  sealedDeviceName,
  deviceKeyVersion,
  ...event
}: SealedAccountEvent): Promise<AccountEvent> {
  const deviceName =
    sealedDeviceName === null || deviceKeyVersion === null
      ? null
      : await secretsStore.openAccountEventDeviceName(sealedDeviceName, deviceKeyVersion);
  return { ...event, deviceName };
}

export function useAccountActivity() {
  const { mode } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const online = mode === "online";

  const { data, isPending, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: [ACCOUNT_ACTIVITY_KEY],
      enabled: online,
      initialPageParam: undefined as number | undefined,
      queryFn: async ({ pageParam }) => {
        const page = await trpc.activity.list.query(
          pageParam === undefined ? {} : { before: pageParam },
        );
        return { ...page, events: await Promise.all(page.events.map(openEvent)) };
      },
      getNextPageParam: (page) => page.nextBefore ?? undefined,
    });

  const events: AccountEvent[] = online ? (data?.pages.flatMap((p) => p.events) ?? []) : [];
  return {
    events,
    isPending: online && isPending,
    error,
    hasMore: online && hasNextPage,
    loadMore: () => void fetchNextPage(),
    loadingMore: isFetchingNextPage,
  };
}
