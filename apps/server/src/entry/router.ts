import { router } from "../trpc";
import { entrySchema, type Entry } from "@repo/util";
import z from "zod";
import { protectedProcedure } from "../auth/authMiddleware";
import { exampleLoginItems, loginItemSchema } from "@repo/schema";

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
      if (!loginItem) throw new Error("Login Item not found");
      return loginItem;
    }),

  update: protectedProcedure.input(entrySchema).mutation(async (opts) => {
    const { id: _id } = opts.input;

    // const newEntries = entries.reduce<Entry[]>((prevEntries, currentEntry) => {
    //   if (currentEntry.id === id) {
    //     return [...prevEntries, { ...currentEntry, ...data }];
    //   }

    //   return [...prevEntries, currentEntry];
    // }, []);

    // void redis.set("entries", JSON.stringify(newEntries));
  }),
});
