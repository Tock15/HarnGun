import { randomUUID } from 'node:crypto';
import type { Bill, BillHost } from '@harngun/shared';
import { billView, loadOwnedBill, parseInput, writeBill, type BillView, type Deps } from './context';
import { AppError } from './errors';
import { createBillInput, updateBillInput } from './schemas';

/** A new bill disappears after this unless it gets its first item (decision 1). */
export const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Starts an empty DRAFT bill with the host as its first participant. */
export async function createBill(deps: Deps, host: BillHost, body: unknown, receiptImageKey?: (billId: string) => string) {
  const { title } = parseInput(createBillInput, body);
  const id = randomUUID();
  const now = new Date();
  const bill: Bill = {
    id,
    version: 1,
    status: 'DRAFT',
    title: title ?? '',
    restaurantName: null,
    host,
    calcConfig: { serviceChargeRate: 0, vatRate: 0, vatMode: 'EXCLUSIVE', discountTiming: 'BEFORE_SC' },
    discounts: [],
    roundingAdjustment: 0,
    scannedGrandTotal: null,
    receiptImageKey: receiptImageKey?.(id) ?? null,
    items: [],
    // The host ate too, and already paid the restaurant.
    participants: [{ id: randomUUID(), name: host.name, colorIndex: 0, isHost: true, isPaid: true, sortOrder: 0 }],
    claims: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await deps.bills.create(bill, new Date(now.getTime() + DRAFT_LIFETIME_MS));
  return billView(bill);
}

/** Polling read: `null` means "unchanged since `since`" (HTTP 304). */
export async function getBill(deps: Deps, host: BillHost, billId: string, since?: number): Promise<BillView | null> {
  if (since !== undefined) {
    const version = await deps.bills.getVersion(billId);
    if (version === null) throw new AppError('NOT_FOUND', 'Bill not found');
    // shortcut: the unchanged answer skips the owner check, so it only reveals "no change" to someone who already knows this UUID; Mode B guest tokens replace this.
    if (version === since) return null;
  }
  return billView(await loadOwnedBill(deps, host, billId));
}

export async function updateBill(deps: Deps, host: BillHost, billId: string, body: unknown) {
  const meta = parseInput(updateBillInput, body);
  return writeBill(deps, host, billId, () => ({ meta }));
}
