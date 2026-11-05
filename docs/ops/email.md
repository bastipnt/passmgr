# Email delivery

The server sends one kind of mail: email verification codes (`docs/architecture/auth.md`, Email verification). It
speaks plain SMTP through nodemailer (`apps/server/src/mail/mailer.ts`), so the provider is picked by env only:

| Env         | Meaning                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| `SMTP_URL`  | nodemailer connection URL. Unset = no mailer: email verification is off.                      |
| `MAIL_FROM` | Sender, e.g. `passmgr <noreply@mail.example.com>`. Required with `SMTP_URL`.                  |

`SMTP_URL` forms: `smtp://host:587` (STARTTLS when offered), `smtps://user:pass@host:465` (implicit TLS). Query
parameters set nodemailer options, `tls.*` its TLS options (`?tls.servername=mail.example.com`). URL-encode
special characters in the password.

## Development and E2E: Mailpit

[Mailpit](https://mailpit.axllent.org) catches every mail and delivers none.

- Dev: `pnpm db:up` starts it next to Postgres (`packages/db/docker-compose.yml`). SMTP on `localhost:1025`, web UI and
  API on <http://localhost:8025>. Set `SMTP_URL=smtp://localhost:1025` and a `MAIL_FROM` in `apps/server/.env`.
- E2E: `docker-compose.test.yml` runs it as `mailpit` (the server sends to `smtp://mailpit:1025`); its API is on
  `MAILPIT_PORT` (default 8025). `verifyEmail` in `apps/web/e2e/helpers/auth.ts` reads the code from
  `GET /api/v1/search?query=to:"…"` + `GET /api/v1/message/{ID}`.

## Production: Stalwart

`docker-compose.prod.yml` has an opt-in [Stalwart](https://stalw.art) service (profile `mail`). Any other SMTP relay
works the same way: set `SMTP_URL` / `MAIL_FROM` and leave the profile off.

### Setup

1. Pick a sending hostname, e.g. `mail.example.com` (`MAIL_HOSTNAME`, default `mail.${PUBLIC_HOSTNAME}`), on a host
   whose provider allows outbound port 25 and lets you set reverse DNS.
2. In `.env.production` (see `.env.production.example`): `COMPOSE_PROFILES=mail` (so the deploy script's `compose up` starts and keeps Stalwart), and
   optionally pin `STALWART_TAG` to a release.
3. Deploy, then read the generated admin password: `docker compose -f docker-compose.prod.yml --env-file .env.production logs stalwart`.
4. Open the admin UI through an SSH tunnel (it is bound to `127.0.0.1:8081` on the host):
   `ssh -L 8081:127.0.0.1:8081 <host>` → <http://localhost:8081>.
5. In the admin UI:
   - Server → Network: hostname = `MAIL_HOSTNAME`.
   - TLS: ACME with the **DNS-01** challenge (ports 80 / 443 belong to the host Caddy), for `MAIL_HOSTNAME`.
   - Domains: add the sending domain; Stalwart generates the DKIM key and shows the DNS records to publish.
   - Accounts: add an account for the server to authenticate with (e.g. `passmgr`), allowed to send as `MAIL_FROM`.
6. Point the server at it, inside the Docker network (no hairpin through the host):
   `SMTP_URL=smtp://passmgr:<password>@stalwart:587?tls.servername=mail.example.com` (STARTTLS, certificate checked
   against the public name), `MAIL_FROM=passmgr <noreply@mail.example.com>`. Port 587 is not published on the host.
7. Redeploy; register a test account and check that the code arrives.

Ports published on the host: 25 (inbound: bounces, DMARC reports, MX), 465 (submission, for clients outside the
stack). Open them in the host firewall.

### DNS

For a sending domain `mail.example.com` on IP `203.0.113.10`:

| Record                        | Value                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| `A mail.example.com`          | `203.0.113.10` (and `AAAA` if IPv6 is used to send)                        |
| PTR (rDNS, at the provider)   | `203.0.113.10` → `mail.example.com` (must match the hostname Stalwart greets with) |
| `MX mail.example.com`         | `10 mail.example.com` (receive bounces and reports)                        |
| `TXT mail.example.com` (SPF)  | `v=spf1 a mx -all`                                                         |
| `TXT <selector>._domainkey.…` | DKIM public key from Stalwart                                              |
| `TXT _dmarc.mail.example.com` | `v=DMARC1; p=none; rua=mailto:dmarc@mail.example.com` (raise later, see the checklist) |

### Deliverability checklist

Deliverability (IP reputation, rDNS, SPF / DKIM / DMARC), not the software, is the real risk of sending yourself.

- [ ] Dedicated sending (sub)domain, not the main domain's mail.
- [ ] The IP is on no blocklist (check MXToolbox / Spamhaus) and its rDNS matches `MAIL_HOSTNAME`.
- [ ] SPF, DKIM and DMARC published and passing (see the headers of a mail sent to a Gmail / Outlook inbox).
- [ ] TLS certificate valid for `MAIL_HOSTNAME`.
- [ ] A test mail to [mail-tester.com](https://www.mail-tester.com) scores 9/10 or better.
- [ ] Verification mail lands in the inbox, not spam, at Gmail, Outlook and one smaller provider.
- [ ] After a week: DMARC aggregate reports show no failures, then raise the policy to `p=quarantine` / `p=reject`.
