# Online Auth

`guandan-online-codex` owns its anonymous `@handle` namespace independently.

Canonical online profile keys:

- `go:player:{handle}` for online profile records
- `go:profile:create:{ip}:{yyyy-mm-dd}` for account-creation throttle counters
- `go:*` for online-only room, game, report, telemetry, idempotency, and event-log data

`ownershipToken.ts` keeps the same token-hash pattern as the scorer for familiarity, but it validates online-owned profile records only. The raw token is shown once to the client; the server stores only a SHA-256 hex hash and validates `Authorization: Bearer <token>` by hashing the provided token and comparing in constant time.

Do not read from or write to the scorer database from this app. If a future product flow links scorer identities, implement it through an explicit API boundary and keep the Codex build's Redis/Upstash project separate.
