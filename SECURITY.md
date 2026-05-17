# Security Policy

## Reporting

Please report security issues privately through GitHub Security Advisories once the public repository is available. Do not open a public issue for vulnerabilities.

If GitHub advisories are unavailable, contact the maintainer through the project profile linked from the NostrLab footer and include:

- affected route, API, or component;
- reproduction steps;
- expected impact;
- suggested fix, if known.

## Scope

Security-sensitive areas include Nostr signature verification, organizer and co-host authorization, community ownership, paid ticket issuance, Lightning settlement verification, ticket proof validation, uploads, rate limiting, and operational endpoints.

## Handling Secrets

Never commit `.env`, Nostr private keys, session secrets, object storage credentials, Lightning provider credentials, database dumps, or backup files.
