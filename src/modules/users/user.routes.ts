import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, validateBody, validateParams } from '../../utils/http';
import { requireAuth } from '../../middlewares/auth';
import * as userService from './user.service';

export const userRouter = Router();

const updateProfileSchema = z
  .object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
    avatarUrl: z.string().url().max(500).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

const idParamsSchema = z.object({ id: z.string().min(1) });

userRouter.use(requireAuth);

userRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const profile = await userService.getProfile(req.userId);
    ok(res, profile);
  }),
);

userRouter.patch(
  '/me',
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const updated = await userService.updateProfile(req.userId, req.body);
    ok(res, updated);
  }),
);

userRouter.get(
  '/:id',
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const profile = await userService.getPublicProfile(req.params.id);
    ok(res, profile);
  }),
);
