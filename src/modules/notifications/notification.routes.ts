import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, okPaged, validateParams, validateQuery } from '../../utils/http';
import { requireAuth } from '../../middlewares/auth';
import * as notificationService from './notification.service';

export const notificationRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

notificationRouter.use(requireAuth);

notificationRouter.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as { page: number; pageSize: number };
    const result = await notificationService.listNotifications(req.userId, page, pageSize);
    okPaged(res, result.items, result.total, page, pageSize);
  }),
);

notificationRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const result = await notificationService.unreadCount(req.userId);
    ok(res, result);
  }),
);

notificationRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await notificationService.markAsRead(req.userId);
    ok(res, result);
  }),
);

notificationRouter.post(
  '/:id/read',
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const result = await notificationService.markAsRead(req.userId, req.params.id);
    ok(res, result);
  }),
);
