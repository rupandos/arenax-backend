import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { rewardQueue } from '../../lib/queue';
import { NotFoundError, ConflictError, ForbiddenError, AppError } from '../../utils/errors';
import { logger } from '../../lib/logger';
import { bullmqBackoffOptions, REWARD_MAX_ATTEMPTS } from '../../utils/backoff';

export interface EnqueueRewardInput {
  userId: string;
  tournamentId?: string;
  type: 'TOURNAMENT_PRIZE' | 'NFT_REWARD' | 'SIGNUP_BONUS' | 'REFERRAL_BONUS';
  amount: number;
  currency?: string;
}

export async function enqueueReward(input: EnqueueRewardInput) {
  const reward = await prisma.reward.create({
    data: {
      userId: input.userId,
      tournamentId: input.tournamentId,
      type: input.type,
      amount: input.amount,
      currency: input.currency ?? 'GEM',
      status: 'PENDING',
    },
  });

  const job = await rewardQueue.add(
    'process-reward',
    {
      rewardId: reward.id,
      userId: reward.userId,
      type: reward.type,
      amount: reward.amount,
      currency: reward.currency,
    },
    {
      jobId: reward.id,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: REWARD_MAX_ATTEMPTS,
      backoff: bullmqBackoffOptions(),
    },
  );

  logger.info({ rewardId: reward.id, jobId: job.id }, 'reward enqueued');
  return reward;
}

export async function getReward(rewardId: string, userId?: string) {
  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward) {
    throw new NotFoundError('REWARD_NOT_FOUND', 'Reward does not exist');
  }
  if (userId && reward.userId !== userId) {
    throw new ForbiddenError('NOT_OWNER', 'You do not own this reward');
  }
  return reward;
}

export async function listRewards(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.reward.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.reward.count({ where: { userId } }),
  ]);
  return { items, total };
}

export async function retryReward(rewardId: string, userId?: string) {
  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward) {
    throw new NotFoundError('REWARD_NOT_FOUND', 'Reward does not exist');
  }
  if (userId && reward.userId !== userId) {
    throw new ForbiddenError('NOT_OWNER', 'You do not own this reward');
  }
  if (reward.status !== 'FAILED') {
    throw new ConflictError('REWARD_NOT_FAILED', 'Only failed rewards can be retried');
  }

  const updated = await prisma.reward.update({
    where: { id: rewardId },
    data: { status: 'PENDING', lastError: null },
  });

  await rewardQueue.add(
    'process-reward',
    {
      rewardId: reward.id,
      userId: reward.userId,
      type: reward.type,
      amount: reward.amount,
      currency: reward.currency,
    },
    {
      jobId: `retry-${reward.id}-${Date.now()}`,
      attempts: REWARD_MAX_ATTEMPTS,
      backoff: bullmqBackoffOptions(),
    },
  );

  logger.info({ rewardId }, 'reward requeued for retry');
  return updated;
}

/**
 * Crash recovery: re-queue any reward that was left in a non-terminal state
 * without an active BullMQ job (e.g. after a worker crash mid-processing).
 */
export interface NftStatus {
  rewardId: string;
  status: 'pending' | 'minted';
  asset?: {
    tokenId: string;
    name: string;
    rarity: string;
    mintedAt: Date;
  };
}

export async function getNftStatus(rewardId: string, userId?: string): Promise<NftStatus> {
  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward) {
    throw new NotFoundError('REWARD_NOT_FOUND', 'Reward does not exist');
  }
  if (reward.type !== 'NFT_REWARD') {
    throw new AppError(400, 'NOT_NFT_REWARD', 'Only NFT rewards have a mint status');
  }
  if (userId && reward.userId !== userId) {
    throw new ForbiddenError('NOT_OWNER', 'You do not own this reward');
  }

  const asset = await prisma.asset.findUnique({
    where: { tokenId: reward.id },
    select: { tokenId: true, name: true, rarity: true, mintedAt: true },
  });

  if (!asset) {
    return { rewardId, status: 'pending' };
  }
  return { rewardId, status: 'minted', asset };
}

export async function retryAllFailedRewards(actorRole: string, limit = 100): Promise<number> {
  if (actorRole !== 'ADMIN') {
    throw new ForbiddenError('ADMIN_ONLY', 'Only admins can trigger bulk retries');
  }

  const failed = await prisma.reward.findMany({
    where: { status: 'FAILED' },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  await prisma.reward.updateMany({
    where: { id: { in: failed.map((reward) => reward.id) } },
    data: { status: 'PENDING', lastError: null },
  });

  const stamp = Date.now();
  for (let index = 0; index < failed.length; index += 1) {
    const reward = failed[index];
    await rewardQueue.add(
      'process-reward',
      {
        rewardId: reward.id,
        userId: reward.userId,
        type: reward.type,
        amount: reward.amount,
        currency: reward.currency,
      },
      {
        jobId: `retry-${reward.id}-${stamp}-${index}`,
        attempts: REWARD_MAX_ATTEMPTS,
        backoff: bullmqBackoffOptions(),
      },
    );
  }

  const requeued = failed.length;
  if (requeued > 0) {
    logger.info({ requeued }, 'bulk retry triggered for failed rewards');
  }
  return requeued;
}

export async function dispatchPendingRewards(): Promise<number> {
  const pending = await prisma.reward.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
    take: 500,
  });

  let dispatched = 0;
  for (const reward of pending) {
    const existing = await rewardQueue.getJob(reward.id);
    if (existing) continue;
    await rewardQueue.add(
      'process-reward',
      {
        rewardId: reward.id,
        userId: reward.userId,
        type: reward.type,
        amount: reward.amount,
        currency: reward.currency,
      },
      { jobId: reward.id, attempts: REWARD_MAX_ATTEMPTS, backoff: bullmqBackoffOptions() },
    );
    dispatched += 1;
  }

  if (dispatched > 0) {
    logger.info({ dispatched }, 'recovered pending rewards');
  }
  return dispatched;
}
