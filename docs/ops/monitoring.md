# Monitoring

passmgr plugs into the host's monitoring stack (Prometheus, Loki + Alloy, Grafana, Gatus, cAdvisor,
node-exporter), which lives in its own repository (`server/monitoring` on the host, README there). This repo only
exposes what it needs.

## Networks

The prod compose project joins three external networks; create them once on the host before the first deploy that
needs them:

```bash
docker network create caddy_network    # host Caddy (caddy-docker-proxy) → web
docker network create mail_network     # SMTP relay for verification mails (docs/ops/email.md) and alert mails
docker network create passmgr_metrics_network  # Prometheus + Gatus → server /metrics and /health
```

`server` sits on `passmgr_metrics_network` with the alias `passmgr-server`; Prometheus scrapes `passmgr-server:3000/metrics`
(job `passmgr`, 15 s) and Gatus checks `passmgr-server:3000/health`. Both routes sit outside `PREFIX`, the only path the
public proxy forwards, and no host port is published, so they are not reachable from the internet. Only Prometheus and Gatus may join `passmgr_metrics_network`: a Docker network exposes the server's whole port 3000,
including `/trpc` past Caddy, and with `TRUST_PROXY=uniquelocal` its members count as trusted proxies (they could set
`X-Forwarded-For` and dodge the per-IP rate limit). Check after a
deploy: `curl -i https://<PUBLIC_HOSTNAME>/metrics` must not return Prometheus text.

## Metrics

`apps/server/src/metrics.ts`, all prefixed `passmgr_`:

| Metric                              | Labels                           | Counts                                                           |
| ----------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| default process / Node.js metrics   |                                  | memory, CPU, event loop lag, handles                             |
| `trpc_requests_total`               | `path`, `type`, `code`           | every tRPC call (`loggedProcedure`)                              |
| `trpc_request_duration_seconds`     | `path`, `type`                   | tRPC call duration histogram                                     |
| `dependency_up`                     | `dependency` (`db`, `redis`)     | health check at scrape time                                      |
| `auth_failures_total`               | `flow`, `stage`, `reason`        | denied login, device login and second factor steps              |
| `recovery_attempts_total`           | `stage`, `outcome`               | recovery steps, `ok` or the denial reason                        |
| `logins_total`                      | `method` (`password`, `device`), `second_factor` | completed logins (session created)            |
| `active_users`                      | `window` (`1d`, `7d`, `30d`)     | approx. distinct users with an authenticated request (gauge, see below) |
| `rate_limited_total`                | `limiter` (`ip`, `login`, `email_code`) | refused by the per-IP limit, the account login throttle or the code resend cap |
| `email_verification_total`          | `event`                          | codes sent / failed to send, verified, invalid, expired          |
| `client_errors_total`               | `kind`, `area`, `platform`, `version` | crashes reported by the apps, see Client crashes             |

Labels are fixed strings from the code. Never add a user id, vault id, email (or its hash) or IP as a label.

Active users: every authenticated request adds its user id to a Redis HyperLogLog for the UTC day
(`activeusers:<YYYY-MM-DD>`, kept 31 days, `recordActiveUser` in `util/redis-utils.ts`); the gauge counts the union of
the last 1 / 7 / 30 days at scrape time. A HyperLogLog yields only an approximate count (~1 %), not the members, so no
per-user last-seen record exists. Local-only vaults never talk to the server and are not counted. Page visits are not
counted.

## Client crashes

Crashes in the apps (a route boundary catching, an unhandled rejection, an uncaught error) are counted on the server,
without any detail: the apps call the public `clientError.report` mutation with `kind` (`render`, `rejection`,
`uncaught`), `area` (`auth`, `records`, `settings`, `app`), `platform` (`web`, `ios`, `android`) and `version` (release tag,
else `other`). `clientErrorInputSchema` (`packages/schema`) is strict enums, so no message, stack, error ID, URL or user
id can arrive. The server keeps at most 20 distinct versions as labels; later ones count as `other`.

Sent only while an account session is attached (`useClientErrorReporting`, `mode === "online"`): a local vault never talks
to the server, and a crash on the unlock screen isn't counted. At most 5 reports per app run, once per error object. The
usual per-IP rate limit applies.

What a count can't tell: the stack. For that the user copies the "Copy error details" text (no message, no record data)
from the error screen or toast and sends it.

## Dashboards and alerts

Provisioned from files in the monitoring repo (`grafana/provisioning`, `grafana/dashboards/passmgr.json`): datasources
with fixed uids `prometheus` / `loki`, the `passmgr` dashboard, and Grafana alert rules mailed to `ALERT_EMAIL`:
metrics target down, 5xx responses, failed-login and recovery spikes, host disk > 85 %, container restart loop, Gatus
check failing, more than 10 client crashes in 15 minutes. The dashboard's `project` variable is the compose project name of this deployment (default `passmgr`).

## Logs

Pino JSON to stdout; Alloy ships every container's log to Loki, which keeps it 14 days (`retention_period: 336h`).
What gets logged and what never does: `docs/security/threat-model-inputs.md` (Server logs). The redaction lives in
`apps/server/src/log-options.ts` and is tested in `log-options.test.ts`; Alloy repeats it for `passmgr*` compose
projects (drops debug lines, full client IPs, secret fields that slip through).
