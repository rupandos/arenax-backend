import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config/env';
import { verifyAccessToken } from '../modules/auth/jwt';
import { logger } from '../lib/logger';
import { registerEmitter } from './emitter';

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);
    logger.info({ userId, socketId: socket.id }, 'socket connected');

    socket.on('disconnect', () => {
      logger.info({ userId, socketId: socket.id }, 'socket disconnected');
    });
  });

  registerEmitter((userId, event, payload) => {
    io?.to(`user:${userId}`).emit(event, payload);
  });

  logger.info('socket.io server initialized');
  return io;
}

export function getIo(): Server | null {
  return io;
}
