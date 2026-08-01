import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../lib/prisma';
import { acquireLock, releaseLock } from '../lib/redis';
import { logger } from '../lib/logger';

const JOB_EXPRESSION = '*/30 * * * * *';
const LOCK_TTL_MS = 20_000;

async function processDueTournaments(): Promise<void> {
  if (!(await acquireLock('tournament-scheduler', LOCK_TTL_MS))) {
    return;
  }
  try {
    const now = new Date();
    const started = await prisma.tournament.updateMany({
      where: { status: 'OPEN', startTime: { lte: now } },
      data: { status: 'STARTED', startedAt: now },
    });
    if (started.count > 0) {
      logger.info({ count: started.count }, 'tournaments started by scheduler');
    }
  } catch (err) {
    logger.error({ err }, 'tournament scheduler run failed');
  } finally {
    await releaseLock('tournament-scheduler');
  }
}

let task: ScheduledTask | null = null;

export function startTournamentScheduler(): void {
  if (task) return;
  task = cron.schedule(JOB_EXPRESSION, () => {
    void processDueTournaments();
  });
  logger.info({ expression: JOB_EXPRESSION }, 'tournament scheduler started');
}

export function stopTournamentScheduler(): void {
  task?.stop();
  task = null;
}
