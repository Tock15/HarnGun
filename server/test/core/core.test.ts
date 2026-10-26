import { MAX_UNPACK, type BillHost } from '@harngun/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  addParticipant,
  authenticate,
  claim,
  createBill,
  createSession,
  createUploadUrl,
  deleteItem,
  deleteParticipant,
  getBill,
  parseReceipt,
  unclaim,
  unpack,
  updateBill,
  updateItem,
  updateParticipant,
  type Deps,
} from '../../core';
import { failingParser, fakeDeps, type FakeBillRepository, type FakeImageStorage } from '../helpers/fakes';

let deps: Deps;
let bills: FakeBillRepository;
let images: FakeImageStorage;
let host: BillHost;

beforeEach(async () => {
  ({ deps, bills, images } = fakeDeps());
  host = (await createSession(deps, { name: 'Koses', promptPayId: '081-234-5678', promptPayType: 'PHONE' })).host;
});

/** upload-url → photo arrives in storage → parse: the scan flow up to the Review screen. */
async function scannedBill() {
  const { bill } = await createUploadUrl(deps, host, {});
  images.images.set(bill.receiptImageKey!, new Uint8Array([0xff, 0xd8]));
  return (await parseReceipt(deps, host, bill.id)).bill;
}

const expectError = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ name: 'AppError', code });

describe('session', () => {
  it('issues a token that authenticates the same host, with the PromptPay id cleaned', async () => {
    const { token, host: issued } = await createSession(deps, { name: ' Koses ', promptPayId: '081 234 5678', promptPayType: 'PHONE' });

    expect(issued).toMatchObject({ name: 'Koses', promptPayId: '0812345678' });
    expect(await authenticate(deps, `Bearer ${token}`)).toEqual(issued);
  });

  it('refuses an invalid PromptPay id and a missing or bad token', async () => {
    await expectError(createSession(deps, { name: 'K', promptPayId: '12345', promptPayType: 'PHONE' }), 'BAD_REQUEST');
    await expectError(authenticate(deps, undefined), 'UNAUTHORIZED');
    await expectError(authenticate(deps, 'Bearer nonsense'), 'UNAUTHORIZED');
  });
});

describe('creating bills', () => {
  it('starts an expiring DRAFT with the host as the first, already-paid participant', async () => {
    const { bill, split } = await createBill(deps, host, { title: 'Lunch' });

    expect(bill).toMatchObject({ status: 'DRAFT', title: 'Lunch', version: 1, items: [], receiptImageKey: null });
    expect(bill.participants).toEqual([expect.objectContaining({ name: 'Koses', isHost: true, isPaid: true })]);
    expect(bills.bills.get(bill.id)?.expiresAt).toBeInstanceOf(Date);
    expect(split.guard.status).toBe('INCOMPLETE');
  });

  it('gives upload-url bills a receipt key and a signed upload for it', async () => {
    const { bill, upload } = await createUploadUrl(deps, host, undefined);

    expect(bill.receiptImageKey).toBe(`receipts/${bill.id}.jpg`);
    expect(upload.fields.key).toBe(bill.receiptImageKey);
  });
});

describe('parsing a receipt', () => {
  it('fills the bill from the parser with fresh item ids and keeps it past the draft expiry', async () => {
    const bill = await scannedBill();

    expect(bill.items.length).toBeGreaterThan(0);
    expect(bill.items.every((i) => /^[0-9a-f-]{36}$/.test(i.id))).toBe(true);
    expect(bill.restaurantName).not.toBeNull();
    expect(bill.title).toBe(bill.restaurantName);
    expect(bills.bills.get(bill.id)?.expiresAt).toBeNull();
  });

  it('refuses to parse twice, before the photo arrives, or without a photo', async () => {
    const bill = await scannedBill();
    await expectError(parseReceipt(deps, host, bill.id), 'CONFLICT');

    const { bill: noUpload } = await createUploadUrl(deps, host, {});
    await expectError(parseReceipt(deps, host, noUpload.id), 'CONFLICT');

    const { bill: manual } = await createBill(deps, host, {});
    await expectError(parseReceipt(deps, host, manual.id), 'CONFLICT');
  });

  it('saves the items once when two parses run at the same moment', async () => {
    const { bill } = await createUploadUrl(deps, host, {});
    images.images.set(bill.receiptImageKey!, new Uint8Array([0xff, 0xd8]));

    const results = await Promise.allSettled([parseReceipt(deps, host, bill.id), parseReceipt(deps, host, bill.id)]);
    const saved = results.find((r) => r.status === 'fulfilled')!.value.bill;

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await getBill(deps, host, bill.id)).bill.items).toHaveLength(saved.items.length);
  });

  it('reports a parser failure as PARSER_FAILED', async () => {
    ({ deps, images } = fakeDeps(failingParser));
    const { bill } = await createUploadUrl(deps, host, {});
    images.images.set(bill.receiptImageKey!, new Uint8Array([1]));

    const error = (await parseReceipt(deps, host, bill.id).catch((e: unknown) => e)) as Error;
    expect(error).toMatchObject({ code: 'PARSER_FAILED', message: expect.stringMatching(/^Could not read the receipt/) });
    // AWS details stay on the server: in the cause, never in the message.
    expect(error.message).not.toContain('model unavailable');
    expect((error.cause as Error).message).toBe('model unavailable');
  });
});

