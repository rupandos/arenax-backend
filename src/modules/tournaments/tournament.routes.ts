import { Router } from 'express';
import { asyncHandler, ok, okPaged, validateBody, validateQuery, validateParams } from '../../utils/http';
import { requireAuth, requireRole } from '../../middlewares/auth';
import {
  createTournamentSchema,
  updateTournamentSchema,
  listTournamentsQuerySchema,
  tournamentIdParamsSchema,
} from './tournament.validators';
import * as tournamentService from './tournament.service';

export const tournamentRouter = Router();

tournamentRouter.get(
  '/',
  validateQuery(listTournamentsQuerySchema),
  asyncHandler(async (req, res) => {
    const { status, page, pageSize } = req.query as {
      status?: string;
      page: number;
      pageSize: number;
    };
    const result = await tournamentService.listTournaments({ status, page, pageSize });
    okPaged(res, result.items, result.total, page, pageSize);
  }),
);

tournamentRouter.get(
  '/:id',
  validateParams(tournamentIdParamsSchema),
  asyncHandler(async (req, res) => {
    const tournament = await tournamentService.getTournament(req.params.id);
    ok(res, tournament);
  }),
);

tournamentRouter.post(
  '/',
  requireAuth,
  requireRole(['ADMIN']),
  validateBody(createTournamentSchema),
  asyncHandler(async (req, res) => {
    const tournament = await tournamentService.createTournament({
      name: req.body.name,
      startTime: new Date(req.body.startTime),
      endTime: new Date(req.body.endTime),
      entryFee: req.body.entryFee,
      prizePool: req.body.prizePool,
      maxPlayers: req.body.maxPlayers,
      rules: req.body.rules,
    });
    ok(res, tournament, 201);
  }),
);

tournamentRouter.patch(
  '/:id',
  requireAuth,
  validateParams(tournamentIdParamsSchema),
  validateBody(updateTournamentSchema),
  asyncHandler(async (req, res) => {
    const input: Record<string, unknown> = { ...req.body };
    if (typeof input.startTime === 'string') input.startTime = new Date(input.startTime);
    if (typeof input.endTime === 'string') input.endTime = new Date(input.endTime);
    const tournament = await tournamentService.updateTournament(req.params.id, input, req.userRole);
    ok(res, tournament);
  }),
);

tournamentRouter.post(
  '/:id/cancel',
  requireAuth,
  validateParams(tournamentIdParamsSchema),
  asyncHandler(async (req, res) => {
    const result = await tournamentService.cancelTournament(req.params.id, req.userRole);
    ok(res, result);
  }),
);

tournamentRouter.post(
  '/:id/join',
  requireAuth,
  validateParams(tournamentIdParamsSchema),
  asyncHandler(async (req, res) => {
    const player = await tournamentService.joinTournament(req.params.id, req.userId);
    ok(res, player, 201);
  }),
);

tournamentRouter.post(
  '/:id/leave',
  requireAuth,
  validateParams(tournamentIdParamsSchema),
  asyncHandler(async (req, res) => {
    const result = await tournamentService.leaveTournament(req.params.id, req.userId);
    ok(res, result);
  }),
);
