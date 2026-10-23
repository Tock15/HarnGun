import { describe, expect, it } from 'vitest';
import type { BillDiscount, CalcConfig, Claim, Item } from '../../src/types';
import { computeSplit } from '../../src/math/split';
import { calcTotals } from '../../src/math/calcTotals';
import { claim, makeBill, makeItem, makeParticipants, randomInt, seededRandom, THAI_STANDARD } from '../helpers/testUtils';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function dinner() {
  const tomYum = makeItem(30000, { name: 'Tom Yum' });
  const rice = makeItem(6000, { name: 'Rice' });
  const beer = makeItem(12000, { name: 'Beer' });
  const somTam = makeItem(9000, { name: 'Som Tam' });
  const participants = makeParticipants('Alice', 'Bob', 'Charlie');
  const claims = [
    ...claim(tomYum, 'Alice', 'Bob', 'Charlie'),
    ...claim(rice, 'Alice'),
    ...claim(beer, 'Bob'),
    ...claim(somTam, 'Charlie'),
  ];
  // Subtotal ฿570, SC ฿57, VAT ฿43.89, total ฿670.89
  return makeBill({ items: [tomYum, rice, beer, somTam], participants, claims, scannedGrandTotal: 67089 });
}

describe('computeSplit', () => {
  it('splits a fully claimed bill exactly', () => {
    const result = computeSplit(dinner());
    expect(result.canSettle).toBe(true);
    expect(result.guard.status).toBe('MATCH');
    expect(result.splitTotal).toBe(67089);
    expect(result.shares.map((s) => s.total)).toEqual([18832, 25894, 22363]);
    expect(sum(result.shares.map((s) => s.total))).toBe(67089);

    const [alice] = result.shares;
    expect(alice).toMatchObject({ subtotal: 16000, discount: 0, serviceCharge: 1600, vat: 1232, rounding: 0 });
    expect(alice?.items).toEqual([
      { itemId: expect.any(String), name: 'Tom Yum', amount: 10000, claimantCount: 3 },
      { itemId: expect.any(String), name: 'Rice', amount: 6000, claimantCount: 1 },
    ]);
  });

  it('splits the printed total when it is 1 satang off', () => {
    const result = computeSplit({ ...dinner(), scannedGrandTotal: 67090 });
    expect(result.guard.status).toBe('ROUNDING');
    expect(result.splitTotal).toBe(67090);
    expect(sum(result.shares.map((s) => s.total))).toBe(67090);
    // The extra satang shows up on someone's rounding line
    expect(sum(result.shares.map((s) => s.rounding))).toBe(1);
  });

  it('gives leftover satang of a shared item to the earliest claimants', () => {
    const item = makeItem(10000);
    const result = computeSplit(
      makeBill({
        items: [item],
        participants: makeParticipants('A', 'B', 'C'),
        claims: claim(item, 'C', 'A', 'B'),
        calcConfig: { ...THAI_STANDARD, serviceChargeRate: 0, vatRate: 0 },
        scannedGrandTotal: 10000,
      }),
    );
    expect(result.shares.map((s) => s.subtotal)).toEqual([3334, 3333, 3333]);
  });

  it('blocks settlement while items are unclaimed, and previews the claimed shares', () => {
    const bill = dinner();
    const somTamId = bill.items[3]?.id;
    const result = computeSplit({ ...bill, claims: bill.claims.filter((c) => c.itemId !== somTamId) });
    expect(result.canSettle).toBe(false);
    expect(result.unclaimedItemIds).toEqual([somTamId]);
    // Charlie only has the Tom Yum share now; the Som Tam's portion is not assigned to anyone
    expect(result.shares[2]?.subtotal).toBe(10000);
    expect(sum(result.shares.map((s) => s.total))).toBe(67089 - 10593); // Som Tam ฿90 × 1.177
    expect(result.shares.every((s) => s.rounding === 0)).toBe(true);
  });

  it('blocks settlement on a mismatch and previews with the computed total', () => {
    const result = computeSplit({ ...dinner(), scannedGrandTotal: 70000 });
    expect(result.guard.status).toBe('MISMATCH');
    expect(result.canSettle).toBe(false);
    expect(result.splitTotal).toBe(67089);
  });

  it('splits a rounding-only total evenly when every item is free', () => {
    const item = makeItem(0);
    const result = computeSplit(
      makeBill({
        items: [item],
        participants: makeParticipants('A', 'B'),
        claims: claim(item, 'A'),
        roundingAdjustment: 1,
        scannedGrandTotal: 1,
      }),
    );
    expect(result.shares.map((s) => s.total)).toEqual([1, 0]);
  });

  it('blocks settlement with no participants', () => {
    const result = computeSplit({ ...dinner(), participants: [], claims: [] });
    expect(result.canSettle).toBe(false);
    expect(result.shares).toEqual([]);
  });

  it('ignores claims from unknown participants and duplicate claims', () => {
    const bill = dinner();
    const tomYum = bill.items[0] as Item;
    const extra: Claim[] = [...claim(tomYum, 'Mallory'), ...claim(tomYum, 'Alice')];
    const result = computeSplit({ ...bill, claims: [...bill.claims, ...extra] });
    expect(result.shares.map((s) => s.total)).toEqual([18832, 25894, 22363]);
  });

  it('allocates discounts and marks inclusive VAT as informational', () => {
    const discounts: BillDiscount[] = [{ id: 'd1', label: 'Voucher', type: 'FLAT', amount: 5700 }];
    const bill = { ...dinner(), calcConfig: { ...THAI_STANDARD, vatMode: 'INCLUSIVE' as const }, discounts };
    const result = computeSplit({ ...bill, scannedGrandTotal: calcTotals(bill).grandTotal });
    expect(result.canSettle).toBe(true);
    expect(sum(result.shares.map((s) => s.discount))).toBe(5700);
    for (const share of result.shares) {
      // VAT is inside the prices, so it is not part of the sum
      expect(share.subtotal - share.discount + share.serviceCharge + share.rounding).toBe(share.total);
    }
  });

  it('always balances to the printed total (randomized)', () => {
    const random = seededRandom(7);
    const configs: CalcConfig[] = [
      THAI_STANDARD,
      { ...THAI_STANDARD, discountTiming: 'AFTER_SC' },
      { ...THAI_STANDARD, vatMode: 'INCLUSIVE', serviceChargeRate: 0 },
      { ...THAI_STANDARD, vatMode: 'INCLUSIVE', discountTiming: 'AFTER_SC' },
      { serviceChargeRate: 0, vatRate: 0, vatMode: 'EXCLUSIVE', discountTiming: 'BEFORE_SC' },
    ];

    for (let run = 0; run < 2000; run++) {
      const participants = makeParticipants(...Array.from({ length: randomInt(random, 1, 8) }, (_, i) => `P${i}`));
      const items = Array.from({ length: randomInt(random, 1, 15) }, () => makeItem(randomInt(random, 0, 200_000)));
      const claims = items.flatMap((item) => {
        const shuffled = [...participants].sort(() => random() - 0.5);
        return claim(item, ...shuffled.slice(0, randomInt(random, 1, participants.length)).map((p) => p.id));
      });
      const calcConfig = configs[randomInt(random, 0, configs.length - 1)] as CalcConfig;
      const discounts =
        random() < 0.3 ? [{ id: 'd', label: 'Discount', type: 'PERCENT' as const, rate: randomInt(random, 0, 2000) }] : [];
      const roundingAdjustment = random() < 0.2 ? randomInt(random, -50, 50) : 0;
      const base = makeBill({ items, participants, claims, calcConfig, discounts, roundingAdjustment });
      const scannedGrandTotal = calcTotals(base).grandTotal + randomInt(random, -1, 1);

      const result = computeSplit({ ...base, scannedGrandTotal });
      expect(result.canSettle).toBe(true);
      expect(sum(result.shares.map((s) => s.total))).toBe(scannedGrandTotal);
      // No receipt rounding and an exact match: nobody should see a rounding line
      if (roundingAdjustment === 0 && result.guard.status === 'MATCH') {
        expect(result.shares.every((s) => s.rounding === 0)).toBe(true);
      }
      for (const share of result.shares) {
        const vatAdded = calcConfig.vatMode === 'EXCLUSIVE' ? share.vat : 0;
        expect(share.subtotal - share.discount + share.serviceCharge + vatAdded + share.rounding).toBe(share.total);
        expect(sum(share.items.map((line) => line.amount))).toBe(share.subtotal);
        if (scannedGrandTotal >= 0) expect(share.total).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
