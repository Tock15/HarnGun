import { computeSplit, type Bill } from '@harngun/shared';
import { describe, expect, it } from 'vitest';
import { parseDecimal } from './DecimalInput';
import { parseRoute } from './route';
import { summaryText } from './screens/SettleStep';

describe('parseRoute', () => {
  it('reads the bill id and step from the hash', () => {
    expect(parseRoute('#/bill/abc/assign')).toEqual({ name: 'bill', billId: 'abc', step: 'assign' });
    expect(parseRoute('#/bill/abc/nonsense')).toEqual({ name: 'bill', billId: 'abc', step: 'review' });
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/bill/')).toEqual({ name: 'home' });
  });
});

describe('parseDecimal', () => {
  it('turns typed amounts into hundredths', () => {
    expect(parseDecimal('364.87')).toBe(36487);
    expect(parseDecimal('1,200')).toBe(120000);
    expect(parseDecimal('7')).toBe(700);
    expect(parseDecimal('  ')).toBeNull();
    expect(parseDecimal('abc')).toBeUndefined();
    expect(parseDecimal('-0.25')).toBeUndefined();
    expect(parseDecimal('-0.25', true)).toBe(-25);
  });
});

describe('summaryText', () => {
  it('lists what each friend owes, skipping the host', () => {
    const person = (id: string, name: string, sortOrder: number, isHost = false) =>
      ({ id, name, colorIndex: sortOrder, isHost, isPaid: false, sortOrder });
    const item = (id: string, name: string, price: number, sortOrder: number) =>
      ({ id, name, quantity: 1, unitPrice: price, totalPrice: price, itemDiscount: 0, modifiers: [], needsReview: false, sortOrder });
    const bill = {
      title: 'Som Tam Nua',
      host: { id: 'h', name: 'Koses', promptPayId: '0812345678', promptPayType: 'PHONE' },
      calcConfig: { serviceChargeRate: 0, vatRate: 0, vatMode: 'EXCLUSIVE', discountTiming: 'BEFORE_SC' },
      discounts: [],
      roundingAdjustment: 0,
      scannedGrandTotal: 30000,
      items: [item('i1', 'ส้มตำ', 12000, 0), item('i2', 'ไก่ทอด', 18000, 1)],
      participants: [person('h', 'Koses', 0, true), person('a', 'Ann', 1)],
      claims: [
        { itemId: 'i1', participantId: 'h' },
        { itemId: 'i1', participantId: 'a' },
        { itemId: 'i2', participantId: 'a' },
      ],
    } as unknown as Bill;

    expect(summaryText(bill, computeSplit(bill))).toBe(
      ['🧾 Som Tam Nua: ฿300.00', '', 'Ann: ฿240.00', '  ส้มตำ ÷2 ฿60.00', '  ไก่ทอด ฿180.00', '', 'PromptPay 0812345678 (Koses)'].join('\n'),
    );
  });
});
