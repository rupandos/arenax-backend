import { z } from 'zod';

export const createTournamentSchema = z
  .object({
    name: z.string().min(3).max(64),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    entryFee: z.number().int().min(0).max(1_000_000).default(0),
    prizePool: z.number().int().min(0).max(1_000_000_000).default(0),
    maxPlayers: z.number().int().min(2).max(1024).default(32),
    rules: z.record(z.unknown()).optional(),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });

export const updateTournamentSchema = z
  .object({
    name: z.string().min(3).max(64).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    prizePool: z.number().int().min(0).max(1_000_000_000).optional(),
    maxPlayers: z.number().int().min(2).max(1024).optional(),
    rules: z.record(z.unknown()).optional(),
    status: z.enum(['DRAFT', 'CANCELLED']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listTournamentsQuerySchema = z.object({
  status: z.enum(['DRAFT', 'OPEN', 'STARTED', 'COMPLETED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const tournamentIdParamsSchema = z.object({
  id: z.string().min(1),
});
