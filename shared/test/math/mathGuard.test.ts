import { describe, expect, it } from 'vitest';
import { calcTotals } from '../../src/math/calcTotals';
import { checkMathGuard, guardAllowsSettlement } from '../../src/math/mathGuard';
import { makeBill, makeItem } from '../helpers/testUtils';

const totals = calcTotals(makeBill({ items: [makeItem(25000), makeItem(6000)] })); // computed ฿364.87

describe('checkMathGuard', () => {
  it('matches when the totals are equal', () => {
    const guard = checkMathGuard(totals, 36487);
    expect(guard).toEqual({ status: 'MATCH', computedTotal: 36487, scannedTotal: 36487, difference: 0 });
    expect(guardAllowsSettlement(guard)).toBe(true);
  });

  it('accepts a 1 satang rounding difference either way', () => {
    expect(checkMathGuard(totals, 36488)).toMatchObject({ status: 'ROUNDING', difference: -1 });
    expect(checkMathGuard(totals, 36486)).toMatchObject({ status: 'ROUNDING', difference: 1 });
    expect(guardAllowsSettlement(checkMathGuard(totals, 36488))).toBe(true);
  });

  it('flags larger differences', () => {
    const guard = checkMathGuard(totals, 39487);
    expect(guard).toMatchObject({ status: 'MISMATCH', difference: -3000 });
    expect(guardAllowsSettlement(guard)).toBe(false);
  });

  it('is incomplete without a printed total or with unpriced items', () => {
    expect(checkMathGuard(totals, null).status).toBe('INCOMPLETE');
    const unpriced = calcTotals(makeBill({ items: [makeItem(25000), makeItem(null)] }));
    expect(checkMathGuard(unpriced, 36487).status).toBe('INCOMPLETE');
    expect(guardAllowsSettlement(checkMathGuard(totals, null))).toBe(false);
  });
});
