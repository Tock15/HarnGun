import type { BasisPoints, Satang } from '../types';

const BASIS_POINTS_PER_UNIT = 10_000n;

export function assertSatang(value: number, label = 'amount'): asserts value is Satang {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of satang, got ${value}`);
  }
}

/** Converts decimal Baht (as printed on a receipt) to integer satang: 364.87 → 36487. */
export function bahtToSatang(baht: number): Satang {
  if (!Number.isFinite(baht)) throw new RangeError(`Invalid Baht amount: ${baht}`);
  return Math.sign(baht) * Math.round(Math.abs(baht) * 100) + 0;
}

/** Converts a percentage to basis points: 7 → 700, 2.5 → 250. */
export function percentToBasisPoints(percent: number): BasisPoints {
  if (!Number.isFinite(percent)) throw new RangeError(`Invalid percentage: ${percent}`);
  return Math.sign(percent) * Math.round(Math.abs(percent) * 100) + 0;
}

/** Plain decimal string with no separators, e.g. for the PromptPay payload: 36487 → "364.87". */
export function satangToBahtString(satang: Satang): string {
  assertSatang(satang);
  const sign = satang < 0 ? '-' : '';
  const abs = Math.abs(satang);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Display string: 123456 → "฿1,234.56". */
export function formatBaht(satang: Satang): string {
  const [whole = '0', fraction] = satangToBahtString(Math.abs(satang)).split('.');
  return `${satang < 0 ? '-' : ''}฿${Number(whole).toLocaleString('en-US')}.${fraction}`;
}

/** Integer division rounding half away from zero (how POS systems round printed amounts). */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive');
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = (2n * abs + denominator) / (2n * denominator);
  return negative ? -quotient : quotient;
}

/** amount × rate, rounded half-up to the satang: applyRate(31000, 1000) → 3100 (10% of ฿310). */
export function applyRate(amount: Satang, rate: BasisPoints): Satang {
  assertSatang(amount);
  assertSatang(rate, 'rate');
  return Number(divideRoundHalfUp(BigInt(amount) * BigInt(rate), BASIS_POINTS_PER_UNIT)) + 0;
}

/** VAT already contained in a VAT-inclusive amount: gross × rate / (100% + rate). */
export function extractInclusiveVat(gross: Satang, rate: BasisPoints): Satang {
  assertSatang(gross);
  assertSatang(rate, 'rate');
  return Number(divideRoundHalfUp(BigInt(gross) * BigInt(rate), BASIS_POINTS_PER_UNIT + BigInt(rate))) + 0;
}
