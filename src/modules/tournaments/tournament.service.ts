import { TournamentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ConflictError, ForbiddenError, AppError } from '../../utils/errors';
import { logger } from '../../lib/logger';
import { emitToUser } from '../../sockets/emitter';

export interface CreateTournamentInput {
  name: string;
  startTime: Date;
  endTime: Date;
  entryFee: number;
  prizePool: number;
  maxPlayers: number;
  rules?: Prisma.InputJsonValue;
}

export async function createTournament(input: CreateTournamentInput) {
  return prisma.tournament.create({ data: { ...input, status: TournamentStatus.OPEN } });
}

export async function updateTournament(
  tournamentId: string,
  input: Partial<CreateTournamentInput>,
  actorRole: string,
) {
  const existing = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!existing) {
    throw new NotFoundError('TOURNAMENT_NOT_FOUND', 'Tournament does not exist');
  }
  if (actorRole !== 'ADMIN' && existing.status !== 'DRAFT') {
    throw new ForbiddenError('TOURNAMENT_LOCKED', 'Only draft tournaments can be edited');
  }
  if (['STARTED', 'COMPLETED', 'CANCELLED'].includes(existing.status)) {
    throw new ConflictError('TOURNAMENT_LOCKED', 'Tournament can no longer be edited');
  }

  return prisma.tournament.update({ where: { id: tournamentId }, data: input });
}

export async function listTournaments(filters: { status?: string; page: number; pageSize: number }) {
  const where: Prisma.TournamentWhereInput = filters.status
    ? { status: filters.status as TournamentStatus }
    : {};

  const [items, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      orderBy: { startTime: 'asc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: { _count: { select: { players: true } } },
    }),
    prisma.tournament.count({ where }),
  ]);

  return { items, total };
}

export async function getTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: {
        orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
        include: { user: { select: { id: true, username: true, avatarUrl: true } } },
      },
      winner: { select: { id: true, username: true, avatarUrl: true } },
    },
  });
  if (!tournament) {
    throw new NotFoundError('TOURNAMENT_NOT_FOUND', 'Tournament does not exist');
  }
  return tournament;
}

export async function cancelTournament(tournamentId: string, actorRole: string) {
  if (actorRole !== 'ADMIN') {
    throw new ForbiddenError('ADMIN_ONLY', 'Only admins can cancel tournaments');
  }
  const updated = await prisma.tournament.updateMany({
    where: { id: tournamentId, status: { in: ['DRAFT', 'OPEN', 'STARTED'] } },
    data: { status: 'CANCELLED' },
  });
  if (updated.count === 0) {
    throw new ConflictError('CANNOT_CANCEL', 'Tournament cannot be cancelled in its current state');
  }
  return { success: true };
}

export async function joinTournament(tournamentId: string, userId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { _count: { select: { players: true } } },
  });
  if (!tournament) {
    throw new NotFoundError('TOURNAMENT_NOT_FOUND', 'Tournament does not exist');
  }
  if (tournament.status !== 'OPEN') {
    throw new ConflictError('TOURNAMENT_NOT_OPEN', 'Tournament is not accepting registrations');
  }
  if (tournament._count.players >= tournament.maxPlayers) {
    throw new ConflictError('TOURNAMENT_FULL', 'Tournament has reached its player limit');
  }

  const player = await prisma.tournamentPlayer.create({
    data: { tournamentId, userId },
  });

  return player;
}

export async function leaveTournament(tournamentId: string, userId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    throw new NotFoundError('TOURNAMENT_NOT_FOUND', 'Tournament does not exist');
  }
  if (tournament.status !== 'OPEN') {
    throw new ConflictError('TOURNAMENT_STARTED', 'Cannot leave after the tournament has started');
  }

  const removed = await prisma.tournamentPlayer.deleteMany({
    where: { tournamentId, userId },
  });
  if (removed.count === 0) {
    throw new NotFoundError('NOT_REGISTERED', 'You are not registered for this tournament');
  }
  return { success: true };
}

export async function startTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    throw new NotFoundError('TOURNAMENT_NOT_FOUND', 'Tournament does not exist');
  }
  if (tournament.status !== 'OPEN') {
    throw new ConflictError('INVALID_STATE', `Tournament is ${tournament.status}, expected OPEN`);
  }

  const now = new Date();
  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'STARTED', startedAt: now },
  });

  const players = await prisma.tournamentPlayer.findMany({ where: { tournamentId } });
  await prisma.notification.createMany({
    data: players.map((player) => ({
      userId: player.userId,
      type: 'TOURNAMENT_STARTED' as const,
      title: 'Tournament started',
      body: `"${tournament.name}" is now live. Good luck!`,
      data: { tournamentId },
    })),
  });
  for (const player of players) {
    emitToUser(player.userId, 'tournament:started', {
      tournamentId,
      name: tournament.name,
      startTime: now,
    });
  }

  logger.info({ tournamentId }, 'tournament started');
  return updated;
}

const PRIZE_SHARE = [0.5, 0.3, 0.15, 0.05];

export async function completeTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { orderBy: { score: 'desc' } } },
  });
  if (!tournament) {
    throw new NotFoundError('TOURNAMENT_NOT_FOUND', 'Tournament does not exist');
  }
  if (tournament.status !== 'STARTED') {
    throw new ConflictError('INVALID_STATE', `Tournament is ${tournament.status}, expected STARTED`);
  }

  const rankedPlayers = tournament.players.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));

  const winners = rankedPlayers.filter((player, index) => index < PRIZE_SHARE.length && player.score > 0);

  const completed = await prisma.$transaction(async (tx) => {
    const unresolvedMatches = await tx.match.findMany({
      where: { tournamentId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });
    if (unresolvedMatches.length > 0) {
      await tx.match.updateMany({
        where: { tournamentId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        data: { status: 'FINISHED', finishedAt: new Date() },
      });
      logger.warn(
        { tournamentId, count: unresolvedMatches.length },
        'force-finished unresolved matches during completion',
      );
    }

    for (const player of rankedPlayers) {
      await tx.tournamentPlayer.update({
        where: { id: player.id },
        data: { rank: player.rank },
      });
    }

    const champion = winners[0];
    const updated = await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        ...(champion ? { winnerId: champion.userId } : {}),
      },
    });

    for (const winner of winners) {
      await tx.reward.create({
        data: {
          userId: winner.userId,
          tournamentId,
          type: 'TOURNAMENT_PRIZE',
          amount: Math.round((tournament.prizePool * PRIZE_SHARE[winner.rank! - 1]) / 100),
          currency: 'GEM',
        },
      });
    }

    return updated;
  });

  await prisma.notification.createMany({
    data: rankedPlayers.map((player) => ({
      userId: player.userId,
      type: 'TOURNAMENT_ENDED' as const,
      title: 'Tournament finished',
      body: `"${tournament.name}" has concluded. You finished #${player.rank}.`,
      data: { tournamentId, rank: player.rank, winnerId: completed.winnerId },
    })),
  });
  for (const player of rankedPlayers) {
    emitToUser(player.userId, 'tournament:ended', {
      tournamentId,
      rank: player.rank,
      winnerId: completed.winnerId,
    });
  }

  logger.info({ tournamentId, winners: winners.length }, 'tournament completed');
  return completed;
}

