import type { BillHost, Claim } from '@harngun/shared';
import { writeBill, type Deps } from './context';
import { AppError } from './errors';

export async function claim(deps: Deps, host: BillHost, billId: string, target: Claim) {
  return writeBill(deps, host, billId, (bill) => {
    if (!bill.items.some((i) => i.id === target.itemId)) throw new AppError('NOT_FOUND', 'Item not found');
    if (!bill.participants.some((p) => p.id === target.participantId)) throw new AppError('NOT_FOUND', 'Person not found');
    return { putClaims: [target] };
  });
}

/** Removing a claim that does not exist is harmless, so a double tap never errors. */
export async function unclaim(deps: Deps, host: BillHost, billId: string, target: Claim) {
  return writeBill(deps, host, billId, () => ({ deleteClaims: [target] }));
}