describe('access', () => {
  it('hides missing bills and refuses other hosts', async () => {
    const { bill } = await createBill(deps, host, {});
    const stranger = { ...host, id: 'someone-else' };

    await expectError(getBill(deps, host, 'missing'), 'NOT_FOUND');
    await expectError(getBill(deps, stranger, bill.id), 'FORBIDDEN');
    await expectError(updateBill(deps, stranger, bill.id, { title: 'mine now' }), 'FORBIDDEN');
  });

  it('rejects invalid bodies with the failing field', async () => {
    const { bill } = await createBill(deps, host, {});

    await expect(updateBill(deps, host, bill.id, { scannedGrandTotal: 12.5 })).rejects.toThrow(/scannedGrandTotal/);
    await expectError(addItem(deps, host, bill.id, { name: '', unitPrice: 100 }), 'BAD_REQUEST');
  });

  it('refuses amounts big enough to break the math on every later read', async () => {
    const { bill } = await createBill(deps, host, {});

    await expectError(addItem(deps, host, bill.id, { name: 'typo', quantity: 2, unitPrice: 9e15 }), 'BAD_REQUEST');
    await expectError(updateBill(deps, host, bill.id, { roundingAdjustment: -200_000 }), 'BAD_REQUEST');
    expect((await getBill(deps, host, bill.id))?.bill.items).toEqual([]);
  });
});

describe('items', () => {
  it('adds a typed-in item, which also keeps a manual draft from expiring', async () => {
    const { bill } = await createBill(deps, host, {});
    const view = await addItem(deps, host, bill.id, { name: 'ส้มตำ', quantity: 2, unitPrice: 6000 });

    expect(view.bill.items[0]).toMatchObject({ name: 'ส้มตำ', totalPrice: 12000, sortOrder: 0, needsReview: false });
    expect(bills.bills.get(bill.id)?.expiresAt).toBeNull();
  });

  it('recomputes the line total and clears needsReview when the host fixes a price', async () => {
    const { bill } = await createBill(deps, host, {});
    const item = (await addItem(deps, host, bill.id, { name: 'ข้าวผัด', unitPrice: 12000 })).bill.items[0]!;
    await updateItem(deps, host, bill.id, item.id, { needsReview: true });

    const fixed = (await updateItem(deps, host, bill.id, item.id, { unitPrice: 15000 })).bill.items[0];

    expect(fixed).toMatchObject({ unitPrice: 15000, totalPrice: 15000, needsReview: false });
  });

  it('deletes an item together with its claims', async () => {
    const bill = await scannedBill();
    const [item] = bill.items;
    const [hostPerson] = bill.participants;
    await claim(deps, host, bill.id, { itemId: item!.id, participantId: hostPerson!.id });

    const after = (await deleteItem(deps, host, bill.id, item!.id)).bill;

    expect(after.items.some((i) => i.id === item!.id)).toBe(false);
    expect(after.claims).toEqual([]);
    expect((await deleteItem(deps, host, bill.id, item!.id)).bill.items).toEqual(after.items); // double tap
  });

  it('never brings back an item deleted while an edit to it was in flight', async () => {
    const bill = await scannedBill();
    const item = bill.items[0]!;

    // Both load the same version; the delete saves first, so the edit must not write the item back.
    const [deleted, edited] = await Promise.allSettled([
      deleteItem(deps, host, bill.id, item.id),
      updateItem(deps, host, bill.id, item.id, { unitPrice: 15000 }),
    ]);

    expect(deleted.status).toBe('fulfilled');
    expect(edited).toMatchObject({ status: 'rejected', reason: { code: 'NOT_FOUND' } });
    expect((await getBill(deps, host, bill.id)).bill.items.some((i) => i.id === item.id)).toBe(false);
  });

  it('unpacks a line into unclaimed single units, clearing its claims', async () => {
    const bill = await scannedBill();
    const line = bill.items.find((i) => i.quantity >= 2)!;
    await claim(deps, host, bill.id, { itemId: line.id, participantId: bill.participants[0]!.id });

    const after = (await unpack(deps, host, bill.id, line.id)).bill;
    const units = after.items.filter((i) => i.parentItemId === line.id);

    expect(units).toHaveLength(line.quantity);
    expect(units.reduce((sum, u) => sum + u.totalPrice!, 0)).toBe(line.totalPrice);
    expect(after.claims).toEqual([]);
  });

  it('refuses to unpack a single item, or more units than one write can hold', async () => {
    const { bill } = await createBill(deps, host, {});
    const coke = (await addItem(deps, host, bill.id, { name: 'Coke', unitPrice: 3000 })).bill.items[0]!;
    const water = (await addItem(deps, host, bill.id, { name: 'Water', quantity: MAX_UNPACK + 1, unitPrice: 1000 })).bill.items[1]!;

    await expectError(unpack(deps, host, bill.id, coke.id), 'CONFLICT');
    await expectError(unpack(deps, host, bill.id, water.id), 'CONFLICT');
  });
});

