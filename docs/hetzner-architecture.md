# NostrLab Hetzner Architecture

Target: at least 500k registered/active Nostr identities with bursty event discovery, RSVP, ticket-purchase, and check-in traffic.

## Production Topology

```
Internet
  |
  | HTTPS
  v
Hetzner Cloud Load Balancer
  |
  | private network
  v
Next.js web pool, 3+ stateless servers
  |        |          |
  |        |          +--> Nostr relays
  |        +------------> Redis/Valkey
  +---------------------> PgBouncer -> PostgreSQL primary
                            |
                            +--> read replica(s)

Dedicated worker pool
  |
  +--> relay listener / RSVP ingest
  +--> profile refresh jobs
  +--> invoice reconciliation
  +--> notification delivery and saved event alerts

Media storage
  |
  +--> external Blossom server or S3 bucket for event banners and community images
  +--> S3/object storage for backups
```

Hetzner components:

- Cloud Load Balancer for HTTP/TLS traffic and app-node fanout. Hetzner documents round-robin and least-connections balancing, private-network attachment, and managed Let's Encrypt certificates.
- Cloud Firewalls and a private Network. Only the load balancer should reach web nodes over app ports; only app/worker nodes should reach Postgres, PgBouncer, and Redis.
- External Blossom storage for uploaded media when you do not want to run media infrastructure. `https://blossom.nostr.build` works as the default managed Blossom endpoint.
- Object Storage for backup artifacts, exports, or media if you choose `UPLOAD_BACKEND=s3`. Hetzner Object Storage is S3-compatible and bucket-based.
- Volumes only for node-local operational data. Do not use local `public/uploads` in multi-node production.

## Runtime Roles

### Web

Run `next start` as a stateless service. Scale horizontally behind the load balancer. The app now uses httpOnly signed session cookies, so web nodes do not need sticky sessions.

Production web env:

```
NODE_ENV=production
NOSTRLAB_RUNTIME_ROLE=web
TRUST_PROXY_HEADERS=true
ENABLE_RELAY_LISTENER=false
ENABLE_PAYMENT_RECONCILER=false
NOSTRLAB_SESSION_SECRET=<32+ random bytes>
DATABASE_URL=postgresql://pgbouncer/...
REDIS_URL=rediss://...
NOSTRLAB_ADMIN_PUBKEY=<npub or hex>
NOSTRLAB_METRICS_TOKEN=<32+ random bytes>
```

### Worker

Run the same build as a worker process with:

```
NOSTRLAB_RUNTIME_ROLE=worker
ENABLE_RELAY_LISTENER=true
ENABLE_PAYMENT_RECONCILER=true
ENABLE_NOTIFICATION_DELIVERY=true
ENABLE_EVENT_ALERTS=true
```

Only one worker should subscribe to relay events and reconcile payments at first. At larger volume, shard relay ingest by event coordinate hash so each shard owns a disjoint set of subscriptions, and split payment reconciliation into its own worker/queue.

The built-in relay listener caps active RSVP coordinates with
`NOSTRLAB_RELAY_RSVP_COORD_LIMIT` and throttles event/RSVP ingest with
`NOSTRLAB_RELAY_EVENT_INGEST_CONCURRENCY` and
`NOSTRLAB_RELAY_RSVP_INGEST_CONCURRENCY`. Deletion ingest is separately capped
with `NOSTRLAB_RELAY_DELETION_INGEST_CONCURRENCY`. Keep those conservative on public
relays; raise them only after metrics show queue depth and relay errors are
stable.

### Database

Use PostgreSQL as the canonical operational index/cache. For 500k users:

- Put PgBouncer between the app pool and Postgres.
- Keep writes on the primary; move read-heavy feeds/search/dashboard reads to replicas once Prisma query routing is introduced.
- Add indexes before growth pressure:
  - `Event(startsAt, city, mode, paymentMode)`
  - `Event(organizerPubkey, dTag)` already exists.
  - `Rsvp(eventId, status)`
  - `Ticket(eventId, buyerPubkey)`
  - `Payment(eventId, status, expiresAt)`
- Partition or archive old RSVP/payment/check-in rows after product-market fit. Feeds only need recent/upcoming events.

