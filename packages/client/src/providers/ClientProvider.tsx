import { DEVICE_NAME_HEADER } from "@repo/crypto";
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
import { createContext, type ReactNode, useContext, useState } from "react";
import { generateAuthHeaders, generateSubscriptionParams } from "../util/headers";
import { serverHost } from "../util/server-url";
import { TRPCProvider } from "../util/trpc";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });
}

export const ServerUrlContext = createContext<string | null>(null);

/** The server address `ClientProvider` talks to (as configured, e.g. for the emergency kit). */
export function useServerUrl(): string {
  const serverUrl = useContext(ServerUrlContext);
  if (serverUrl === null) throw new Error("useServerUrl must be used within ClientProvider");
  return serverUrl;
}

export function useServerHost(): string {
  return serverHost(useServerUrl());
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  } else {
    // Reused: React may suspend the first render and would otherwise make a new client.
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
  /**
   * How this device is named in the account's session list ("Firefox on
   * macOS"). Sent with each login.
   */
  deviceName?: string;
};

export default function ClientProvider({
  children,
  serverUrl,
  eventSource,
  deviceName,
}: ClientProviderProps) {
  const queryClient = getQueryClient();

  const createTrpcClientWithHeaders = (): TRPCClient<AppRouter> =>
    createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({
            url: serverUrl,
            EventSource: eventSource,
            connectionParams: generateSubscriptionParams,
          }),
          false: httpLink({
            url: serverUrl,
            async headers({ op }) {
              const headers = await generateAuthHeaders(op);
              // Header values are Latin-1 only; device names may not be.
              if (deviceName && op.path === "login.finishLogin") {
                headers[DEVICE_NAME_HEADER] = encodeURIComponent(deviceName);
              }
              return headers;
            },
          }),
        }),
      ],
    });

  const [trpcClient] = useState(() => createTrpcClientWithHeaders());

  return (
    <ServerUrlContext value={serverUrl}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          {children}
        </TRPCProvider>
      </QueryClientProvider>
    </ServerUrlContext>
  );
}
