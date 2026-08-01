import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(code = 'RESOURCE_NOT_FOUND', message = 'Resource not found') {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = 'UNAUTHORIZED', message = 'Authentication required') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN', message = 'You do not have permission to perform this action') {
    super(403, code, message);
  }
}

export function isPrismaUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

export function toHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof z.ZodError) {
    return new AppError(400, 'VALIDATION_ERROR', 'Invalid request payload', err.flatten().fieldErrors);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return new AppError(409, 'CONFLICT', 'A record with this unique field already exists');
      case 'P2025':
        return new NotFoundError();
      default:
        return new AppError(500, 'DATABASE_ERROR', 'Database operation failed');
    }
  }

  logger.error({ err }, 'unhandled error');
  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
