import type { Satang } from '../types';
import type { BillTotals } from './calcTotals';

/**
 * MATCH: computed total equals the printed total.
 * ROUNDING: off by at most 1 satang (POS rounding differences) — accepted.
 * MISMATCH: off by more; something was probably misread.
 * INCOMPLETE: an item has no price, or there is no printed total to compare against.
 * NO_RECEIPT: typed by hand with no printed total; nothing was misread, so the computed total is trusted.
 */
export type GuardStatus = 'MATCH' | 'ROUNDING' | 'MISMATCH' | 'INCOMPLETE' | 'NO_RECEIPT';

export const ROUNDING_TOLERANCE: Satang = 1;

export interface GuardResult {
  status: GuardStatus;
  computedTotal: Satang;
  scannedTotal: Satang | null;
  /** computedTotal − scannedTotal, or null when INCOMPLETE or NO_RECEIPT. */
  difference: Satang | null;
}

/**
 * Compares the computed grand total with the total printed on the receipt (ADR-007).
 * `typedByHand`: the bill has items but no receipt photo, so a missing printed total is fine.
 */
export function checkMathGuard(totals: BillTotals, scannedGrandTotal: Satang | null, typedByHand = false): GuardResult {
  const computedTotal = totals.grandTotal;
  if (!totals.hasUnpricedItems && scannedGrandTotal === null && typedByHand) {
    return { status: 'NO_RECEIPT', computedTotal, scannedTotal: null, difference: null };
  }
  if (totals.hasUnpricedItems || scannedGrandTotal === null) {
    return { status: 'INCOMPLETE', computedTotal, scannedTotal: scannedGrandTotal, difference: null };
  }
  const difference = computedTotal - scannedGrandTotal;
  const status: GuardStatus =
    difference === 0 ? 'MATCH' : Math.abs(difference) <= ROUNDING_TOLERANCE ? 'ROUNDING' : 'MISMATCH';
  return { status, computedTotal, scannedTotal: scannedGrandTotal, difference };
}

/** Settlement is only allowed when the totals agree (within rounding). */
export function guardAllowsSettlement(guard: GuardResult): boolean {
  return guard.status === 'MATCH' || guard.status === 'ROUNDING' || guard.status === 'NO_RECEIPT';
}
