import { router } from "../trpc";
import { loggedProcedure } from "../logger";
import { entrySchema, type Entry } from "@repo/client";
import z from "zod";
import { server } from "../server";

export const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  password: z.string(),
});

const entries: Entry[] = [
  {
    id: "123",
    name: "Github",
    email: "lol@example.com",
    password: "Pass123",
  },
  {
    id: "222",
    name: "GitLab",
    email: "lolaa@example.com",
    password: "Passlol",
  },
  {
    id: "333",
    name: "Bucket",
    email: "bla@example.com",
    password: "Pass333",
  },
];

// const entries: Record<string, Entry> = {};

export const entryRouter = router({
  all: loggedProcedure.query(async () => {
    const { redis } = server;
    const loadedEntries = await redis.get("entries");

    if (!loadedEntries) {
      await redis.set("entries", JSON.stringify(entries));
      return { entries };
    }

    return {
      entries: JSON.parse(loadedEntries),
    };
  }),
  getById: loggedProcedure
    .input(z.string())
    .output(outputSchema)
    .query(async (opts) => {
      const { redis } = server;
      const baseEntry = {
        id: opts.input,
        name: "",
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
