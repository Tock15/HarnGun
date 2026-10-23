import type { Satang } from '../types';
import { assertSatang } from './money';

/**
 * Splits `total` satang across `weights` so the parts always sum exactly to `total`
 * (largest-remainder method, PRD §4.6).
 *
 * Each part starts as floor(total × weight / sum of weights). The leftover satang go one at
 * a time to the parts with the largest remainders; ties go to the lower index, so the result
 * is deterministic and identical on client and server.
 *
 * If every weight is 0, the total is split evenly instead.
 */
export function allocateProportionally(total: Satang, weights: readonly number[]): Satang[] {
  assertSatang(total, 'total');
  if (weights.length === 0) {
    if (total !== 0) throw new RangeError('Cannot allocate a non-zero total across zero weights');
    return [];
  }
  for (const weight of weights) {
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(`Weights must be non-negative integers, got ${weight}`);
    }
  }

  let bigWeights = weights.map(BigInt);
  let weightSum = bigWeights.reduce((sum, w) => sum + w, 0n);
  if (weightSum === 0n) {
    bigWeights = weights.map(() => 1n);
    weightSum = BigInt(weights.length);
  }

  const negative = total < 0;
  const absTotal = BigInt(Math.abs(total));
  const parts = bigWeights.map((w) => (absTotal * w) / weightSum);
  const remainders = bigWeights.map((w) => (absTotal * w) % weightSum);

  let leftover = absTotal - parts.reduce((sum, p) => sum + p, 0n);
  const order = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of order) {
    if (leftover === 0n) break;
    parts[index] = (parts[index] ?? 0n) + 1n;
    leftover -= 1n;
  }

  return parts.map((p) => Number(negative ? -p : p) + 0);
}

/** Splits `total` satang into `count` near-equal parts: splitEvenly(10000, 3) → [3334, 3333, 3333]. */
export function splitEvenly(total: Satang, count: number): Satang[] {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError(`Count must be a positive integer, got ${count}`);
  return allocateProportionally(total, Array.from({ length: count }, () => 1));
}
