import { router } from "../trpc";
import z from "zod";
import { protectedProcedure } from "../auth/authMiddleware";
import { exampleLoginItems, type LoginItem, loginItemSchema } from "@repo/schema";
import { TRPCError } from "@trpc/server";

export const entryRouter = router({
  all: protectedProcedure.output(z.object({ items: z.array(loginItemSchema) })).query(async () => {
    return {
      items: exampleLoginItems,
    };
  }),

  getById: protectedProcedure
    .input(z.string())
    .output(loginItemSchema)
    .query(async (opts): Promise<LoginItem> => {
      const loginItem = exampleLoginItems.find(({ id }) => id === opts.input);
      if (!loginItem) throw new TRPCError({ code: "UNAUTHORIZED" });
      return loginItem;
    }),

  update: protectedProcedure.input(loginItemSchema).mutation(async (opts) => {
    const { id: _id } = opts.input;
  }),
});
