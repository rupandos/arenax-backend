# ArenaX Backend

Production game backend for the ArenaX platform: wallet authentication,
tournaments, reward distribution, leaderboards, marketplace, and real-time
notifications.

> Demo codebase — commits follow a full feature evolution timeline
> (see `git log --oneline`).

## Stack

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Runtime    | Node.js 22, TypeScript, Express                   |
| Database   | PostgreSQL (Prisma ORM)                           |
| Cache      | Redis (caching, distributed locks, rate limiting) |
| Queues     | BullMQ (reward processing)                        |
| Realtime   | Socket.IO (notifications, match events)           |
| Auth       | Wallet signature (Ed25519) + JWT access/refresh   |
| Testing    | Vitest                                            |
| CI         | GitHub Actions                                    |

## Folder structure

```
src/
  config/          # env validation (zod), constants
  lib/             # prisma, redis, cache, queue, logger
  middlewares/     # auth, rate limiting, request id
  modules/
    auth/          # wallet challenge/verify, JWT, sessions
    users/         # profile + stats
    tournaments/   # CRUD, lifecycle, matchmaking
    rewards/       # queue, worker, NFT status, retries
    leaderboard/   # sorted sets, caching, reset
    marketplace/   # listings, purchases, inventory
    notifications/ # REST + socket notifications
    health/        # liveness / readiness probes
  jobs/            # tournament scheduler, leaderboard reset
  sockets/         # Socket.IO server + emitter bus
  docs/            # OpenAPI spec (served at /api-docs)
  app.ts           # express app assembly
  server.ts        # bootstrap + graceful shutdown
tests/             # unit tests
docs/              # API documentation
.github/workflows/ # CI pipeline
prisma/            # schema + migrations
```

## Getting started

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run prisma:migrate
npm run dev
```

Server listens on `http://localhost:3000`. Interactive API docs at
`/api-docs`.

## Scripts

| Script                | Description                          |
| --------------------- | ------------------------------------ |
| `npm run dev`         | Run with hot reload (`tsx watch`)    |
| `npm run build`       | Compile TypeScript to `dist/`        |
| `npm start`           | Run the compiled server              |
| `npm run lint`        | ESLint                               |
| `npm run typecheck`   | TypeScript type checking             |
| `npm test`            | Vitest unit tests                    |
| `npm run prisma:migrate` | Create/apply dev migrations      |
| `npm run prisma:deploy`  | Apply migrations in production   |

## Architecture notes

- **Wallet login**: challenge nonce (Redis, 5 min TTL, single use) →
  Ed25519 signature verification → user upsert → refresh-token session
  (hashed in Postgres, rotated on use, reuse detection revokes all sessions).
- **Tournaments**: cron scheduler transitions `OPEN → STARTED → COMPLETED`
  under a Redis distributed lock; match watchdog force-resolves timeouts;
  completion distributes prizes via the reward queue and notifies players.
- **Rewards**: BullMQ queue with exponential-backoff retries (max 5) and
  dead-letter marking; duplicate processing prevented by an atomic
  `PENDING → PROCESSING` status transition; crash recovery re-queues
  orphaned jobs on boot.
- **Leaderboards**: Redis sorted sets per period; top-N cached with
  invalidation on score changes; daily reset (00:00 UTC) persists the top
  100 to Postgres.
- **Marketplace**: atomic purchase transaction (claim listing → transfer
  asset → record transaction), idempotent via `idempotencyKey`.
- **Notifications**: persisted rows + Socket.IO push to per-user rooms,
  authenticated with the JWT.

## Documentation

- [docs/API.md](docs/API.md) — full API reference with examples
- `/api-docs` — interactive Swagger UI (OpenAPI 3.1)
