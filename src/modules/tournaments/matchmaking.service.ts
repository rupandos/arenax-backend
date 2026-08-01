import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { emitToUser } from '../../sockets/emitter';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors';
import { logger } from '../../lib/logger';
import { addLeaderboardPoints } from '../leaderboard/leaderboard.service';

const QUEUE_KEY_PREFIX = 'matchmaking:queue';

function queueKey(tournamentId: string): string {
  return `${QUEUE_KEY_PREFIX}:${tournamentId}`;
}

export async function enqueueForMatchmaking(tournamentId: string, userId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    throw new NotFoundError('TOURNAMENT_NOT_FOUND', 'Tournament does not exist');
  }
  if (tournament.status !== 'STARTED') {
    throw new ConflictError('TOURNAMENT_NOT_STARTED', 'Matchmaking is only available while the tournament is live');
  }

  const registered = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (!registered || registered.eliminated) {
    throw new ForbiddenError('NOT_ELIGIBLE', 'You must be an active player to enter matchmaking');
  }

  await redis.lrem(queueKey(tournamentId), 0, userId);
  await redis.lpush(queueKey(tournamentId), userId);
  await emitToUser(userId, 'matchmaking:queued', { tournamentId });
}

export async function processMatchmaking(tournamentId: string): Promise<void> {
  const key = queueKey(tournamentId);

  for (;;) {
    const [playerA, playerB] = await redis.lrange(key, 0, 1);
    if (!playerA || !playerB) break;

    const isAStillActive = await prisma.tournamentPlayer.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: playerA } },
    });
    const isBStillActive = await prisma.tournamentPlayer.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: playerB } },
    });
    if (!isAStillActive || isAStillActive.eliminated) {
      await redis.lrem(key, 0, playerA);
      continue;
    }
    if (!isBStillActive || isBStillActive.eliminated) {
      await redis.lrem(key, 0, playerB);
      continue;
    }

    await redis.lrem(key, 0, playerA);
    await redis.lrem(key, 0, playerB);

    const match = await prisma.match.create({
      data: {
        tournamentId,
        playerAId: playerA,
        playerBId: playerB,
        status: 'PENDING',
        startedAt: new Date(),
      },
    });

    logger.info({ matchId: match.id, tournamentId, playerA, playerB }, 'match paired');
    emitToUser(playerA, 'match:found', { matchId: match.id, tournamentId, opponentId: playerB });
    emitToUser(playerB, 'match:found', { matchId: match.id, tournamentId, opponentId: playerA });
  }
}

export async function reportMatchResult(
  matchId: string,
  winnerId: string,
  reporterId: string,
): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { playerA: true, playerB: true },
  });
  if (!match) {
    throw new NotFoundError('MATCH_NOT_FOUND', 'Match does not exist');
  }
  if (match.status === 'FINISHED') {
    throw new ConflictError('MATCH_FINISHED', 'Match result has already been reported');
  }
  if (match.playerAId !== reporterId && match.playerBId !== reporterId) {
    throw new ForbiddenError('NOT_A_PARTICIPANT', 'Only match participants can report results');
  }
  if (winnerId !== match.playerAId && winnerId !== match.playerBId) {
    throw new ConflictError('INVALID_WINNER', 'Winner must be one of the match participants');
  }

  const updated = await prisma.match.update({
    where: { id: matchId },
    data: { status: 'FINISHED', winnerId, finishedAt: new Date() },
  });

  const loserId = winnerId === match.playerAId ? match.playerBId : match.playerAId;

  await prisma.$transaction([
    prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId: match.tournamentId!, userId: winnerId } },
      data: { score: { increment: 1 } },
    }),
    prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId: match.tournamentId!, userId: loserId } },
      data: { eliminated: true },
    }),
  ]);

  await addLeaderboardPoints(winnerId, 10);
  await addLeaderboardPoints(loserId, 2);

  emitToUser(winnerId, 'match:won', { matchId, tournamentId: match.tournamentId });
  emitToUser(loserId, 'match:lost', { matchId, tournamentId: match.tournamentId });

  return updated;
}
