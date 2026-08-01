import { Router } from 'express';
import { asyncHandler, ok } from '../../utils/http';
import { checkDatabaseConnection, prisma } from '../../lib/prisma';
import { checkRedisConnection, redis } from '../../lib/redis';

export const healthRouter = Router();

healthRouter.get('/live', (_req, res) => {
  ok(res, { status: 'ok', uptime: process.uptime() }, 200);
});

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await checkDatabaseConnection();
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      await checkRedisConnection();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const ready = Object.values(checks).every((s) => s === 'ok');
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
