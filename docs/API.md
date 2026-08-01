# ArenaX API Documentation

Base URL: `http://localhost:3000` (production: `https://api.arenax.example`)

Interactive docs: [`/api-docs`](http://localhost:3000/api-docs) (Swagger UI).
OpenAPI spec: [`src/docs/openapi.ts`](../src/docs/openapi.ts).

All authenticated endpoints use `Authorization: Bearer <accessToken>`.

---

## Authentication

Wallet-based login (Ed25519 / Solana-style signatures). No passwords.

### 1. Request a challenge

`POST /api/auth/wallet/challenge`

```json
{ "walletAddress": "GXtestVallLet1111111111111111111111111111" }
```

Response: `200`

```json
{
  "data": {
    "nonce": "a1b2c3...",
    "message": "ArenaX wants you to sign in with your wallet.\n\nNonce: a1b2c3...\n\n..."
  }
}
```

The nonce is stored in Redis for 5 minutes and can only be used once.

### 2. Verify the signature

`POST /api/auth/wallet/verify`

```json
{
  "walletAddress": "GXtestVallLet1111111111111111111111111111",
  "publicKey": "<base64 32-byte Ed25519 public key>",
  "signature": "<base64 64-byte Ed25519 signature over `message`>",
  "nonce": "a1b2c3..."
}
```

Response: `201`

```json
{
  "data": {
    "user": { "id": "cmx...", "walletAddress": "...", "username": "player_abc..." },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "abc...",
      "expiresIn": 900
    }
  }
}
```

### 3. Refresh tokens

`POST /api/auth/refresh` `{ "refreshToken": "abc..." }`

Refresh tokens are rotated on every use. Reuse of a revoked token revokes
all sessions for the user (reuse detection).

### 4. Logout

`POST /api/auth/logout` `{ "refreshToken": "abc..." }`

---

## Users

| Method | Path            | Auth | Description                          |
| ------ | --------------- | ---- | ------------------------------------ |
| GET    | /api/users/me   | yes  | Own profile with aggregated stats    |
| PATCH  | /api/users/me   | yes  | Update `username` / `avatarUrl`      |
| GET    | /api/users/:id  | yes  | Public profile by id or username     |

---

## Tournaments

| Method | Path                                  | Auth | Description                        |
| ------ | ------------------------------------- | ---- | ---------------------------------- |
| GET    | /api/tournaments                      | no   | List (filter: `status`, paging)    |
| POST   | /api/tournaments                      | admin| Create tournament                 |
| GET    | /api/tournaments/:id                  | no   | Details + players + winner         |
| PATCH  | /api/tournaments/:id                  | yes  | Edit (only DRAFT/OPEN)             |
| POST   | /api/tournaments/:id/cancel           | admin| Cancel tournament                 |
| POST   | /api/tournaments/:id/join             | yes  | Register                           |
| POST   | /api/tournaments/:id/leave            | yes  | Withdraw (while OPEN)              |
| POST   | /api/tournaments/:id/matchmaking/join | yes  | Enter matchmaking queue            |

**Lifecycle** (managed by the scheduler):

- `OPEN` → `STARTED` automatically at `startTime` (Redis-distributed lock).
- `STARTED` → `COMPLETED` at `endTime`; ranks computed from scores, prizes
  enqueued as rewards, participants notified.
- Matches that time out (5 min) are auto-resolved by the watchdog; unresolved
  matches are force-finished at completion.

**Prize split:** 1st 50%, 2nd 30%, 3rd 15%, 4th 5% of `prizePool`.

### Matches

| Method | Path                    | Auth | Description                        |
| ------ | ----------------------- | ---- | ---------------------------------- |
| POST   | /api/matches/:id/result | yes  | Report winner (`{ "winnerId": ... }`) |

Reported results increment the winner's score, eliminate the loser, and award
leaderboard points (win: +10, loss: +2).

---

## Rewards

Rewards are created as `PENDING`, processed by a BullMQ worker, and can be
retried with exponential backoff (max 5 attempts).

| Method | Path                   | Auth | Description                          |
| ------ | ---------------------- | ---- | ------------------------------------ |
| GET    | /api/rewards           | yes  | Own rewards (paged)                  |
| GET    | /api/rewards/:id       | yes  | Reward details                       |
| POST   | /api/rewards/:id/retry | yes  | Requeue a FAILED reward              |
| POST   | /api/rewards/retry-all | admin| Requeue all FAILED rewards (batch)   |
| GET    | /api/rewards/:id/nft-status | yes | NFT mint status for NFT rewards |

Status flow: `PENDING → PROCESSING → SUCCEEDED` or `FAILED`.

Duplicate processing is prevented by an atomic status transition
(`UPDATE ... WHERE status = 'PENDING'`).

---

## Leaderboard

Backed by Redis sorted sets, cached top-N reads (cache invalidated on score
changes), daily reset at 00:00 UTC persists the top 100 to PostgreSQL.

| Method | Path                 | Auth | Description                         |
| ------ | -------------------- | ---- | ----------------------------------- |
| GET    | /api/leaderboard/top | no   | `?period=daily\|weekly&limit=10`    |
| GET    | /api/leaderboard/me  | yes  | Own rank + points                   |

---

## Marketplace

| Method | Path                                    | Auth | Description                          |
| ------ | --------------------------------------- | ---- | ------------------------------------ |
| GET    | /api/marketplace/listings               | no   | Listings (paged, cached 30s)         |
| POST   | /api/marketplace/listings               | yes  | List owned asset `{ assetId, price }`|
| POST   | /api/marketplace/listings/:id/cancel    | yes  | Cancel own listing                   |
| POST   | /api/marketplace/listings/:id/purchase  | yes  | Buy with `{ idempotencyKey }`        |
| GET    | /api/marketplace/inventory              | yes  | Own assets with listing status       |

Purchases are atomic (listing claim → transaction → ownership transfer),
idempotent via `idempotencyKey`, and notify both parties.

---

## Notifications

Persisted in PostgreSQL and pushed in real time over Socket.IO.

| Method | Path                            | Auth | Description              |
| ------ | ------------------------------- | ---- | ------------------------ |
| GET    | /api/notifications              | yes  | List (paged)             |
| GET    | /api/notifications/unread-count | yes  | Unread count             |
| POST   | /api/notifications/read-all     | yes  | Mark all read            |
| POST   | /api/notifications/:id/read     | yes  | Mark one read            |

### WebSocket events

Connect with `{ auth: { token: "<accessToken>" } }`.

| Event                  | Payload                                       |
| ---------------------- | --------------------------------------------- |
| `notification:new`     | `{ id, type, title, body, data, createdAt }`  |
| `tournament:started`   | `{ tournamentId, name, startTime }`           |
| `tournament:ended`     | `{ tournamentId, rank, winnerId }`            |
| `match:found`          | `{ matchId, tournamentId, opponentId }`       |
| `match:won` / `match:lost` | `{ matchId, tournamentId }`               |
| `matchmaking:queued`   | `{ tournamentId }`                            |
| `reward:claimed`       | `{ rewardId, amount, currency }`              |
| `marketplace:purchased` / `marketplace:sold` | `{ transactionId, assetId, price, currency }` |

---

## Health

| Method | Path          | Description                                      |
| ------ | ------------- | ------------------------------------------------ |
| GET    | /health       | Service info                                     |
| GET    | /health/live  | Liveness                                        |
| GET    | /health/ready | Readiness: checks Postgres + Redis with latency  |

---

## Errors

All errors use a consistent shape:

```json
{
  "error": {
    "code": "TOURNAMENT_NOT_FOUND",
    "message": "Tournament does not exist",
    "details": {}
  }
}
```

Common codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `INVALID_SIGNATURE`, `INVALID_NONCE`,
`REFRESH_TOKEN_REVOKED`.
