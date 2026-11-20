import type { BillHost } from '@harngun/shared';
import * as core from './core';
import { AppError, type Deps, type ErrorCode } from './core';

/**
 * Every API route, once. Express (express/app.ts) and Lambda (lambda/handler.ts) both serve this
 * table, so the two entry layers cannot drift apart. Paths use API Gateway's `{param}` style.
 */
export interface RouteInput {
  params: Record<string, string>;
  body: unknown;
  authorization: string | undefined;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  status: number;
  run(deps: Deps, input: RouteInput): Promise<unknown>;
}

const open = (method: Route['method'], path: string, status: number, run: Route['run']): Route => ({ method, path, status, run });

/** A route that needs a session: the token is checked before `run` sees anything. */
const signedIn = (
  method: Route['method'],
  path: string,
  status: number,
  run: (deps: Deps, host: BillHost, input: RouteInput) => Promise<unknown>,
): Route => ({ method, path, status, run: async (deps, input) => run(deps, await core.authenticate(deps, input.authorization), input) });

export const routes: Route[] = [
  open('GET', '/api/health', 200, async () => ({ ok: true })),
  open('POST', '/api/session', 201, (deps, { body }) => core.createSession(deps, body)),

  signedIn('POST', '/api/bills', 201, (deps, host, { body }) => core.createBill(deps, host, body)),
  signedIn('POST', '/api/receipts/upload-url', 201, (deps, host, { body }) => core.createUploadUrl(deps, host, body)),
  signedIn('POST', '/api/receipts/{id}/parse', 200, (deps, host, { params }) => core.parseReceipt(deps, host, params.id!)),

  signedIn('GET', '/api/bills/{id}', 200, (deps, host, { params }) => core.getBill(deps, host, params.id!)),
  signedIn('PATCH', '/api/bills/{id}', 200, (deps, host, { params, body }) => core.updateBill(deps, host, params.id!, body)),

  signedIn('POST', '/api/bills/{id}/items', 201, (deps, host, { params, body }) => core.addItem(deps, host, params.id!, body)),
  signedIn('PATCH', '/api/bills/{id}/items/{itemId}', 200, (deps, host, { params, body }) =>
    core.updateItem(deps, host, params.id!, params.itemId!, body),
  ),
  signedIn('DELETE', '/api/bills/{id}/items/{itemId}', 200, (deps, host, { params }) => core.deleteItem(deps, host, params.id!, params.itemId!)),
  signedIn('POST', '/api/bills/{id}/items/{itemId}/unpack', 200, (deps, host, { params }) => core.unpack(deps, host, params.id!, params.itemId!)),

  signedIn('POST', '/api/bills/{id}/participants', 201, (deps, host, { params, body }) => core.addParticipant(deps, host, params.id!, body)),
  signedIn('PATCH', '/api/bills/{id}/participants/{pid}', 200, (deps, host, { params, body }) =>
    core.updateParticipant(deps, host, params.id!, params.pid!, body),
  ),
  signedIn('DELETE', '/api/bills/{id}/participants/{pid}', 200, (deps, host, { params }) =>
    core.deleteParticipant(deps, host, params.id!, params.pid!),
  ),

  signedIn('PUT', '/api/bills/{id}/claims/{itemId}/{pid}', 200, (deps, host, { params }) =>
    core.claim(deps, host, params.id!, { itemId: params.itemId!, participantId: params.pid! }),
  ),
  signedIn('DELETE', '/api/bills/{id}/claims/{itemId}/{pid}', 200, (deps, host, { params }) =>
    core.unclaim(deps, host, params.id!, { itemId: params.itemId!, participantId: params.pid! }),
  ),
];

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PARSER_FAILED: 502,
};

/** Turns any thrown error into the one error shape the client knows. Unknown errors become a bare 500. */
export function errorResponse(error: unknown): { status: number; body: unknown } {
  if (error instanceof AppError) {
    // The cause can hold AWS details: log it, never send it.
    if (error.cause) console.error(`[${error.code}]`, error.cause);
    return { status: STATUS[error.code], body: { error: { code: error.code, message: error.message } } };
  }
  console.error(error);
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong' } } };
}
