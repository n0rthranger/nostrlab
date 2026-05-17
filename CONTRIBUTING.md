# Contributing

Thanks for working on NostrLab. Keep changes focused, documented, and easy to review.

## Local Setup

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Use a NIP-07 signer in the browser for authenticated flows.

## Checks

Run these before opening a pull request:

```bash
pnpm prisma validate
pnpm typecheck
pnpm lint
pnpm audit --prod
pnpm build
```

For flow-level changes, also run the relevant smoke script from `package.json`.

## Pull Requests

- Keep unrelated refactors out of feature and bug-fix pull requests.
- Do not commit `.env`, generated build output, local uploads, database dumps, or screenshots.
- Add or update tests when changing ticketing, payment reconciliation, Nostr event ingestion, auth, or organizer permissions.
- Document new environment variables in `.env.example` and `README.md`.
