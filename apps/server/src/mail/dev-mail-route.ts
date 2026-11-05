import { emailSchema } from "@repo/schema";
import type { FastifyInstance } from "fastify";
import { DevMailer, getMailer } from "./mailer";

/**
 * `POST /dev/mail` `{ email }` → the latest mail `DevMailer` kept for that
 * address (404 without one). Only with `MAIL_DEV=true`, and like the other ops
 * routes outside `PREFIX`, so the public proxy never forwards it.
 */
export function registerDevMailRoute(app: FastifyInstance) {
  const mailer = getMailer();
  if (!(mailer instanceof DevMailer)) return;
  app.log.warn("mail.dev: mail is kept in memory and readable on /dev/mail, not sent");

  app.post("/dev/mail", { config: { rateLimit: false } }, async (req, reply) => {
    const parsed = emailSchema.safeParse((req.body as { email?: unknown } | undefined)?.email);
    const mail = parsed.success ? mailer.latest(parsed.data) : undefined;
    if (!mail) return reply.code(404).send({});
    return reply.header("cache-control", "no-store").send(mail);
  });
}
