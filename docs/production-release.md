# NostrLab Production Release Runbook

This is the release gate for a public NostrLab deployment. Use `db push` only for local development; production deploys must use Prisma migrations.

## Required Infrastructure

- HTTPS load balancer in front of stateless `web` nodes.
- PostgreSQL behind PgBouncer or a connection-limited pool.
- Redis/Valkey shared by every web node.
- External Blossom media server or S3-compatible object storage for uploads.
- One dedicated `worker` process for relay ingestion.
- Error monitoring webhook endpoint.
- Uptime checks against `/api/health` and `/api/ready`.

## Environment Gates

Set these on every web node:

```bash
NODE_ENV=production
NOSTRLAB_RUNTIME_ROLE=web
ENABLE_RELAY_LISTENER=false
ENABLE_PAYMENT_RECONCILER=false
NEXT_PUBLIC_APP_URL=https://your-domain.example
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
NOSTRLAB_SESSION_SECRET=$(openssl rand -hex 32)
NOSTRLAB_ADMIN_PUBKEY=npub...
NOSTRLAB_METRICS_TOKEN=$(openssl rand -hex 32)
NOSTRLAB_ERROR_WEBHOOK_URL=https://...
NOSTRLAB_APP_NSEC=nsec...
NEXT_PUBLIC_NOSTRLAB_APP_PUBKEY=<hex pubkey>
LIGHTNING_MODE=lnurl
UPLOAD_BACKEND=blossom
BLOSSOM_SERVER_URL=https://blossom.nostr.build
# Optional. If omitted, Blossom uploads use NOSTRLAB_APP_NSEC.
BLOSSOM_SIGNING_NSEC=
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net
NEXT_PUBLIC_NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net
```

If you prefer S3-compatible storage instead of Blossom, set `UPLOAD_BACKEND=s3` and configure `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, and `OBJECT_STORAGE_PUBLIC_BASE_URL`.

Set these only on the relay worker:

```bash
NODE_ENV=production
NOSTRLAB_RUNTIME_ROLE=worker
ENABLE_RELAY_LISTENER=true
NOSTRLAB_RELAY_RSVP_COORD_LIMIT=500
NOSTRLAB_RELAY_EVENT_INGEST_CONCURRENCY=4
NOSTRLAB_RELAY_DELETION_INGEST_CONCURRENCY=4
NOSTRLAB_RELAY_RSVP_INGEST_CONCURRENCY=8
ENABLE_PAYMENT_RECONCILER=true
PAYMENT_RECONCILE_INTERVAL_MS=30000
PAYMENT_RECONCILE_BATCH_SIZE=100
```

Increase `NOSTRLAB_RELAY_RSVP_COORD_LIMIT` only after checking `/api/ops/metrics`.
The listener prioritizes upcoming events, then recent past events, so the worker
does not open unbounded relay filters as the index grows.

## Deployment

1. Build the release artifact:

   ```bash
   pnpm install --frozen-lockfile
   pnpm verify
   ```

2. Check production env and migration state:

   ```bash
   pnpm release:check
   ```

3. Back up the current production database:

   ```bash
   pnpm backup:postgres
   ```

4. Apply migrations:

   ```bash
   pnpm db:deploy
   ```

5. Start web nodes:

   ```bash
   NOSTRLAB_RUNTIME_ROLE=web ENABLE_RELAY_LISTENER=false pnpm start
   ```

6. Start one worker:

   ```bash
   NOSTRLAB_RUNTIME_ROLE=worker ENABLE_RELAY_LISTENER=true ENABLE_PAYMENT_RECONCILER=true pnpm start
   ```

7. Smoke the deployed domain:

   ```bash
   curl -fsS https://your-domain.example/api/health
   curl -fsS https://your-domain.example/api/ready
   curl -fsS -H "Authorization: Bearer $NOSTRLAB_METRICS_TOKEN" https://your-domain.example/api/ops/metrics
   ```

## Real Lightning Verification

Before opening paid tickets, request a real invoice from a production wallet:

```bash
NOSTRLAB_LNURL_TEST_ADDRESS=organizer@example.com \
NOSTRLAB_LNURL_TEST_AMOUNT_SATS=1 \
pnpm test:lnurl:live
```

To prove settlement, manually pay the printed invoice and poll:

```bash
NOSTRLAB_LNURL_TEST_ADDRESS=organizer@example.com \
NOSTRLAB_LNURL_TEST_AMOUNT_SATS=1 \
NOSTRLAB_LNURL_WAIT_SECONDS=180 \
pnpm test:lnurl:live
```

Run a full paid-ticket browser flow after that: create a paid event, buy a ticket with a real wallet, confirm `/api/invoices/[id]` returns `PAID`, open the ticket, and scan/check it in as organizer.

Paid tickets are issued only after settlement produces a Lightning preimage.
The ticket QR contains a signed NostrLab ticket credential, the ticket secret,
and the payment preimage. The door scanner verifies the Nostr signature, ticket
secret hash, payment hash, and preimage before marking the ticket checked in.

## Monitoring

- `/api/health` should be your load-balancer liveness check.
- `/api/ready` should be your deployment readiness check; it fails when DB, Redis, or required production env is not ready.
- `/api/ops/metrics` is bearer-protected with `NOSTRLAB_METRICS_TOKEN`.
- Server logs are JSON lines with `service`, `event`, `release`, and `runtimeRole`.
- Unhandled server errors are posted to `NOSTRLAB_ERROR_WEBHOOK_URL`.

Alert on:

- `/api/ready` returning non-200.
- pending payments increasing without matching paid payments.
- payment reconciler failures or stale `lastRunAt`.
- relay listener `failed` counters increasing.
- Postgres slow queries and connection saturation.
- Redis connection errors.

## Backup And Restore

Create a custom-format Postgres backup:

```bash
BACKUP_DIR=/var/backups/nostrlab pnpm backup:postgres
```

Restore into a replacement database:

```bash
DATABASE_URL=postgresql://... pnpm restore:postgres -- /var/backups/nostrlab/nostrlab-YYYYMMDDTHHMMSSZ.dump
```

Test restore before public release. A backup that has never been restored is not a working backup.

## Release Decision

Do not announce a public release until all of these pass on the deployed domain:

- `pnpm release:verify`
- `pnpm test:e2e:api` against the deployed app with `NOSTRLAB_E2E_BASE_URL`
- `pnpm test:e2e:nostr` against the production database or staging clone
- `pnpm test:e2e:ticket-proof`
- `NOSTRLAB_LOAD_BASE_URL=https://your-domain.example NOSTRLAB_LOAD_USERS=100 pnpm test:load`
- `pnpm test:lnurl:live` against a real organizer wallet
- `/api/health`, `/api/ready`, and `/api/ops/metrics`
- backup and restore drill
- admin pubkey confirmed at `/admin`
