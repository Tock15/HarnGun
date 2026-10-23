import { describe, expect, it } from 'vitest';
import { allocateProportionally, splitEvenly } from '../../src/math/allocate';
import { randomInt, seededRandom } from '../helpers/testUtils';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('splitEvenly', () => {
  it('gives leftover satang to the earliest parts', () => {
    expect(splitEvenly(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEvenly(2, 3)).toEqual([1, 1, 0]);
    expect(splitEvenly(10000, 7)).toEqual([1429, 1429, 1429, 1429, 1428, 1428, 1428]);
  });

  it('handles exact and zero splits', () => {
    expect(splitEvenly(30000, 3)).toEqual([10000, 10000, 10000]);
    expect(splitEvenly(0, 4)).toEqual([0, 0, 0, 0]);
    expect(splitEvenly(500, 1)).toEqual([500]);
  });

  it('rejects invalid counts', () => {
    expect(() => splitEvenly(100, 0)).toThrow(RangeError);
    expect(() => splitEvenly(100, 1.5)).toThrow(RangeError);
  });
});

describe('allocateProportionally', () => {
  it('splits in proportion to the weights', () => {
    expect(allocateProportionally(67089, [16000, 22000, 19000])).toEqual([18832, 25894, 22363]);
    expect(allocateProportionally(100, [1, 0, 1])).toEqual([50, 0, 50]);
  });

  it('gives leftovers to the largest remainders, then the lowest index', () => {
    // 100 × [1, 2] / 3 = [33.33, 66.67] → the second part has the larger remainder
    expect(allocateProportionally(100, [1, 2])).toEqual([33, 67]);
  });

  it('splits evenly when every weight is zero', () => {
    expect(allocateProportionally(5, [0, 0])).toEqual([3, 2]);
  });

  it('handles negative totals symmetrically', () => {
    expect(allocateProportionally(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it('rejects invalid input', () => {
    expect(() => allocateProportionally(100, [])).toThrow(RangeError);
    expect(() => allocateProportionally(100, [-1, 2])).toThrow(RangeError);
    expect(() => allocateProportionally(100, [1.5])).toThrow(RangeError);
    expect(() => allocateProportionally(1.5, [1])).toThrow(RangeError);
    expect(allocateProportionally(0, [])).toEqual([]);
  });

  it('always sums exactly to the total (randomized)', () => {
    const random = seededRandom(42);
    for (let run = 0; run < 5000; run++) {
      const total = randomInt(random, -100_000, 10_000_000);
      const weights = Array.from({ length: randomInt(random, 1, 12) }, () => randomInt(random, 0, 1_000_000));
      const parts = allocateProportionally(total, weights);
      expect(sum(parts)).toBe(total);
      expect(parts.every(Number.isSafeInteger)).toBe(true);
    }
  });
});
