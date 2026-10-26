import type { Bill, ParsedReceipt } from '@harngun/shared';
import { DevAuth } from '../../adapters/auth/devAuth';
import { MockParser } from '../../adapters/parser/mockParser';
import type { Deps } from '../../core';
import type { BillChanges, BillRepository, ImageStorage, ReceiptParser } from '../../ports';

/** In-memory BillRepository with the same contract as DynamoBillRepository (one atomic change, version + 1). */
export class FakeBillRepository implements BillRepository {
  readonly bills = new Map<string, { bill: Bill; expiresAt: Date | null }>();

  async create(bill: Bill, expiresAt: Date | null) {
    this.bills.set(bill.id, { bill: structuredClone(bill), expiresAt });
  }

  async get(billId: string) {
    const entry = this.live(billId);
    return entry ? structuredClone(entry.bill) : null;
  }

  async getVersion(billId: string) {
    return this.live(billId)?.bill.version ?? null;
  }

  async update(billId: string, changes: BillChanges, expectedVersion: number) {
    const entry = this.live(billId);
    if (!entry || entry.bill.version !== expectedVersion) return false;
    const { bill } = entry;
    const sameClaim = (a: { itemId: string; participantId: string }) => (b: typeof a) =>
      a.itemId === b.itemId && a.participantId === b.participantId;

    Object.assign(bill, changes.meta);
    if (changes.clearExpiry) entry.expiresAt = null;
    for (const item of changes.putItems ?? []) bill.items = [...bill.items.filter((i) => i.id !== item.id), item];
    bill.items = bill.items.filter((i) => !changes.deleteItemIds?.includes(i.id));
    for (const p of changes.putParticipants ?? []) bill.participants = [...bill.participants.filter((x) => x.id !== p.id), p];
    bill.participants = bill.participants.filter((p) => !changes.deleteParticipantIds?.includes(p.id));
    for (const c of changes.putClaims ?? []) if (!bill.claims.some(sameClaim(c))) bill.claims.push(c);
    bill.claims = bill.claims.filter((c) => !changes.deleteClaims?.some(sameClaim(c)));
    // Same ordering the Dynamo mapping restores.
    bill.items.sort((a, b) => a.sortOrder - b.sortOrder);
    bill.participants.sort((a, b) => a.sortOrder - b.sortOrder);
    bill.version += 1;
    bill.updatedAt = new Date().toISOString();
    return true;
  }

  private live(billId: string) {
    const entry = this.bills.get(billId);
    return entry && (!entry.expiresAt || entry.expiresAt > new Date()) ? entry : undefined;
  }
}

export class FakeImageStorage implements ImageStorage {
  readonly images = new Map<string, Uint8Array>();

  async createUpload(key: string) {
    return { url: 'http://storage.test/harngun-receipts', fields: { key } };
  }

  async get(key: string) {
    return this.images.get(key) ?? null;
  }
}

export function fakeDeps(parser: ReceiptParser = new MockParser()) {
  const bills = new FakeBillRepository();
  const images = new FakeImageStorage();
  const deps: Deps = { bills, images, parser, auth: new DevAuth('test-secret-at-least-16') };
  return { deps, bills, images };
}

export const failingParser: ReceiptParser = {
  parse: async (): Promise<ParsedReceipt> => {
    throw new Error('model unavailable');
  },
};
