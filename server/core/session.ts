import { randomUUID } from 'node:crypto';
import { normalizePromptPayId, type BillHost } from '@harngun/shared';
import { parseInput, type Deps } from './context';
import { AppError } from './errors';
import { sessionInput } from './schemas';

/** Host enters name + PromptPay ID (no accounts in Phase 1) and gets a session token. */
export async function createSession(deps: Deps, body: unknown) {
  const input = parseInput(sessionInput, body);
  const promptPayId = input.promptPayId.replace(/[\s-]/g, '');
  try {
    normalizePromptPayId(promptPayId, input.promptPayType);
  } catch (error) {
    throw new AppError('BAD_REQUEST', (error as Error).message);
  }

  const host: BillHost = { id: randomUUID(), name: input.name, promptPayId, promptPayType: input.promptPayType };
  return { token: await deps.auth.issue(host), host };
}

/** Turns an `Authorization: Bearer <token>` header into the host, or refuses. */
export async function authenticate(deps: Deps, authorization: string | undefined): Promise<BillHost> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  const host = token ? await deps.auth.verify(token) : null;
  if (!host) throw new AppError('UNAUTHORIZED', 'Sign in again: missing or expired session');
  return host;
}
