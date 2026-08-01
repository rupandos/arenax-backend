import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, validateQuery } from '../../utils/http';
import { requireAuth } from '../../middlewares/auth';
import * as leaderboardService from './leaderboard.service';

export const leaderboardRouter = Router();

const topQuerySchema = z.object({
  period: z.enum(['daily', 'weekly']).default('daily'),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

leaderboardRouter.get(
  '/top',
  validateQuery(topQuerySchema),
  asyncHandler(async (req, res) => {
    const { period, limit } = req.query as { period: 'daily' | 'weekly'; limit: number };
    const entries = await leaderboardService.getTop(limit, period);
    ok(res, { period, entries });
  }),
);

leaderboardRouter.get(
  '/me',
  requireAuth,
  validateQuery(z.object({ period: z.enum(['daily', 'weekly']).default('daily') })),
  asyncHandler(async (req, res) => {
    const period = (req.query.period as 'daily' | 'weekly') ?? 'daily';
    const result = await leaderboardService.getUserRank(req.userId, period);
    ok(res, { period, ...result });
  }),
);
