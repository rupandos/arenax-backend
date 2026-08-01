import { redis } from '../../lib/redis';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

export type LeaderboardPeriod = 'daily' | 'weekly';

export function periodKeyForDate(date: Date, period: LeaderboardPeriod): string {
  if (period === 'weekly') {
    const yearWeek = `${date.getUTCFullYear()}-W${String(Math.ceil((date.getUTCDate() + 6 - date.getUTCDay()) / 7)).padStart(2, '0')}`;
    return `weekly:${yearWeek}`;
  }
  const dateKey = date.toISOString().slice(0, 10);
  return `daily:${dateKey}`;
}

export function currentPeriodKey(period: LeaderboardPeriod): string {
  return periodKeyForDate(new Date(), period);
}

function leaderboardKey(periodKey: string): string {
  return `leaderboard:${periodKey}`;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  points: number;
  rank: number;
}

export async function addPoints(userId: string, points: number, period: LeaderboardPeriod = 'daily'): Promise<void> {
  const key = leaderboardKey(currentPeriodKey(period));
  await redis.zincrby(key, points, userId);
}

export async function getTop(n: number, period: LeaderboardPeriod = 'daily'): Promise<LeaderboardEntry[]> {
  const key = leaderboardKey(currentPeriodKey(period));
  const entries = await redis.zrevrange(key, 0, n - 1, 'WITHSCORES');
  const players = new Set(entries.filter((_, index) => index % 2 === 0));

  const users = await prisma.user.findMany({
    where: { id: { in: [...players] } },
    select: { id: true, username: true },
  });
  const userMap = new Map(users.map((user) => [user.id, user.username]));

  const result: LeaderboardEntry[] = [];
  for (let index = 0; index < entries.length; index += 2) {
    const userId = entries[index];
    const points = Number(entries[index + 1]);
    result.push({
      userId,
      username: userMap.get(userId) ?? 'unknown',
      points,
      rank: index / 2 + 1,
    });
  }
  return result;
}

export async function getUserRank(userId: string, period: LeaderboardPeriod = 'daily') {
  const key = leaderboardKey(currentPeriodKey(period));
  const [rank, score] = await Promise.all([redis.zrevrank(key, userId), redis.zscore(key, userId)]);
  if (rank === null) {
    return { rank: null, points: 0 };
  }
  return { rank: rank + 1, points: score ?? 0 };
}

export async function persistPeriod(periodKey: string): Promise<number> {
  const key = leaderboardKey(periodKey);
  const entries = await redis.zrevrange(key, 0, 99, 'WITHSCORES');

  let persisted = 0;
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < entries.length; index += 2) {
      await tx.leaderboardEntry.upsert({
        where: { periodKey_userId: { periodKey, userId: entries[index] } },
        update: { points: Number(entries[index + 1]), rank: index / 2 + 1 },
        create: {
          periodKey,
          userId: entries[index],
          points: Number(entries[index + 1]),
          rank: index / 2 + 1,
        },
      });
      persisted += 1;
    }
  });

  logger.info({ periodKey, persisted }, 'leaderboard period persisted');
  return persisted;
}
