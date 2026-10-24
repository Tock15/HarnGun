import { describe, expect, it } from 'vitest';
import { fromRecords, metadataRecord, toRecords } from '../../../adapters/dynamo/records';
import { sampleBill } from '../../helpers/sampleBill';

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
