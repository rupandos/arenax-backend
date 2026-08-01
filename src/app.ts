import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config/env';
import { logger } from './lib/logger';
import { toHttpError } from './utils/errors';
import { healthRouter } from './modules/health/health.routes';
import { authRouter } from './modules/auth/auth.routes';
import { userRouter } from './modules/users/user.routes';
import { tournamentRouter } from './modules/tournaments/tournament.routes';
import { matchRouter } from './modules/tournaments/matchmaking.routes';
import { attachRequestId } from './middlewares/requestId';

export function createApp(): Express {
  const app = express();

  app.use(attachRequestId);
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: !config.isTest,
      customProps: (req) => ({ requestId: req.id }),
    }),
  );

  app.get('/', (_req, res) => {
    res.json({ name: 'ArenaX Backend', version: '0.1.0' });
  });

  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/tournaments', tournamentRouter);
  app.use('/api/matches', matchRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const httpError = toHttpError(err);
    if (httpError.statusCode >= 500) {
      logger.error({ err, requestId: req.id, path: req.path }, 'request failed');
    }
    res.status(httpError.statusCode).json({
      error: {
        code: httpError.code,
        message: httpError.message,
        ...(httpError.details !== undefined && { details: httpError.details }),
      },
    });
  });

  return app;
}
