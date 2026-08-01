import { Socket } from 'socket.io';
import { logger } from '../lib/logger';

/**
 * Lightweight event bus used by services to emit real-time events.
 * The Socket.IO server registers its transport here once initialized.
 */
type EmitterFn = (userId: string, event: string, payload: unknown) => void;

let emitFn: EmitterFn = (userId, event, payload) => {
  logger.debug({ userId, event, payload }, 'socket event dropped (no transport attached)');
};

export function registerEmitter(fn: EmitterFn): void {
  emitFn = fn;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  emitFn(userId, event, payload);
}

export function socketUserId(socket: Socket): string | null {
  return (socket.data.userId as string | undefined) ?? null;
}
