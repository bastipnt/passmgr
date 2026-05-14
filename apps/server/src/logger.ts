import { publicProcedure } from "./trpc";

export const loggedProcedure = publicProcedure.use(async (opts) => {
  const start = Date.now();
  const result = await opts.next();
  const durationMs = Date.now() - start;
  const log = opts.ctx.req?.log;
  const meta = { path: opts.path, type: opts.type, durationMs };
  if (result.ok) log?.info(meta, "trpc.ok");
  else log?.warn({ ...meta, code: result.error.code }, "trpc.err");
  return result;
});

export async function shortHash(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf).slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
