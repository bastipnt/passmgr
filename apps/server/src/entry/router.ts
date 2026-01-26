import { router } from "../trpc";
import { loggedProcedure } from "../logger";
import { entrySchema, type Entry } from "@repo/client";
import z from "zod";
import { server } from "../server";

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
  all: loggedProcedure.output(z.object({ entries: z.array(entrySchema) })).query(async () => {
    const { redis } = server;
    const loadedEntries = await redis.get("entries");

    if (!loadedEntries) {
      await redis.set("entries", JSON.stringify(entries));
      return { entries };
    }

    return {
      entries: JSON.parse(loadedEntries) as Entry[],
    };
  }),
  getById: loggedProcedure
    .input(z.string())
    .output(entrySchema)
    .query(async (opts) => {
      const { redis } = server;
      const baseEntry = {
        id: opts.input,
        title: "",
        email: "",
        password: "",
      };

      const loadedEntries = await redis.get("entries");
      if (!loadedEntries) return baseEntry;

      return {
        ...baseEntry,
        ...(JSON.parse(loadedEntries) as Entry[]).find(({ id }) => id === opts.input),
      };
    }),
  update: loggedProcedure.input(entrySchema).mutation(async (opts) => {
    const { id, ...data } = opts.input;
    const { redis } = server;

    const newEntries = entries.reduce<Entry[]>((prevEntries, currentEntry) => {
      if (currentEntry.id === id) {
        return [...prevEntries, { ...currentEntry, ...data }];
      }

      return [...prevEntries, currentEntry];
    }, []);

    redis.set("entries", JSON.stringify(newEntries));
  }),
});
