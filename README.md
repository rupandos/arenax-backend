# ArenaX Backend

Production game backend for the ArenaX platform: wallet authentication, tournaments,
reward distribution, leaderboards, marketplace, and real-time notifications.

## Stack

- Node.js + TypeScript
- Express
- PostgreSQL + Prisma
- Redis (cache, locks, queues)
- BullMQ (reward queue)
- Socket.IO (real-time notifications)
- JWT (wallet-signature auth with refresh rotation)

## Getting started

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run prisma:migrate
npm run dev
```

See [docs/API.md](docs/API.md) for API documentation. Interactive docs run at `/api-docs`.
