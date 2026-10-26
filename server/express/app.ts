import type { BillHost } from '@harngun/shared';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import * as core from '../core';
import { AppError, type Deps, type ErrorCode } from '../core';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PARSER_FAILED: 502,
};

/** Thin HTTP wrapper: read the request, call one core handler, send its result as JSON. */
export function createApp(deps: Deps) {
  const app = express();
  app.use(express.json());

  const host = (res: Response) => res.locals.host as BillHost;
  const param = (req: Request, name: string) => req.params[name] as string;
  // Express 5 forwards rejected promises to the error handler below.
  const send =
    (status: number, handle: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
      res.status(status).json(await handle(req, res));
    };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.post('/api/session', send(201, (req) => core.createSession(deps, req.body)));

  // Everything below needs a session.
  app.use('/api', async (req, res, next) => {
    res.locals.host = await core.authenticate(deps, req.get('authorization'));
    next();
  });

  app.post('/api/bills', send(201, (req, res) => core.createBill(deps, host(res), req.body)));
  app.post('/api/receipts/upload-url', send(201, (req, res) => core.createUploadUrl(deps, host(res), req.body)));
  app.post('/api/receipts/:id/parse', send(200, (req, res) => core.parseReceipt(deps, host(res), param(req, 'id'))));

  app.get('/api/bills/:id', send(200, (req, res) => core.getBill(deps, host(res), param(req, 'id'))));
  app.patch('/api/bills/:id', send(200, (req, res) => core.updateBill(deps, host(res), param(req, 'id'), req.body)));

  app.post('/api/bills/:id/items', send(201, (req, res) => core.addItem(deps, host(res), param(req, 'id'), req.body)));
  app.patch(
    '/api/bills/:id/items/:itemId',
    send(200, (req, res) => core.updateItem(deps, host(res), param(req, 'id'), param(req, 'itemId'), req.body)),
  );
  app.delete('/api/bills/:id/items/:itemId', send(200, (req, res) => core.deleteItem(deps, host(res), param(req, 'id'), param(req, 'itemId'))));
  app.post('/api/bills/:id/items/:itemId/unpack', send(200, (req, res) => core.unpack(deps, host(res), param(req, 'id'), param(req, 'itemId'))));

  app.post('/api/bills/:id/participants', send(201, (req, res) => core.addParticipant(deps, host(res), param(req, 'id'), req.body)));
  app.patch(
    '/api/bills/:id/participants/:pid',
    send(200, (req, res) => core.updateParticipant(deps, host(res), param(req, 'id'), param(req, 'pid'), req.body)),
  );
  app.delete(
    '/api/bills/:id/participants/:pid',
    send(200, (req, res) => core.deleteParticipant(deps, host(res), param(req, 'id'), param(req, 'pid'))),
  );

  const claimTarget = (req: Request) => ({ itemId: param(req, 'itemId'), participantId: param(req, 'pid') });
  app.put('/api/bills/:id/claims/:itemId/:pid', send(200, (req, res) => core.claim(deps, host(res), param(req, 'id'), claimTarget(req))));
  app.delete('/api/bills/:id/claims/:itemId/:pid', send(200, (req, res) => core.unclaim(deps, host(res), param(req, 'id'), claimTarget(req))));

  app.use('/api', () => {
    throw new AppError('NOT_FOUND', 'No such API route');
  });
  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    // The cause can hold AWS details: log it, never send it.
    if (error.cause) console.error(`[${error.code}]`, error.cause);
    res.status(STATUS[error.code]).json({ error: { code: error.code, message: error.message } });
  } else if ((error as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
  } else {
    console.error(error);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  }
};
