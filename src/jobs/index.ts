import { startTournamentScheduler, stopTournamentScheduler } from './tournament.scheduler';
import { logger } from '../lib/logger';

export function initSchedulers(): void {
  startTournamentScheduler();
  logger.info('background schedulers initialized');
}

export function stopSchedulers(): void {
  stopTournamentScheduler();
}
