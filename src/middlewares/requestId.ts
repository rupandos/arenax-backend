import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function attachRequestId(req: Request, _res: Response, next: NextFunction): void {
  const existing = req.header('x-request-id');
  req.id = existing ?? randomUUID();
  next();
}
