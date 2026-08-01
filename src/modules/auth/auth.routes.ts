import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, validateBody } from '../../utils/http';
import * as authService from './auth.service';

export const authRouter = Router();

const challengeSchema = z.object({
  walletAddress: z.string().min(1).max(64),
});

const loginSchema = z.object({
  walletAddress: z.string().min(1).max(64),
  publicKey: z.string().min(1),
  signature: z.string().min(1),
  nonce: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

authRouter.post(
  '/wallet/challenge',
  validateBody(challengeSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.requestChallenge(req.body.walletAddress);
    ok(res, result, 200);
  }),
);

authRouter.post(
  '/wallet/verify',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { walletAddress, publicKey, signature, nonce } = req.body;
    const result = await authService.walletLogin(
      { walletAddress, publicKey, signature, nonce },
      { userAgent: req.header('user-agent'), ipAddress: req.ip },
    );
    ok(res, result, 201);
  }),
);

authRouter.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const tokens = await authService.refreshSession(req.body.refreshToken, {
      userAgent: req.header('user-agent'),
      ipAddress: req.ip,
    });
    ok(res, tokens, 200);
  }),
);

authRouter.post(
  '/logout',
  validateBody(logoutSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    ok(res, { success: true }, 200);
  }),
);
