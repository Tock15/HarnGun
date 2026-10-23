import { describe, expect, it } from 'vitest';
import {
  applyRate,
  bahtToSatang,
  divideRoundHalfUp,
  extractInclusiveVat,
  formatBaht,
  percentToBasisPoints,
  satangToBahtString,
} from '../../src/math/money';

describe('bahtToSatang', () => {
  it('converts printed amounts exactly', () => {
    expect(bahtToSatang(364.87)).toBe(36487);
    expect(bahtToSatang(0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996 in floating point
    expect(bahtToSatang(0)).toBe(0);
    expect(bahtToSatang(-0.37)).toBe(-37);
  });

  it('rejects non-finite input', () => {
    expect(() => bahtToSatang(Number.NaN)).toThrow(RangeError);
    expect(() => bahtToSatang(Infinity)).toThrow(RangeError);
  });
});

describe('percentToBasisPoints', () => {
  it('converts percentages', () => {
    expect(percentToBasisPoints(7)).toBe(700);
    expect(percentToBasisPoints(10)).toBe(1000);
    expect(percentToBasisPoints(2.5)).toBe(250);
  });
});

describe('formatting', () => {
  it('formats plain decimal strings', () => {
    expect(satangToBahtString(36487)).toBe('364.87');
    expect(satangToBahtString(5)).toBe('0.05');
    expect(satangToBahtString(100)).toBe('1.00');
    expect(satangToBahtString(-37)).toBe('-0.37');
  });

  it('formats display strings with separators', () => {
    expect(formatBaht(123456)).toBe('฿1,234.56');
    expect(formatBaht(0)).toBe('฿0.00');
    expect(formatBaht(-150)).toBe('-฿1.50');
  });

  it('rejects fractional satang', () => {
    expect(() => satangToBahtString(1.5)).toThrow(RangeError);
  });
});

describe('divideRoundHalfUp', () => {
  it('rounds halves away from zero', () => {
    expect(divideRoundHalfUp(5n, 10n)).toBe(1n);
    expect(divideRoundHalfUp(4n, 10n)).toBe(0n);
    expect(divideRoundHalfUp(15n, 10n)).toBe(2n);
    expect(divideRoundHalfUp(-5n, 10n)).toBe(-1n);
    expect(divideRoundHalfUp(-4n, 10n)).toBe(0n);
  });
});

describe('applyRate', () => {
  it('calculates percentages in satang', () => {
    expect(applyRate(31000, 1000)).toBe(3100); // 10% of ฿310
    expect(applyRate(34100, 700)).toBe(2387); // 7% of ฿341
    expect(applyRate(30690, 700)).toBe(2148); // 7% of ฿306.90 = 21.483
  });

  it('rounds half up to the satang', () => {
    expect(applyRate(5, 1000)).toBe(1); // 0.5 satang → 1
    expect(applyRate(4, 1000)).toBe(0); // 0.4 satang → 0
  });
});

describe('extractInclusiveVat', () => {
  it('extracts VAT already contained in a price', () => {
    expect(extractInclusiveVat(10700, 700)).toBe(700); // ฿107 incl. 7% → ฿7
    expect(extractInclusiveVat(19500, 700)).toBe(1276); // ฿195 → 12.757
    expect(extractInclusiveVat(19500, 0)).toBe(0);
  });
});
