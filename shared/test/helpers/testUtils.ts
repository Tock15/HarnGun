import type { Bill, CalcConfig, Claim, Item, Participant } from '../../src/types';

export const THAI_STANDARD: CalcConfig = {
  serviceChargeRate: 1000,
  vatRate: 700,
  vatMode: 'EXCLUSIVE',
  discountTiming: 'BEFORE_SC',
};

export const NO_CHARGES: CalcConfig = {
  serviceChargeRate: 0,
  vatRate: 0,
  vatMode: 'EXCLUSIVE',
  discountTiming: 'BEFORE_SC',
};

let nextId = 0;

export function makeItem(totalPrice: number | null, overrides: Partial<Item> = {}): Item {
  nextId += 1;
  return {
    id: `item-${nextId}`,
    name: `Item ${nextId}`,
    quantity: 1,
    unitPrice: totalPrice,
    totalPrice,
    itemDiscount: 0,
    modifiers: [],
    needsReview: totalPrice === null,
    sortOrder: nextId,
    ...overrides,
  };
}

export function makeParticipants(...names: string[]): Participant[] {
  return names.map((name, i) => ({ id: name, name, colorIndex: i % 8, isHost: i === 0, isPaid: false, sortOrder: i }));
}

export function claim(item: Item, ...participantIds: string[]): Claim[] {
  return participantIds.map((participantId) => ({ itemId: item.id, participantId }));
}

export function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    version: 1,
    status: 'DRAFT',
    title: 'Test bill',
    restaurantName: null,
    host: { id: 'host', name: 'Host', promptPayId: '0812345678', promptPayType: 'PHONE' },
    calcConfig: THAI_STANDARD,
    discounts: [],
    roundingAdjustment: 0,
    scannedGrandTotal: null,
    receiptImageKey: null,
    items: [],
    participants: [],
    claims: [],
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    ...overrides,
  };
}

/** Small seeded PRNG (mulberry32) so randomized tests are reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}
