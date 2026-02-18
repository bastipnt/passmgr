import { router } from "../trpc";
import { entrySchema, type Entry } from "@repo/util";
import z from "zod";
import { protectedProcedure } from "../auth/authMiddleware";

const entries: Entry[] = [
  {
    id: "123",
    title: "Github",
    username: "lol@example.com",
    password: "Pass123",
  },
  {
    id: "222",
    title: "GitLab",
    username: "lolaa@example.com",
    password: "Passlol",
  },
  {
    id: "333",
    title: "Bucket",
    username: "bla@example.com",
    password: "Pass333",
  },
];

export const entryRouter = router({
  all: protectedProcedure.output(z.object({ entries: z.array(entrySchema) })).query(async () => {
    return {
      entries,
    };
  }),

  getById: protectedProcedure
    .input(z.string())
    .output(entrySchema)
    .query(async (opts): Promise<Entry> => {
      const entry = entries.find(({ id }) => id === opts.input);
      if (!entry) throw new Error("Entry not found");
      return entry;
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
