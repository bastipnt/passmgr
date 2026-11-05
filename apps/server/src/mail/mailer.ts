import { createTransport } from "nodemailer";

export type Mail = { to: string; subject: string; text: string };

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Keeps every mail in memory (latest per recipient) instead of sending it. */
export class DevMailer implements Mailer {
  private readonly outbox = new Map<string, Mail>();

  async send(mail: Mail): Promise<void> {
    this.outbox.set(mail.to, mail);
  }

  latest(to: string): Mail | undefined {
    return this.outbox.get(to);
  }
}

class SmtpMailer implements Mailer {
  private readonly transport;
  private readonly from: string;

  constructor(url: string, from: string) {
    this.transport = createTransport(url);
    this.from = from;
  }

  async send({ to, subject, text }: Mail): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, to, subject, text });
    } catch (err) {
      // SMTP replies can quote the recipient; the error ends up in logs.
      const code = (err as { code?: unknown }).code;
      throw new Error(`SMTP send failed${typeof code === "string" ? ` (${code})` : ""}`);
    }
  }
}

/**
 * `SMTP_URL` (+ `MAIL_FROM`) sends real mail; `MAIL_DEV=true` keeps it in
 * memory for development and E2E, readable on the ops route `/dev/mail`;
 * neither turns email verification off.
 */
function mailerFromEnv(env: NodeJS.ProcessEnv): Mailer | null {
  if (env.SMTP_URL) {
    if (!env.MAIL_FROM) throw new Error("MAIL_FROM is required with SMTP_URL");
    return new SmtpMailer(env.SMTP_URL, env.MAIL_FROM);
  }
  if (env.MAIL_DEV === "true") return new DevMailer();
  return null;
}

let current: Mailer | null = mailerFromEnv(process.env);

export function getMailer(): Mailer | null {
  return current;
}

/** Tests: swap the mailer (null: verification off). */
export function setMailer(mailer: Mailer | null): void {
  current = mailer;
}
