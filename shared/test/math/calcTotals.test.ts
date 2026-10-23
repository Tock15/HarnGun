import { describe, expect, it } from 'vitest';
import { calcTotals, itemNetPrice } from '../../src/math/calcTotals';
import { makeBill, makeItem, NO_CHARGES, THAI_STANDARD } from '../helpers/testUtils';

const tomYumAndRice = () => [makeItem(25000), makeItem(6000)]; // ฿310 subtotal

describe('calcTotals', () => {
  it('applies SC then VAT (exclusive, no discount)', () => {
    const totals = calcTotals(makeBill({ items: tomYumAndRice() }));
    expect(totals).toMatchObject({
      subtotal: 31000,
      discount: 0,
      serviceCharge: 3100,
      vat: 2387,
      grandTotal: 36487,
      hasUnpricedItems: false,
    });
  });

  it('applies a percentage discount before SC (doc 04 example)', () => {
    const totals = calcTotals(
      makeBill({
        items: tomYumAndRice(),
        discounts: [{ id: 'd1', label: 'Member -10%', type: 'PERCENT', rate: 1000 }],
      }),
    );
    // (310 − 31) × 10% = 27.90; (279 + 27.90) × 7% = 21.48; total 328.38
    expect(totals).toMatchObject({ discount: 3100, serviceCharge: 2790, vat: 2148, grandTotal: 32838 });
  });

  it('applies a discount after SC', () => {
    const totals = calcTotals(
      makeBill({
        items: tomYumAndRice(),
        calcConfig: { ...THAI_STANDARD, discountTiming: 'AFTER_SC' },
        discounts: [{ id: 'd1', label: 'Member -10%', type: 'PERCENT', rate: 1000 }],
      }),
    );
    // SC on full ฿310 = 31; taxable 310 + 31 − 31 = 310; VAT 21.70; total 331.70
    expect(totals).toMatchObject({ discount: 3100, serviceCharge: 3100, vat: 2170, grandTotal: 33170 });
  });

  it('does not add VAT again when prices include it', () => {
    const totals = calcTotals(
      makeBill({
        items: [makeItem(6500), makeItem(7500), makeItem(5500)],
        calcConfig: { serviceChargeRate: 0, vatRate: 700, vatMode: 'INCLUSIVE', discountTiming: 'BEFORE_SC' },
      }),
    );
    expect(totals).toMatchObject({ subtotal: 19500, serviceCharge: 0, vat: 1276, grandTotal: 19500 });
  });

  it('applies SC with inclusive VAT', () => {
    const totals = calcTotals(
      makeBill({
        items: [makeItem(10000)],
        calcConfig: { serviceChargeRate: 1000, vatRate: 700, vatMode: 'INCLUSIVE', discountTiming: 'BEFORE_SC' },
      }),
    );
    // ฿100 + ฿10 SC = ฿110, of which VAT is 110 × 7/107 = 7.196
    expect(totals).toMatchObject({ serviceCharge: 1000, vat: 720, grandTotal: 11000 });
  });

  it('adds flat discounts and the rounding line', () => {
    const totals = calcTotals(
      makeBill({
        items: tomYumAndRice(),
        calcConfig: NO_CHARGES,
        discounts: [
          { id: 'd1', label: 'Voucher', type: 'FLAT', amount: 5000 },
          { id: 'd2', label: '5%', type: 'PERCENT', rate: 500 },
        ],
        roundingAdjustment: -50,
      }),
    );
    // 310 − (50 + 15.50) = 244.50, rounding −0.50 → 244.00
    expect(totals).toMatchObject({ discount: 6550, grandTotal: 24400, roundingAdjustment: -50 });
  });

  it('caps the discount at the subtotal', () => {
    const totals = calcTotals(
      makeBill({
        items: [makeItem(30000)],
        discounts: [{ id: 'd1', label: 'Big voucher', type: 'FLAT', amount: 50000 }],
      }),
    );
    expect(totals).toMatchObject({ discount: 30000, serviceCharge: 0, vat: 0, grandTotal: 0 });
  });

  it('subtracts item-level discounts before the subtotal', () => {
    const totals = calcTotals(makeBill({ items: [makeItem(10000, { itemDiscount: 2000 })], calcConfig: NO_CHARGES }));
    expect(totals.subtotal).toBe(8000);
  });

  it('counts unpriced items as zero and flags them', () => {
    const totals = calcTotals(makeBill({ items: [makeItem(10000), makeItem(null)], calcConfig: NO_CHARGES }));
    expect(totals).toMatchObject({ subtotal: 10000, hasUnpricedItems: true });
  });

  it('handles an empty bill', () => {
    expect(calcTotals(makeBill()).grandTotal).toBe(0);
  });
});

describe('itemNetPrice', () => {
  it('never goes below zero', () => {
    expect(itemNetPrice({ totalPrice: 1000, itemDiscount: 5000 })).toBe(0);
    expect(itemNetPrice({ totalPrice: null, itemDiscount: 0 })).toBeNull();
  });
});
