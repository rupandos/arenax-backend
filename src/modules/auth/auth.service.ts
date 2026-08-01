import { randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { UnauthorizedError, AppError } from '../../utils/errors';
import {
  buildSignMessage,
  generateNonce,
  hashRefreshToken,
  isValidWalletAddress,
  normalizeWalletAddress,
  verifyEd25519Signature,
} from './wallet';
import { signAccessToken, verifyRefreshToken } from './jwt';
import { config } from '../../config/env';

const CHALLENGE_TTL_SECONDS = 300;
const MAX_SESSIONS_PER_USER = 10;

export interface ChallengeResult {
  nonce: string;
  message: string;
}

export interface WalletLoginInput {
  walletAddress: string;
  publicKey: string;
  signature: string;
  nonce: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function userFromWallet(walletAddress: string) {
  const username = `player_${walletAddress.slice(0, 8)}`;
  return prisma.user.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress, username },
  });
}

async function createSession(userId: string, userAgent?: string, ipAddress?: string) {
  const refreshToken = randomBytes(48).toString('base64url');
  const session = await prisma.authSession.create({
    data: {
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent,
      ipAddress,
      expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000),
    },
  });

  const activeCount = await prisma.authSession.count({ where: { userId, revokedAt: null } });
  if (activeCount > MAX_SESSIONS_PER_USER) {
    const oldest = await prisma.authSession.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (oldest) {
      await prisma.authSession.update({
        where: { id: oldest.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  return { session, refreshToken };
}

export async function requestChallenge(walletAddress: string): Promise<ChallengeResult> {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!isValidWalletAddress(normalized)) {
    throw new AppError(400, 'INVALID_WALLET', 'Wallet address format is invalid');
  }

  const nonce = generateNonce();
  await redis.set(`auth:challenge:${normalized}`, nonce, 'EX', CHALLENGE_TTL_SECONDS);
  return { nonce, message: buildSignMessage(nonce) };
}

export async function walletLogin(
  input: WalletLoginInput,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<{ user: { id: string; walletAddress: string; username: string }; tokens: TokenPair }> {
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  if (!isValidWalletAddress(walletAddress)) {
    throw new AppError(400, 'INVALID_WALLET', 'Wallet address format is invalid');
  }

  const expectedNonce = await redis.get(`auth:challenge:${walletAddress}`);
  if (!expectedNonce || expectedNonce !== input.nonce) {
    throw new UnauthorizedError('INVALID_NONCE', 'Nonce is missing, expired, or already used');
  }

  const message = buildSignMessage(input.nonce);
  const valid = verifyEd25519Signature(input.publicKey, message, input.signature);
  if (!valid) {
    throw new UnauthorizedError('INVALID_SIGNATURE', 'Signature verification failed');
  }

  await redis.del(`auth:challenge:${walletAddress}`);

  const user = await userFromWallet(walletAddress);
  const { session, refreshToken } = await createSession(user.id, meta.userAgent, meta.ipAddress);

  const accessToken = signAccessToken(user.id, user.walletAddress, session.id);
  return {
    user: { id: user.id, walletAddress: user.walletAddress, username: user.username },
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    },
  };
}

export async function refreshSession(
  refreshToken: string,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<TokenPair> {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashRefreshToken(refreshToken);

  const session = await prisma.authSession.findUnique({ where: { refreshTokenHash: tokenHash } });
  if (!session || session.userId !== payload.sub) {
    throw new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Refresh token does not match any session');
  }

  if (session.revokedAt || session.expiresAt < new Date()) {
    if (session.revokedAt) {
      await revokeUserSessions(session.userId);
      logger.warn({ userId: session.userId }, 'refresh token reuse detected; sessions revoked');
    }
    throw new UnauthorizedError('REFRESH_TOKEN_REVOKED', 'Refresh token has been revoked');
  }

  await prisma.$transaction([
    prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
  ]);

  const { refreshToken: newRefreshToken } = await createSession(session.userId, meta.userAgent, meta.ipAddress);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const accessToken = signAccessToken(user.id, user.walletAddress, session.id);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 15 * 60,
  };
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.authSession.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