### Redis/Valkey

Set `REDIS_URL` in production. The app uses Redis-backed token buckets when it is configured, and falls back to process memory only for development. Also use Redis/Valkey for background-job locks and short-lived idempotency keys.

### Uploads

Upload validation is hardened and the API supports `UPLOAD_BACKEND=blossom` for an external Blossom media server, `UPLOAD_BACKEND=s3` for S3-compatible object storage, and `UPLOAD_BACKEND=local` for development. Production should use Blossom or S3; keep `public/uploads` only for local development.

### Payments

Invoice creation and polling now require the buyer's signed session. The LNURL client rejects private/local callback and verify URLs, blocks redirects, and validates DNS resolution before server-side fetches.

At scale, move invoice reconciliation to a worker queue:

- Web creates invoice and stores `Payment`.
- Worker polls or receives provider webhooks.
- Worker marks paid and issues tickets in a transaction.
- Client polls a lightweight status endpoint.

The built-in reconciler runs when `ENABLE_PAYMENT_RECONCILER=true`; it checks pending invoices, expires stale rows, and issues tickets even if the buyer closes the browser.

### Communications

In-app notifications are persisted in Postgres. The worker can deliver those notifications through Nostr DMs, webhook integrations, or both with `ENABLE_NOTIFICATION_DELIVERY=true` and `NOSTRLAB_NOTIFICATION_CHANNELS=nostr_dm,webhook`. Nostr DM delivery uses `NOSTRLAB_APP_NSEC`; webhook delivery requires a public HTTPS `NOSTRLAB_NOTIFICATION_WEBHOOK_URL`.

Saved event alerts should run only on worker nodes with `ENABLE_EVENT_ALERTS=true`. The alert scanner turns matching saved searches into notifications, so notification delivery should be enabled if you want alerts to leave the dashboard.

## Security Baseline

- Every privileged browser action signs a Nostr event.
- Auth envelopes must bind to payload hashes, not just an `action` tag.
- Organizer-only pages are server-authorized from httpOnly signed sessions.
- Ticket secrets are not transported in query strings in the main flow; the browser keeps them in URL fragments and reveals QR data through a POST body.
- Admin read/write endpoints require admin identity.
- Server-side LNURL fetches must remain restricted to public HTTPS endpoints.
- Configure Cloud Firewalls so databases and Redis have no public ingress.

## Rollout Plan

1. Single-node staging on Hetzner with Postgres, Redis, and Object Storage credentials wired but low traffic.
2. Split app and worker roles. Set `ENABLE_RELAY_LISTENER=true` only on the worker.
3. Add PgBouncer and move Postgres to a dedicated server or HA pair.
4. Add two more app nodes behind the Cloud Load Balancer.
5. Provision Redis/Valkey and set `REDIS_URL`.
6. Set `UPLOAD_BACKEND=blossom` with `BLOSSOM_SERVER_URL=https://blossom.nostr.build`, or set `UPLOAD_BACKEND=s3` with `OBJECT_STORAGE_*`.
7. Add read replicas and route feed/search reads separately from writes.
8. Add observability: structured logs, uptime checks, Postgres slow query logs, relay ingest lag, invoice settlement lag, and per-route latency.
9. Run `pnpm release:check`, `pnpm db:deploy`, the live LNURL check, and the backup/restore drill from `docs/production-release.md`.

## Capacity Notes

The app should stay stateless at the web tier. The bottlenecks at 500k users will be:

- Postgres feed/search queries without read replicas or better indexes.
- Relay ingest duplication if workers are not sharded.
- Local uploads if `UPLOAD_BACKEND=local` is used beyond development.
- Missing `REDIS_URL` if more than one web node is running.
- Nostr profile refreshes if every write path blocks on relay metadata fetches.

Treat these as production gates before opening broad public traffic.

## Built-in Release Probes

- `/api/health` is the load-balancer liveness endpoint.
- `/api/ready` checks Postgres, Redis, and production environment gates.
- `/api/ops/metrics` returns bearer-protected operational counters for dashboards and alerts.
- `pnpm release:check` verifies strict production env and Prisma migration status.
