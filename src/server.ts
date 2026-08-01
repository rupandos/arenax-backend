import { createServer } from 'http';
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './lib/logger';
import { checkDatabaseConnection } from './lib/prisma';
import { checkRedisConnection, closeRedis } from './lib/redis';
import { initSchedulers, stopSchedulers } from './jobs';
import { initSocketServer } from './sockets';
import { startRewardWorker, stopRewardWorker } from './modules/rewards/reward.worker';

async function bootstrap(): Promise<void> {
  await checkDatabaseConnection();
  await checkRedisConnection();

  const app = createApp();
  const httpServer = createServer(app);

  initSocketServer(httpServer);
  await startRewardWorker();

  initSchedulers();

  httpServer.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'arenax backend listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopSchedulers();
    await stopRewardWorker();
    httpServer.close(async () => {
      await closeRedis();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'failed to bootstrap server');
  process.exit(1);
});
