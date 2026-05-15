import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@repo/types";

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
