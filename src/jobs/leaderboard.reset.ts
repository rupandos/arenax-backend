import cron, { ScheduledTask } from 'node-cron';
import { acquireLock, releaseLock, redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { periodKeyForDate, persistPeriod } from '../modules/leaderboard/leaderboard.service';

const JOB_EXPRESSION = '0 0 * * *';
const LOCK_TTL_MS = 60_000;

function previousDayPeriodKey(): string {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return periodKeyForDate(yesterday, 'daily');
}

async function rollOverDailyLeaderboard(): Promise<void> {
  if (!(await acquireLock('leaderboard-reset', LOCK_TTL_MS))) {
    return;
  }
  try {
    const previousKey = previousDayPeriodKey();

    const entries = await redis.zcard(`leaderboard:${previousKey}`);
    if (entries === 0) {
      logger.debug({ previousKey }, 'no entries to persist, skipping leaderboard rollover');
      return;
    }

    const persisted = await persistPeriod(previousKey);
    logger.info({ previousKey, persisted }, 'daily leaderboard persisted and reset');
  } catch (err) {
    logger.error({ err }, 'daily leaderboard reset failed');
  } finally {
    await releaseLock('leaderboard-reset');
  }
}

let task: ScheduledTask | null = null;

export function startLeaderboardReset(): void {
  if (task) return;
  task = cron.schedule(JOB_EXPRESSION, () => {
    void rollOverDailyLeaderboard();
  }, { timezone: 'UTC' });
  logger.info({ expression: JOB_EXPRESSION }, 'leaderboard reset scheduler started');
}

export function stopLeaderboardReset(): void {
  task?.stop();
  task = null;
}
