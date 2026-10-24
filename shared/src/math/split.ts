import type { Bill, Satang } from '../types';
import { allocateProportionally, splitEvenly } from './allocate';
import { calcTotals, itemNetPrice, type BillTotals } from './calcTotals';
import { checkMathGuard, guardAllowsSettlement, type GuardResult } from './mathGuard';

export interface ShareItemLine {
  itemId: string;
  name: string;
  /** This person's part of the item price. */
  amount: Satang;
  claimantCount: number;
}

export interface PersonShare {
  participantId: string;
  items: ShareItemLine[];
  subtotal: Satang;
  discount: Satang;
  serviceCharge: Satang;
  /** For INCLUSIVE bills this is the VAT already inside the prices (informational). */
  vat: Satang;
  /** This person's part of the receipt's rounding line and of any 1-satang Math Guard gap. Usually 0. */
  rounding: Satang;
  /** Amount this person pays the host. */
  total: Satang;
}

export interface SplitResult {
  totals: BillTotals;
  guard: GuardResult;
  /**
   * Amount divided between participants: the printed receipt total when the Math Guard passes
   * (so the host gets back exactly what they paid), otherwise the computed total as a preview.
   */
  splitTotal: Satang;
  shares: PersonShare[];
  unclaimedItemIds: string[];
  canSettle: boolean;
}

export type SplitInput = Pick<
  Bill,
  'items' | 'participants' | 'claims' | 'calcConfig' | 'discounts' | 'roundingAdjustment' | 'scannedGrandTotal' | 'receiptImageKey'
>;

/**
 * Works out what each participant owes (PRD §4.4–4.6).
 *
 * Shared items are split evenly between their claimants. Every bill-level amount (discount,
 * service charge, VAT, rounding) is proportional to each person's item subtotal, so each one is
 * allocated with the largest-remainder method using item subtotals as weights. Unclaimed items
 * hold their own weight, so shares only add up to the full total once every item is claimed.
 */
export function computeSplit(bill: SplitInput): SplitResult {
  const totals = calcTotals(bill);
  const typedByHand = bill.receiptImageKey === null && bill.items.length > 0;
  const guard = checkMathGuard(totals, bill.scannedGrandTotal, typedByHand);
  const guardPasses = guardAllowsSettlement(guard);
  const splitTotal = guardPasses && bill.scannedGrandTotal !== null ? bill.scannedGrandTotal : totals.grandTotal;

  const participantIndex = new Map(bill.participants.map((p, i) => [p.id, i]));
  const claimantsByItem = new Map<string, Set<number>>();
  for (const claim of bill.claims) {
    const index = participantIndex.get(claim.participantId);
    if (index === undefined) continue;
    const claimants = claimantsByItem.get(claim.itemId) ?? new Set<number>();
    claimants.add(index);
    claimantsByItem.set(claim.itemId, claimants);
  }

  const lines: ShareItemLine[][] = bill.participants.map(() => []);
  const subtotals: Satang[] = bill.participants.map(() => 0);
  const unclaimedItemIds: string[] = [];
  let unclaimedSubtotal = 0;

  for (const item of bill.items) {
    const net = itemNetPrice(item) ?? 0;
    const claimants = [...(claimantsByItem.get(item.id) ?? [])].sort((a, b) => a - b);
    if (claimants.length === 0) {
      unclaimedItemIds.push(item.id);
      unclaimedSubtotal += net;
      continue;
    }
    const parts = splitEvenly(net, claimants.length);
    claimants.forEach((participant, k) => {
      const amount = parts[k] ?? 0;
      lines[participant]?.push({ itemId: item.id, name: item.name, amount, claimantCount: claimants.length });
      subtotals[participant] = (subtotals[participant] ?? 0) + amount;
    });
  }

  // If every item is ฿0, split any remaining amount (e.g. a rounding line) evenly between participants.
  const allZero = unclaimedSubtotal === 0 && subtotals.every((s) => s === 0);
  const weights = allZero ? [...subtotals.map(() => 1), 0] : [...subtotals, unclaimedSubtotal];
  const allocate = (amount: Satang) => allocateProportionally(amount, weights).slice(0, bill.participants.length);
  const discountParts = allocate(totals.discount);
  const serviceChargeParts = allocate(totals.serviceCharge);
  const vatParts = allocate(totals.vat);
  const vatIsAdded = bill.calcConfig.vatMode === 'EXCLUSIVE';
  // The lines above already add up exactly; only the receipt's rounding line and any Math Guard gap remain.
  const balance = splitTotal - (totals.subtotal - totals.discount + totals.serviceCharge + (vatIsAdded ? totals.vat : 0));
  const roundingParts = allocate(balance);

  const shares = bill.participants.map((participant, i): PersonShare => {
    const subtotal = subtotals[i] ?? 0;
    const discount = discountParts[i] ?? 0;
    const serviceCharge = serviceChargeParts[i] ?? 0;
    const vat = vatParts[i] ?? 0;
    const rounding = roundingParts[i] ?? 0;
    const total = subtotal - discount + serviceCharge + (vatIsAdded ? vat : 0) + rounding;
    return {
      participantId: participant.id,
      items: lines[i] ?? [],
      subtotal,
      discount,
      serviceCharge,
      vat,
      rounding,
      total,
    };
  });

  return {
    totals,
    guard,
    splitTotal,
    shares,
    unclaimedItemIds,
    canSettle: guardPasses && unclaimedItemIds.length === 0 && bill.participants.length > 0,
  };
}
