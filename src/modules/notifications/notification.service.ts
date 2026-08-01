import { NotificationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { emitToUser } from '../../sockets/emitter';
import { logger } from '../../lib/logger';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    },
  });

  emitToUser(input.userId, 'notification:new', {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    createdAt: notification.createdAt,
  });

  return notification;
}

export async function listNotifications(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);
  return { items, total };
}

export async function markAsRead(userId: string, notificationId?: string) {
  if (notificationId) {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    return { updated: 1 };
  }
  const updated = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: updated.count };
}

export async function unreadCount(userId: string) {
  const count = await prisma.notification.count({ where: { userId, readAt: null } });
  return { count };
}

export async function notifyTournamentStart(userId: string, tournamentId: string, tournamentName: string) {
  await createNotification({
    userId,
    type: 'TOURNAMENT_STARTED',
    title: 'Tournament started',
    body: `"${tournamentName}" is now live. Good luck!`,
    data: { tournamentId },
  });
}

export async function notifyTournamentEnd(
  userId: string,
  tournamentId: string,
  tournamentName: string,
  rank: number,
  winnerId: string | null,
) {
  await createNotification({
    userId,
    type: 'TOURNAMENT_ENDED',
    title: 'Tournament finished',
    body: `"${tournamentName}" has concluded. You finished #${rank}.`,
    data: { tournamentId, rank, winnerId },
  });
}

export async function notifyRewardResult(
  userId: string,
  rewardId: string,
  succeeded: boolean,
  amount: number,
  currency: string,
) {
  if (succeeded) {
    await createNotification({
      userId,
      type: 'REWARD_CLAIMED',
      title: 'Reward claimed',
      body: `You received ${amount} ${currency}.`,
      data: { rewardId, amount, currency },
    });
  } else {
    await createNotification({
      userId,
      type: 'REWARD_FAILED',
      title: 'Reward failed',
      body: `Your reward of ${amount} ${currency} could not be processed and is being retried.`,
      data: { rewardId, amount, currency },
    });
    logger.warn({ rewardId, userId }, 'reward failure notification sent');
  }
}