describe('participants and claims', () => {
  it('adds friends in join order with their own colours, and splits a shared dish', async () => {
    const bill = await scannedBill();
    await addParticipant(deps, host, bill.id, { name: 'Ann' });
    const view = await addParticipant(deps, host, bill.id, { name: 'Bo' });
    const [koses, ann, bo] = view.bill.participants;
    const dish = view.bill.items[0]!;

    expect(view.bill.participants.map((p) => [p.name, p.colorIndex, p.sortOrder])).toEqual([
      ['Koses', 0, 0],
      ['Ann', 1, 1],
      ['Bo', 2, 2],
    ]);

    await claim(deps, host, bill.id, { itemId: dish.id, participantId: ann!.id });
    const { split } = await claim(deps, host, bill.id, { itemId: dish.id, participantId: bo!.id });
    const share = (id: string) => split.shares.find((s) => s.participantId === id)!;

    expect(share(ann!.id).items[0]).toMatchObject({ itemId: dish.id, claimantCount: 2 });
    expect(share(ann!.id).subtotal + share(bo!.id).subtotal).toBe(dish.totalPrice);
    expect(share(koses!.id).subtotal).toBe(0);
  });

  it('marks a friend paid, and removes a friend with their claims but never the host', async () => {
    const bill = await scannedBill();
    const ann = (await addParticipant(deps, host, bill.id, { name: 'Ann' })).bill.participants[1]!;
    await claim(deps, host, bill.id, { itemId: bill.items[0]!.id, participantId: ann.id });

    expect((await updateParticipant(deps, host, bill.id, ann.id, { isPaid: true })).bill.participants[1]?.isPaid).toBe(true);
    const after = (await deleteParticipant(deps, host, bill.id, ann.id)).bill;
    expect(after.participants).toHaveLength(1);
    expect(after.claims).toEqual([]);
    expect((await deleteParticipant(deps, host, bill.id, ann.id)).bill.participants).toHaveLength(1); // double tap
    await expectError(deleteParticipant(deps, host, bill.id, bill.participants[0]!.id), 'CONFLICT');
  });

  it('refuses claims for unknown items or people, and ignores a repeated unclaim', async () => {
    const bill = await scannedBill();
    const person = bill.participants[0]!.id;

    await expectError(claim(deps, host, bill.id, { itemId: 'nope', participantId: person }), 'NOT_FOUND');
    await expectError(claim(deps, host, bill.id, { itemId: bill.items[0]!.id, participantId: 'nobody' }), 'NOT_FOUND');
    expect((await unclaim(deps, host, bill.id, { itemId: bill.items[0]!.id, participantId: person })).bill.claims).toEqual([]);
  });
});
