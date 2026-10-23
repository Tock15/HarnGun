import type { Bill, BillDiscount, ParsedReceipt } from '../types';
import { bahtToSatang, percentToBasisPoints } from '../math/money';

export type BillDraft = Pick<
  Bill,
  'restaurantName' | 'items' | 'discounts' | 'calcConfig' | 'roundingAdjustment' | 'scannedGrandTotal'
>;

const toSatang = (baht: number | null) => (baht === null ? null : bahtToSatang(baht));

/**
 * Converts the AI's receipt (decimal Baht as printed) into bill fields in satang (ADR-012).
 * Missing rates become 0 and discounts default to BEFORE_SC; the host adjusts both on the
 * Review screen if the Math Guard disagrees.
 */
export function billDraftFromReceipt(receipt: ParsedReceipt): BillDraft {
  const { financials } = receipt;
  return {
    restaurantName: receipt.restaurantName,
    items: receipt.items.map((item, index) => {
      const totalPrice = toSatang(item.totalPrice);
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: toSatang(item.unitPrice),
        totalPrice,
        itemDiscount: 0,
        modifiers: item.modifiers,
        needsReview: item.needsReview || totalPrice === null,
        sortOrder: index,
      };
    }),
    discounts: financials.discounts.map(
      (d, index): BillDiscount =>
        d.type === 'percent'
          ? { id: `discount-${index}`, label: d.label, type: 'PERCENT', rate: percentToBasisPoints(d.value) }
          : { id: `discount-${index}`, label: d.label, type: 'FLAT', amount: bahtToSatang(d.value) },
    ),
    calcConfig: {
      serviceChargeRate: percentToBasisPoints(financials.serviceChargeRate ?? 0),
      vatRate: percentToBasisPoints(financials.vatRate ?? 0),
      vatMode: financials.isVatInclusive ? 'INCLUSIVE' : 'EXCLUSIVE',
      discountTiming: 'BEFORE_SC',
    },
    roundingAdjustment: bahtToSatang(financials.roundingAdjustment ?? 0),
    scannedGrandTotal: toSatang(financials.grandTotal),
  };
}
