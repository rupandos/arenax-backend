import { Worker } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { createRewardWorker, RewardJobData, closeQueues } from '../../lib/queue';
import { logger } from '../../lib/logger';
import { emitToUser } from '../../sockets/emitter';
import { config } from '../../config/env';
import { dispatchPendingRewards } from './reward.service';

/**
 * Simulates the asynchronous side effect of claiming a reward (off-chain
 * credit, NFT mint, etc.). Replace with the real provider integration.
 */
async function claimReward(rewardId: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.floor(Math.random() * 200)));
  logger.debug({ rewardId }, 'reward claimed by provider');
}

async function mintNftForReward(reward: {
  id: string;
  userId: string;
  amount: number;
}): Promise<void> {
  const tokenId = reward.id;
  await prisma.asset.create({
    data: {
      tokenId,
      ownerId: reward.userId,
      name: `ArenaX Trophy #${reward.amount}`,
      rarity: reward.amount >= 5 ? 'EPIC' : 'RARE',
      metadataUrl: `arenax://reward/${reward.id}`,
    },
  });
  await prisma.assetTransfer.create({
    data: {
      assetId: tokenId,
      toUserId: reward.userId,
      reason: 'NFT_REWARD_MINT',
    },
  });
  logger.info({ tokenId, userId: reward.userId }, 'NFT minted for reward');
}

let worker: Worker<RewardJobData> | null = null;

async function processReward(job: RewardJobData): Promise<void> {
  const { rewardId } = job;

  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward) {
    logger.warn({ rewardId }, 'reward not found, skipping');
    return;
  }
  if (reward.status !== 'PENDING') {
    logger.debug({ rewardId, status: reward.status }, 'reward already processed, skipping');
    return;
  }

  await prisma.reward.update({
    where: { id: rewardId },
    data: { status: 'PROCESSING', attemptCount: { increment: 1 } },
  });

  try {
    await claimReward(rewardId);
    if (reward.type === 'NFT_REWARD') {
      await mintNftForReward(reward);
    }

    await prisma.reward.update({
      where: { id: rewardId },
      data: { status: 'SUCCEEDED', processedAt: new Date(), lastError: null },
    });

    emitToUser(reward.userId, 'reward:claimed', {
      rewardId,
      amount: reward.amount,
      currency: reward.currency,
    });
    logger.info({ rewardId, userId: reward.userId }, 'reward processed');
  } catch (err) {
    await prisma.reward.update({
      where: { id: rewardId },
      data: { status: 'FAILED', lastError: err instanceof Error ? err.message : 'unknown error' },
    });
    logger.error({ rewardId, err }, 'reward processing failed');
    throw err;
  }
}

export async function startRewardWorker(): Promise<void> {
  if (worker) return;
  worker = createRewardWorker(processReward);

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'reward job failed');
  });
  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'reward job completed');
  });

  const recovered = await dispatchPendingRewards();
  logger.info({ recovered }, 'reward worker started');
}

export async function stopRewardWorker(): Promise<void> {
  await worker?.close();
  worker = null;
  await closeQueues();
}
