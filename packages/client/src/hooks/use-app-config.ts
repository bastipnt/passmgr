import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";

export function useAppConfig() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.appConfig.getConfig.queryOptions());

  return {
    registrationEnabled: data?.registrationEnabled ?? false,
    isLoading,
  };
}
