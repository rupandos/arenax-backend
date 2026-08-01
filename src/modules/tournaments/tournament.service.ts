import { TournamentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ConflictError, ForbiddenError, AppError } from '../../utils/errors';

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
