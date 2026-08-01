import { startTournamentScheduler, stopTournamentScheduler } from './tournament.scheduler';
import { startLeaderboardReset, stopLeaderboardReset } from './leaderboard.reset';
import { logger } from '../lib/logger';

export function initSchedulers(): void {
  startTournamentScheduler();
  startLeaderboardReset();
  logger.info('background schedulers initialized');
}

export function stopSchedulers(): void {
  stopTournamentScheduler();
  stopLeaderboardReset();
}
