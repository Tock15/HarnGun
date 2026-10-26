import type { Item } from '../types';
import { splitEvenly } from './allocate';

/** All units are written in one transaction, which DynamoDB caps at 100 records. */
export const MAX_UNPACK = 50;

/** Which lines the server will unpack; the client uses it to show the "Split into singles" button. */
export const canUnpack = (item: Pick<Item, 'quantity'>) =>
  Number.isInteger(item.quantity) && item.quantity >= 2 && item.quantity <= MAX_UNPACK;

/**
 * Splits an item with quantity > 1 into single-quantity items so each unit can be claimed
 * separately (PRD §4.4): 4 × Singha ฿400 → four ฿100 items. Uneven prices are split with the
 * largest-remainder method (3 for ฿100 → ฿33.34, ฿33.33, ฿33.33).
 *
 * `unitIds` supplies one new id per unit, so this function stays pure and deterministic.
 */
export function unpackItem(item: Item, unitIds: readonly string[]): Item[] {
  if (!Number.isInteger(item.quantity) || item.quantity < 2) {
    throw new RangeError(`Only items with an integer quantity of 2 or more can be unpacked (got ${item.quantity})`);
  }
  if (item.totalPrice === null) throw new Error('Cannot unpack an item without a price');
  if (unitIds.length !== item.quantity) {
    throw new RangeError(`Expected ${item.quantity} unit ids, got ${unitIds.length}`);
  }

  const prices = splitEvenly(item.totalPrice, item.quantity);
  const discounts = splitEvenly(item.itemDiscount, item.quantity);
  return unitIds.map((id, i) => {
    const price = prices[i] ?? 0;
    return {
      ...item,
      id,
      quantity: 1,
      unitPrice: price,
      totalPrice: price,
      itemDiscount: discounts[i] ?? 0,
      modifiers: [...item.modifiers],
      parentItemId: item.id,
      sortOrder: item.sortOrder + i / item.quantity,
    };
  });
}

