import Redis from 'ioredis';
import { config } from '../config/env';
import { logger } from './logger';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'redis connection error');
});

redis.on('ready', () => {
  logger.info('redis connected');
});

export async function acquireLock(key: string, ttlMs: number): Promise<boolean> {
  const result = await redis.set(`lock:${key}`, '1', 'EX', Math.ceil(ttlMs / 1000), 'NX');
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(`lock:${key}`);
}

export async function checkRedisConnection(): Promise<void> {
  await redis.ping();
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
