import type { AppRouter } from "@repo/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpLink,
  httpSubscriptionLink,
  splitLink,
  type TRPCClient,
} from "@trpc/client";
import type { EventSourceLike } from "@trpc/server/unstable-core-do-not-import";
import { type ReactNode, useState } from "react";
import { generateAuthHeaders } from "../util/headers";
import { TRPCProvider } from "../util/trpc";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

type ClientProviderProps = {
  children: ReactNode;
  serverUrl: string;
  /**
   * `EventSource` ponyfill for SSE subscriptions. Web leaves this unset and gets
   * `globalThis.EventSource`; React Native has no such global and must pass one.
   * Must be a stable reference — the tRPC client is created once.
   */
  eventSource?: EventSourceLike.AnyConstructor;
};

export default function ClientProvider({ children, serverUrl, eventSource }: ClientProviderProps) {
  const queryClient = getQueryClient();

  const createTrpcClientWithHeaders = (): TRPCClient<AppRouter> =>
    createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({
            url: serverUrl,
            EventSource: eventSource,
            connectionParams: async () => {
              const { secretsStore } = await import("@repo/store");
              return { sessionId: secretsStore.sessionId ?? "" };
            },
          }),
          false: httpLink({
            url: serverUrl,
            async headers({ op }) {
              return await generateAuthHeaders(op);
            },
            async fetch(url, options) {
              return fetch(url, {
                ...options,
                credentials: "include",
              });
            },
          }),
        }),
      ],
    });

  const [trpcClient] = useState(() => createTrpcClientWithHeaders());

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
