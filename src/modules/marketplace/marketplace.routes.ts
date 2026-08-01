import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, okPaged, validateBody, validateQuery, validateParams } from '../../utils/http';
import { requireAuth } from '../../middlewares/auth';
import * as marketplaceService from './marketplace.service';

export const marketplaceRouter = Router();

const listAssetSchema = z.object({
  assetId: z.string().min(1),
  price: z.number().int().positive().max(1_000_000_000),
});

const listQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'SOLD', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const purchaseSchema = z.object({
  idempotencyKey: z.string().min(8).max(64),
});

marketplaceRouter.get(
  '/listings',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const { status, page, pageSize } = req.query as { status?: string; page: number; pageSize: number };
    const result = await marketplaceService.getListings({ status, page, pageSize });
    okPaged(res, result.items, result.total, page, pageSize);
  }),
);

marketplaceRouter.post(
  '/listings',
  requireAuth,
  validateBody(listAssetSchema),
  asyncHandler(async (req, res) => {
    await marketplaceService.listAsset(req.userId, req.body.assetId, req.body.price);
    ok(res, { success: true }, 201);
  }),
);

marketplaceRouter.post(
  '/listings/:id/cancel',
  requireAuth,
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    await marketplaceService.cancelListing(req.userId, req.params.id);
    ok(res, { success: true });
  }),
);

marketplaceRouter.post(
  '/listings/:id/purchase',
  requireAuth,
  validateParams(idParamsSchema),
  validateBody(purchaseSchema),
  asyncHandler(async (req, res) => {
    const result = await marketplaceService.purchaseListing(
      req.userId,
      req.params.id,
      req.body.idempotencyKey,
    );
    ok(res, result);
  }),
);
