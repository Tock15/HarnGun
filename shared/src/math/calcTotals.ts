import type { Bill, Item, Satang } from '../types';
import { applyRate, extractInclusiveVat } from './money';

export interface BillTotals {
  /** Sum of item prices after item-level discounts. */
  subtotal: Satang;
  /** Total bill-level discount (positive number), capped at the subtotal. */
  discount: Satang;
  serviceCharge: Satang;
  /** VAT amount. For INCLUSIVE bills this is informational only and not added to the total. */
  vat: Satang;
  roundingAdjustment: Satang;
  grandTotal: Satang;
  /** True when some item has no price yet; those items count as ฿0 until the host fills them in. */
  hasUnpricedItems: boolean;
}

export type TotalsInput = Pick<Bill, 'items' | 'calcConfig' | 'discounts' | 'roundingAdjustment'>;

/** Item price after its item-level discount, or null if the price is unknown. */
export function itemNetPrice(item: Pick<Item, 'totalPrice' | 'itemDiscount'>): Satang | null {
  if (item.totalPrice === null) return null;
  return Math.max(0, item.totalPrice - item.itemDiscount);
}

/** Calculates the bill's totals using its calculation config (PRD §4.3). */
export function calcTotals(bill: TotalsInput): BillTotals {
  let subtotal = 0;
  let hasUnpricedItems = false;
  for (const item of bill.items) {
    const net = itemNetPrice(item);
    if (net === null) hasUnpricedItems = true;
    else subtotal += net;
  }

  // Percentage discounts are each taken from the subtotal; they do not compound.
  const rawDiscount = bill.discounts.reduce(
    (sum, d) => sum + (d.type === 'PERCENT' ? applyRate(subtotal, d.rate) : d.amount),
    0,
  );
  const discount = Math.min(subtotal, Math.max(0, rawDiscount));

  const { serviceChargeRate, vatRate, vatMode, discountTiming } = bill.calcConfig;

  let serviceCharge: Satang;
  let taxable: Satang;
  if (discountTiming === 'BEFORE_SC') {
    const base = subtotal - discount;
    serviceCharge = applyRate(base, serviceChargeRate);
    taxable = base + serviceCharge;
  } else {
    serviceCharge = applyRate(subtotal, serviceChargeRate);
    taxable = subtotal + serviceCharge - discount;
  }

  let vat: Satang;
  let grandTotal: Satang;
  if (vatMode === 'EXCLUSIVE') {
    vat = applyRate(taxable, vatRate);
    grandTotal = taxable + vat + bill.roundingAdjustment;
  } else {
    vat = extractInclusiveVat(taxable, vatRate);
    grandTotal = taxable + bill.roundingAdjustment;
  }

  return {
    subtotal,
    discount,
    serviceCharge,
    vat,
    roundingAdjustment: bill.roundingAdjustment,
    grandTotal,
    hasUnpricedItems,
  };
}
