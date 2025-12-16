import { z } from "zod";
import { router } from "../trpc";
import { loggedProcedure } from "../logger";

type Entry = {
  id: string;
  name: string;
  email?: string;
};

const entries = [
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
  all: loggedProcedure.query(() => {
    return {
      entries,
    };
  }),
  getById: loggedProcedure.input(z.string()).query((opts) => {
    return {
      id: opts.input,
      name: "",
      email: "",
      password: "",
      ...entries.find(({ id }) => id === opts.input),
    };
  }),
});
