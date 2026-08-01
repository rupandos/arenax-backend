import Redis from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { config } from '../config/env';

export const QUEUE_NAMES = {
  rewards: 'rewards',
} as const;

export interface RewardJobData {
  rewardId: string;
  userId: string;
  type: 'TOURNAMENT_PRIZE' | 'NFT_REWARD' | 'SIGNUP_BONUS' | 'REFERRAL_BONUS';
  amount: number;
  currency: string;
}

function createQueueConnection(): Redis {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

export const rewardQueue = new Queue<RewardJobData>(QUEUE_NAMES.rewards, {
  connection: createQueueConnection(),
});

export const rewardQueueEvents = new QueueEvents(QUEUE_NAMES.rewards, {
  connection: createQueueConnection(),
});

export function createRewardWorker(
  processor: (job: RewardJobData) => Promise<void>,
): Worker<RewardJobData> {
  return new Worker<RewardJobData>(QUEUE_NAMES.rewards, async (job) => processor(job.data), {
    connection: createQueueConnection(),
    concurrency: config.rewards.queueConcurrency,
  });
}

export async function closeQueues(): Promise<void> {
  await rewardQueue.close();
  await rewardQueueEvents.close();
}
