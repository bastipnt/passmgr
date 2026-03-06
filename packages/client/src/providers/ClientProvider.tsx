import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { TRPCProvider } from "../util/trpc";
import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import type { AppRouter } from "server";
import { generateAuthHeaders } from "../util/headers";

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
};

export default function ClientProvider({ children }: ClientProviderProps) {
  const queryClient = getQueryClient();

  const createTrpcClientWithHeaders = (): TRPCClient<AppRouter> =>
    createTRPCClient<AppRouter>({
      links: [
        httpLink({
          url: import.meta.env.VITE_SERVER_URL,
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
