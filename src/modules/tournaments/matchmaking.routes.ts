import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, validateBody, validateParams } from '../../utils/http';
import { requireAuth } from '../../middlewares/auth';
import * as matchmakingService from './matchmaking.service';

export const matchRouter = Router();

const resultBodySchema = z.object({ winnerId: z.string().min(1) });
const matchIdParamsSchema = z.object({ id: z.string().min(1) });

matchRouter.post(
  '/:id/result',
  requireAuth,
  validateParams(matchIdParamsSchema),
  validateBody(resultBodySchema),
  asyncHandler(async (req, res) => {
    const match = await matchmakingService.reportMatchResult(
      req.params.id,
      req.body.winnerId,
      req.userId,
    );
    ok(res, match);
  }),
);
