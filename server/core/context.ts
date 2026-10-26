import { computeSplit, type Bill, type BillHost, type SplitResult } from '@harngun/shared';
import type { z } from 'zod';
import type { AuthProvider, BillChanges, BillRepository, ImageStorage, ReceiptParser } from '../ports';
import { AppError } from './errors';

/** Everything a handler may touch. Built by config.ts; tests pass fakes. */
export interface Deps {
  bills: BillRepository;
  images: ImageStorage;
  parser: ReceiptParser;
  auth: AuthProvider;
}

/** What every bill route returns: the stored bill plus the math, computed on read (02-ARCHITECTURE.md §6). */
export interface BillView {
  bill: Bill;
  split: SplitResult;
}

export const billView = (bill: Bill): BillView => ({ bill, split: computeSplit(bill) });

/** Validates untrusted input (request body) against a schema, or refuses with BAD_REQUEST. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError('BAD_REQUEST', `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`);
  }
  return result.data;
}

export async function loadOwnedBill(deps: Deps, host: BillHost, billId: string): Promise<Bill> {
  const bill = await deps.bills.get(billId);
  if (!bill) throw new AppError('NOT_FOUND', 'Bill not found');
  if (bill.host.id !== host.id) throw new AppError('FORBIDDEN', 'This bill belongs to another host');
  return bill;
}

const MAX_WRITE_ATTEMPTS = 5;

/**
 * The shape of every write: load the host's bill, let `decide` work out the changes (and refuse
 * if needed), apply them as one atomic write, then return the fresh bill view.
 * The write only lands if the bill is still at the loaded version; otherwise it reloads and
 * decides again, so a change is never based on a stale copy (optimistic locking).
 */
export async function writeBill(
  deps: Deps,
  host: BillHost,
  billId: string,
  decide: (bill: Bill) => BillChanges,
): Promise<BillView> {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    // A bill deleted in the meantime fails here with NOT_FOUND.
    const bill = await loadOwnedBill(deps, host, billId);
    if (await deps.bills.update(billId, decide(bill), bill.version)) return billView(await loadOwnedBill(deps, host, billId));
  }
  throw new AppError('CONFLICT', 'The bill changed while saving. Try again.');
}
