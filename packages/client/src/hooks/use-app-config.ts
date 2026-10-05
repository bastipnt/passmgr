import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";

/**
 * The server's public config. Never required (ADR 0001 D1): with no server, or
 * none reachable, it degrades to "no registration" after one quick retry, and
 * everything that works without an account (a local vault) stays available.
 */
export function useAppConfig() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery({
    ...trpc.appConfig.getConfig.queryOptions(),
    retry: 1,
    // Changes only with a server redeploy; without a server, don't retry on every page.
    staleTime: 5 * 60_000,
  });

  return {
    registrationEnabled: data?.registrationEnabled ?? false,
    isLoading,
  };
}
