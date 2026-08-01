import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../lib/prisma';
import { acquireLock, releaseLock } from '../lib/redis';
import { logger } from '../lib/logger';
import { completeTournament, startTournament } from '../modules/tournaments/tournament.service';

const JOB_EXPRESSION = '*/30 * * * * *';
const LOCK_TTL_MS = 20_000;

async function processDueTournaments(): Promise<void> {
  if (!(await acquireLock('tournament-scheduler', LOCK_TTL_MS))) {
    return;
  }
  try {
    const now = new Date();

    const dueToStart = await prisma.tournament.findMany({
      where: { status: 'OPEN', startTime: { lte: now } },
      take: 50,
    });
    for (const tournament of dueToStart) {
      await startTournament(tournament.id);
    }

    const dueToComplete = await prisma.tournament.findMany({
      where: { status: 'STARTED', endTime: { lte: now } },
      take: 50,
    });
    for (const tournament of dueToComplete) {
      await completeTournament(tournament.id);
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
