import { Router } from 'express';
import { asyncHandler, ok } from '../../utils/http';
import { checkDatabaseConnection, prisma } from '../../lib/prisma';
import { checkRedisConnection, redis } from '../../lib/redis';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  ok(res, {
    status: 'ok',
    service: 'arenax-backend',
    version: '0.1.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/live', (_req, res) => {
  ok(res, { status: 'ok', uptime: process.uptime() }, 200);
});

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, { status: 'ok' | 'error'; latencyMs: number }> = {};

    const databaseStart = Date.now();
    try {
      await checkDatabaseConnection();
      checks.database = { status: 'ok', latencyMs: Date.now() - databaseStart };
    } catch {
      checks.database = { status: 'error', latencyMs: Date.now() - databaseStart };
    }

    const redisStart = Date.now();
    try {
      await checkRedisConnection();
      checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
    } catch {
      checks.redis = { status: 'error', latencyMs: Date.now() - redisStart };
    }

    const ready = Object.values(checks).every((check) => check.status === 'ok');
    res.status(ready ? 200 : 503).json({
      data: {
        status: ready ? 'ready' : 'degraded',
        checks,
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

healthRouter.get(
  '/db',
  asyncHandler(async (_req, res) => {
    const result = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`;
    ok(res, { databaseTime: result[0]?.now }, 200);
  }),
);

healthRouter.get(
  '/redis',
  asyncHandler(async (_req, res) => {
    const pong = await redis.ping();
    ok(res, { pong }, 200);
  }),
);
