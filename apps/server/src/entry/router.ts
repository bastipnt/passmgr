import { z } from "zod";
import { router } from "../trpc";
import { loggedProcedure } from "../logger";

type Entry = {
  id: string;
  name: string;
  email?: string;
};

// const entries: Record<string, Entry> = {};

export const entryRouter = router({
  all: loggedProcedure.query(() => {
    return {
      entries: [
        {
          id: "123",
          name: "Github",
          email: "lol@example.com",
        },
        {
          id: "222",
          name: "GitLab",
          email: "lol@example.com",
        },
        {
          id: "333",
          name: "Bucket",
          email: "lol@example.com",
        },
      ],
    };
  }),
  getById: loggedProcedure.input(z.string()).query((opts) => {
    return {
      id: opts.input,
      name: "GitHub",
      email: "lol",
      password: "supersecret",
    };
  }),
});
