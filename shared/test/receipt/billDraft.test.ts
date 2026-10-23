import { describe, expect, it } from 'vitest';
import { receiptFixtures } from '../../fixtures';
import { billDraftFromReceipt } from '../../src/receipt/billDraft';
import { calcTotals } from '../../src/math/calcTotals';
import { checkMathGuard } from '../../src/math/mathGuard';
import { computeSplit } from '../../src/math/split';
import { makeBill, makeParticipants } from '../helpers/testUtils';

const draft = (name: string) => billDraftFromReceipt(receiptFixtures[name]!);

describe('billDraftFromReceipt', () => {
  it('converts Baht to satang and percentages to basis points', () => {
    const bill = draft('restaurant-sc-vat-discount');
    expect(bill.items[4]).toMatchObject({ name: 'Singha Beer', quantity: 3, unitPrice: 9500, totalPrice: 28500, sortOrder: 4 });
    expect(bill.discounts).toEqual([{ id: 'discount-0', label: 'ส่วนลดสมาชิก 10%', type: 'PERCENT', rate: 1000 }]);
    expect(bill.calcConfig).toEqual({ serviceChargeRate: 1000, vatRate: 700, vatMode: 'EXCLUSIVE', discountTiming: 'BEFORE_SC' });
    expect(bill.scannedGrandTotal).toBe(132942);
  });

  it('treats missing rates as 0 and keeps illegible prices as null', () => {
    const bill = draft('thermal-slip-modifiers');
    expect(bill.calcConfig).toMatchObject({ serviceChargeRate: 0, vatRate: 0, vatMode: 'EXCLUSIVE' });
    expect(bill.roundingAdjustment).toBe(0);
    expect(bill.items[2]).toMatchObject({ name: 'ชาเย็น', totalPrice: null, needsReview: true });
  });

  it('flags an item for review when its price is missing, even if the AI did not', () => {
    const receipt = receiptFixtures['cafe-vat-inclusive']!;
    const bill = billDraftFromReceipt({
      ...receipt,
      items: [{ ...receipt.items[0]!, totalPrice: null, needsReview: false }],
    });
    expect(bill.items[0]?.needsReview).toBe(true);
  });

  it('converts flat discounts', () => {
    const receipt = receiptFixtures['cafe-vat-inclusive']!;
    const bill = billDraftFromReceipt({
      ...receipt,
      financials: { ...receipt.financials, discounts: [{ label: 'Voucher', type: 'flat', value: 50, amount: 50 }] },
    });
    expect(bill.discounts).toEqual([{ id: 'discount-0', label: 'Voucher', type: 'FLAT', amount: 5000 }]);
  });
});

describe('receipt fixtures', () => {
  it('every fully legible fixture reconciles with its printed total (Math Guard MATCH)', () => {
    for (const name of ['cafe-vat-inclusive', 'restaurant-sc-vat-discount']) {
      const bill = draft(name);
      expect(checkMathGuard(calcTotals(bill), bill.scannedGrandTotal).status, name).toBe('MATCH');
    }
  });

  it('matches the printed SC and VAT lines too', () => {
    for (const [name, receipt] of Object.entries(receiptFixtures)) {
      const totals = calcTotals(billDraftFromReceipt(receipt));
      const { serviceChargeAmount, vatAmount } = receipt.financials;
      if (serviceChargeAmount !== null) expect(totals.serviceCharge, name).toBe(Math.round(serviceChargeAmount * 100));
      if (vatAmount !== null) expect(totals.vat, name).toBe(Math.round(vatAmount * 100));
    }
  });

  it('the thermal slip is INCOMPLETE until the host types the missing price, then MATCH', () => {
    const bill = draft('thermal-slip-modifiers');
    expect(checkMathGuard(calcTotals(bill), bill.scannedGrandTotal).status).toBe('INCOMPLETE');

    const fixed = { ...bill, items: bill.items.map((i) => (i.totalPrice === null ? { ...i, totalPrice: 4500 } : i)) };
    expect(checkMathGuard(calcTotals(fixed), fixed.scannedGrandTotal).status).toBe('MATCH');
  });

  it('a fixture can be split and settled end to end', () => {
    const participants = makeParticipants('Alice', 'Bob', 'Charlie');
    const bill = draft('restaurant-sc-vat-discount');
    const claims = bill.items.map((item, i) => ({ itemId: item.id, participantId: participants[i % 3]!.id }));
    const result = computeSplit(makeBill({ ...bill, participants, claims }));
    expect(result.canSettle).toBe(true);
    expect(result.shares.reduce((sum, s) => sum + s.total, 0)).toBe(132942);
  });
});
