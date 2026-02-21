import { router } from "../trpc";
import { entrySchema, type Entry } from "@repo/util";
import z from "zod";
import { protectedProcedure } from "../auth/authMiddleware";
import { exampleLoginItems, loginItemSchema } from "@repo/schema";
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
    .query(async (opts): Promise<Entry> => {
      const loginItem = exampleLoginItems.find(({ id }) => id === opts.input);
      if (!loginItem) throw new TRPCError({ code: "UNAUTHORIZED" });
      return loginItem;
    }),

  update: protectedProcedure.input(entrySchema).mutation(async (opts) => {
    const { id: _id } = opts.input;
  }),
});
