import { randomUUID } from 'node:crypto';
import { unpackItem, type Bill, type BillHost, type Item } from '@harngun/shared';
import { parseInput, writeBill, type Deps } from './context';
import { AppError } from './errors';
import { addItemInput, updateItemInput } from './schemas';

function findItem(bill: Bill, itemId: string): Item {
  const item = bill.items.find((i) => i.id === itemId);
  if (!item) throw new AppError('NOT_FOUND', 'Item not found');
  return item;
}

/** All units are written in one transaction, which DynamoDB caps at 100 records. */
export const MAX_UNPACK = 50;

const lineTotal =(quantity: number, unitPrice: number) => Math.round(quantity * unitPrice);

export async function addItem(deps: Deps, host: BillHost, billId: string, body: unknown) {
  const input = parseInput(addItemInput, body);
  return writeBill(deps, host, billId, (bill) => ({
    putItems: [
      {
        id: randomUUID(),
        name: input.name,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        totalPrice: input.totalPrice ?? lineTotal(input.quantity, input.unitPrice),
        itemDiscount: input.itemDiscount,
        modifiers: input.modifiers,
        needsReview: false,
        sortOrder: Math.max(-1, ...bill.items.map((i) => Math.floor(i.sortOrder))) + 1,
      },
    ],
    // The first item makes the bill worth keeping; removing an absent expiry is a no-op.
    clearExpiry: true,
  }));
}

export async function updateItem(deps: Deps, host: BillHost, billId: string, itemId: string, body: unknown) {
  const input = parseInput(updateItemInput, body);
  return writeBill(deps, host, billId, (bill) => {
    const item = { ...findItem(bill, itemId), ...input };
    const priceChanged = input.quantity !== undefined || input.unitPrice !== undefined;
    // Fixing the price or quantity keeps the line total consistent unless the host typed one.
    if (priceChanged && input.totalPrice === undefined && item.unitPrice !== null) {
      item.totalPrice = lineTotal(item.quantity, item.unitPrice);
    }
    // A host who fixed an unreadable price has reviewed the line.
    if (input.needsReview === undefined && (priceChanged || input.totalPrice !== undefined) && item.totalPrice !== null) {
      item.needsReview = false;
    }
    return { putItems: [item] };
  });
}

export async function deleteItem(deps: Deps, host: BillHost, billId: string, itemId: string) {
  return writeBill(deps, host, billId, (bill) => {
    findItem(bill, itemId);
    return { deleteItemIds: [itemId], deleteClaims: bill.claims.filter((c) => c.itemId === itemId) };
  });
}

/** 4 × Singha → four unclaimed single bottles; any claims on the line are cleared (decided 2026-10-24). */
export async function unpack(deps: Deps, host: BillHost, billId: string, itemId: string) {
  return writeBill(deps, host, billId, (bill) => {
    const item = findItem(bill, itemId);
    if (!Number.isInteger(item.quantity) || item.quantity < 2 || item.quantity > MAX_UNPACK) {
      throw new AppError('CONFLICT', `Only lines with a whole quantity from 2 to ${MAX_UNPACK} can be unpacked`);
    }
    if (item.totalPrice === null) throw new AppError('CONFLICT', 'Fill in the price before unpacking');

    const units = unpackItem(item, Array.from({ length: item.quantity }, () => randomUUID()));
    return {
      deleteItemIds: [itemId],
      deleteClaims: bill.claims.filter((c) => c.itemId === itemId),
      putItems: units,
    };
  });
}
