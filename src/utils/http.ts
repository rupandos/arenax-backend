import { ZodTypeAny, z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { toHttpError } from '../utils/errors';

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.query = result.data;
    next();
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.params = result.data;
    next();
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function paginationSchema(defaultPageSize = 20, maxPageSize = 100) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
  });
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data });
}

export function okPaged(res: Response, data: unknown[], total: number, page: number, pageSize: number): void {
  res.json({ data, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
}

export function errorResponse(res: Response, err: unknown): void {
  const httpError = toHttpError(err);
  res.status(httpError.statusCode).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.details !== undefined && { details: httpError.details }),
    },
  });
}
