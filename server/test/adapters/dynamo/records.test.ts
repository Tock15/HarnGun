import { billDraftFromReceipt, type Bill } from '@harngun/shared';
import { receiptFixtures } from '@harngun/shared/fixtures';
import { describe, expect, it } from 'vitest';
import { fromRecords, metadataRecord, toRecords } from '../../../adapters/dynamo/records';

function sampleBill(): Bill {
  const draft = billDraftFromReceipt(receiptFixtures['restaurant-sc-vat-discount']!);
  const [first, second, ...rest] = draft.items;
  return {
    id: 'b-1',
    version: 3,
    status: 'ACTIVE',
    title: 'Friday dinner',
    host: { id: 'h-1', name: 'Koses', promptPayId: '0812345678', promptPayType: 'PHONE' },
    ...draft,
    items: [first!, { ...first!, id: 'unit-1', parentItemId: first!.id, sortOrder: 0.5 }, second!, ...rest],
    // Ids deliberately sort opposite to join order.
    participants: [
      { id: 'z-host', name: 'Koses', colorIndex: 0, isHost: true, isPaid: true, sortOrder: 0 },
      { id: 'a-ann', name: 'แอน', colorIndex: 1, isHost: false, isPaid: false, sortOrder: 1 },
    ],
    claims: [
      { itemId: first!.id, participantId: 'z-host' },
      { itemId: first!.id, participantId: 'a-ann' },
      { itemId: second!.id, participantId: 'a-ann' },
    ],
    receiptImageKey: 'receipts/b-1.jpg',
    createdAt: '2026-10-24T12:00:00.000Z',
    updatedAt: '2026-10-24T12:05:00.000Z',
  };
}

// What a Query returns: records sorted by SK.
const bySk = <T extends { SK: string }>(records: T[]) => [...records].sort((a, b) => (a.SK < b.SK ? -1 : 1));

describe('dynamo records', () => {
  it('round-trips a bill through SK-ordered records', () => {
    const bill = sampleBill();
    const records = toRecords(bill, null);

    const result = fromRecords(bySk(records))!;

    expect(records.every((r) => r.PK === 'BILL#b-1')).toBe(true);
    expect({ ...result, claims: [] }).toEqual({ ...bill, claims: [] });
    // Claims are a set (computeSplit orders claimants by participant), so only membership matters.
    expect(result.claims).toHaveLength(bill.claims.length);
    expect(result.claims).toEqual(expect.arrayContaining(bill.claims));
  });

  it('keeps receipt order and join order, not SK order', () => {
    const bill = fromRecords(bySk(toRecords(sampleBill(), null)))!;

    expect(bill.participants.map((p) => p.id)).toEqual(['z-host', 'a-ann']);
    expect(bill.items.map((i) => i.sortOrder)).toEqual([...bill.items.map((i) => i.sortOrder)].sort((a, b) => a - b));
  });

  it('writes expiresAt in epoch seconds only for expiring drafts', () => {
    const bill = sampleBill();

    expect(metadataRecord(bill, new Date('2026-10-25T12:00:00.000Z')).expiresAt).toBe(1792929600);
    expect(metadataRecord(bill, null)).not.toHaveProperty('expiresAt');
  });

  it('sets the host-history index keys', () => {
    const meta = metadataRecord(sampleBill(), null);

    expect(meta.GSI1PK).toBe('HOST#h-1');
    expect(meta.GSI1SK).toBe('2026-10-24T12:00:00.000Z');
  });

  it('returns null when there is no METADATA record', () => {
    const records = toRecords(sampleBill(), null).filter((r) => r.SK !== 'METADATA');

    expect(fromRecords(records)).toBeNull();
    expect(fromRecords([])).toBeNull();
  });
});
