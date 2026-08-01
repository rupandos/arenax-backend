import { prisma } from '../../lib/prisma';
import { NotFoundError, ConflictError, AppError } from '../../utils/errors';

export interface UpdateProfileInput {
  username?: string;
  avatarUrl?: string;
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError('USER_NOT_FOUND', 'User does not exist');
  }

  const [tournamentsPlayed, tournamentsWon, rewardsTotal, sessions] = await Promise.all([
    prisma.tournamentPlayer.count({ where: { userId } }),
    prisma.tournament.count({ where: { winnerId: userId } }),
    prisma.reward.aggregate({ where: { userId, status: 'SUCCEEDED' }, _sum: { amount: true } }),
    prisma.authSession.count({ where: { userId, revokedAt: null } }),
  ]);

  return {
    id: user.id,
    walletAddress: user.walletAddress,
    username: user.username,
    avatarUrl: user.avatarUrl,
    role: user.role,
    xp: user.xp,
    createdAt: user.createdAt,
    stats: {
      tournamentsPlayed,
      tournamentsWon,
      lifetimeRewards: rewardsTotal._sum.amount ?? 0,
      activeSessions: sessions,
    },
  };
}

export async function getPublicProfile(identifier: string) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: identifier }, { username: identifier }] },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      xp: true,
      createdAt: true,
    },
  });
  if (!user) {
    throw new NotFoundError('USER_NOT_FOUND', 'User does not exist');
  }
  return user;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  if (input.username !== undefined) {
    const normalized = input.username.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(normalized)) {
      throw new AppError(
        400,
        'INVALID_USERNAME',
        'Username must be 3-20 characters of letters, digits, or underscores',
      );
    }
    const taken = await prisma.user.findUnique({ where: { username: normalized } });
    if (taken && taken.id !== userId) {
      throw new ConflictError('USERNAME_TAKEN', 'That username is already taken');
    }
    input.username = normalized;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { username: input.username, avatarUrl: input.avatarUrl },
    select: { id: true, username: true, avatarUrl: true, xp: true, updatedAt: true },
  });

  return user;
}
