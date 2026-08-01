import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, okPaged, validateParams, validateQuery } from '../../utils/http';
import { requireAuth } from '../../middlewares/auth';
import * as rewardService from './reward.service';

export const rewardRouter = Router();

const idParamsSchema = z.object({ id: z.string().min(1) });
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

rewardRouter.use(requireAuth);

rewardRouter.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as { page: number; pageSize: number };
    const result = await rewardService.listRewards(req.userId, page, pageSize);
    okPaged(res, result.items, result.total, page, pageSize);
  }),
);

rewardRouter.get(
  '/:id',
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const reward = await rewardService.getReward(req.params.id, req.userId);
    ok(res, reward);
  }),
);

rewardRouter.post(
  '/:id/retry',
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const reward = await rewardService.retryReward(req.params.id, req.userId);
    ok(res, reward);
  }),
);

rewardRouter.get(
  '/:id/nft-status',
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const status = await rewardService.getNftStatus(req.params.id, req.userId);
    ok(res, status);
  }),
);
