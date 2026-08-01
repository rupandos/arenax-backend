import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../modules/auth/jwt';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
      walletAddress: string;
      sessionId: string;
      userRole: string;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    next(new UnauthorizedError());
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.walletAddress = payload.wallet;
    req.sessionId = payload.sessionId;
    next();
  } catch (err) {
    next(err);
  }
}
export function requireRole(roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!roles.includes(req.userRole)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
