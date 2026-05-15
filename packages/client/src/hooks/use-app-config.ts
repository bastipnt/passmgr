import { useTRPC } from "../util/trpc";
import { useQuery } from "@tanstack/react-query";

export function useAppConfig() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.appConfig.getConfig.queryOptions());

  return {
    registrationEnabled: data?.registrationEnabled ?? false,
    isLoading,
  };
}
