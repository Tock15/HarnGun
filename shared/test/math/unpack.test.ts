import { describe, expect, it } from 'vitest';
import { repackItems, unpackItem } from '../../src/math/unpack';
import { makeItem } from '../helpers/testUtils';

describe('unpackItem', () => {
  it('splits into single-quantity items', () => {
    const beer = makeItem(40000, { id: 'beer', name: 'Singha', quantity: 4, unitPrice: 10000, sortOrder: 3 });
    const units = unpackItem(beer, ['b1', 'b2', 'b3', 'b4']);
    expect(units).toHaveLength(4);
    expect(units.map((u) => u.totalPrice)).toEqual([10000, 10000, 10000, 10000]);
    expect(units.every((u) => u.quantity === 1 && u.parentItemId === 'beer' && u.name === 'Singha')).toBe(true);
    expect(units.map((u) => u.sortOrder)).toEqual([3, 3.25, 3.5, 3.75]);
  });

  it('splits uneven prices and item discounts exactly', () => {
    const item = makeItem(10000, { quantity: 3, itemDiscount: 100 });
    const units = unpackItem(item, ['a', 'b', 'c']);
    expect(units.map((u) => u.totalPrice)).toEqual([3334, 3333, 3333]);
    expect(units.map((u) => u.itemDiscount)).toEqual([34, 33, 33]);
  });

  it('rejects items that cannot be unpacked', () => {
    expect(() => unpackItem(makeItem(1000), ['a'])).toThrow(RangeError);
    expect(() => unpackItem(makeItem(1000, { quantity: 1.5 }), ['a'])).toThrow(RangeError);
    expect(() => unpackItem(makeItem(null, { quantity: 2 }), ['a', 'b'])).toThrow();
    expect(() => unpackItem(makeItem(1000, { quantity: 2 }), ['a'])).toThrow(RangeError);
  });
});

describe('repackItems', () => {
  it('restores the original item', () => {
    const original = makeItem(10000, { id: 'rice', quantity: 3, unitPrice: 3333, itemDiscount: 100, sortOrder: 2 });
    const repacked = repackItems(unpackItem(original, ['a', 'b', 'c']));
    expect(repacked).toMatchObject({ id: 'rice', quantity: 3, totalPrice: 10000, itemDiscount: 100, sortOrder: 2 });
    expect(repacked.parentItemId).toBeUndefined();
  });

  it('rejects units from different items', () => {
    const a = unpackItem(makeItem(2000, { id: 'x', quantity: 2 }), ['x1', 'x2']);
    const b = unpackItem(makeItem(2000, { id: 'y', quantity: 2 }), ['y1', 'y2']);
    expect(() => repackItems([a[0]!, b[0]!])).toThrow();
    expect(() => repackItems([a[0]!])).toThrow(RangeError);
  });
});
