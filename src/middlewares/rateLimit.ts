import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';
import { AppError } from '../utils/errors';

const WINDOW_SECONDS = 60;

export interface RateLimitOptions {
  windowSeconds?: number;
  maxRequests: number;
  keyPrefix: string;
}

function clientKey(req: Request): string {
  return req.ip ?? 'unknown';
}

export function rateLimit(options: RateLimitOptions) {
  const windowSeconds = options.windowSeconds ?? WINDOW_SECONDS;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = `rl:${options.keyPrefix}:${clientKey(req)}`;
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }
      if (current > options.maxRequests) {
        next(
          new AppError(
            429,
            'RATE_LIMITED',
            `Too many requests. Limit is ${options.maxRequests} per ${windowSeconds}s window`,
          ),
        );
        return;
      }
      next();
    } catch {
      next();
    }
  };
}
