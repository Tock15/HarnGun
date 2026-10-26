import { randomUUID } from 'node:crypto';
import { GetItemCommand, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import type { Bill } from '@harngun/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { DynamoBillRepository } from '../../../adapters/dynamo/dynamoBillRepository';
import { createDynamoClient } from '../../../config';
import { integrationSetup } from '../../helpers/integration';
import { sampleBill } from '../../helpers/sampleBill';

let repo: DynamoBillRepository;
let rawMetadata: (billId: string) => Promise<Record<string, unknown> | undefined>;

beforeAll(async () => {
  const { config, dynamo } = await integrationSetup();
  repo = new DynamoBillRepository(dynamo, config.tableName);
  rawMetadata = async (billId) =>
    (await dynamo.send(new GetItemCommand({ TableName: config.tableName, Key: { PK: { S: `BILL#${billId}` }, SK: { S: 'METADATA' } } }))).Item;
});

async function createSample(expiresAt: Date | null = null): Promise<Bill> {
  const bill = sampleBill(randomUUID());
  await repo.create(bill, expiresAt);
  return bill;
}

const hourFromNow = () => new Date(Date.now() + 3_600_000);
const sortClaims = (bill: Bill | null) =>
  [...(bill?.claims ?? [])].sort((a, b) => `${a.itemId}${a.participantId}`.localeCompare(`${b.itemId}${b.participantId}`));

describe('DynamoBillRepository', () => {
  it('stores a bill and loads it back unchanged', async () => {
    const bill = await createSample();
    const loaded = await repo.get(bill.id);

    expect({ ...loaded, claims: sortClaims(loaded) }).toEqual({ ...bill, claims: sortClaims(bill) });
    expect(await repo.getVersion(bill.id)).toBe(bill.version);
  });

  it('applies meta, item and participant changes in one write and bumps version by 1', async () => {
    const bill = await createSample();
    const [first] = bill.items;
    const found = await repo.update(bill.id, {
      meta: { title: 'Renamed', discounts: [], calcConfig: { ...bill.calcConfig, serviceChargeRate: 0 } },
      putItems: [{ ...first!, name: 'ต้มยำกุ้งน้ำใส', unitPrice: 30000 }],
      putParticipants: [{ id: 'c-bo', name: 'Bo', colorIndex: 2, isHost: false, isPaid: false, sortOrder: 2 }],
    }, bill.version);
    const loaded = await repo.get(bill.id);

    expect(found).toBe(true);
    expect(loaded?.version).toBe(bill.version + 1);
    expect(loaded?.title).toBe('Renamed');
    expect(loaded?.discounts).toEqual([]);
    expect(loaded?.calcConfig.serviceChargeRate).toBe(0);
    expect(loaded?.items[0]).toMatchObject({ name: 'ต้มยำกุ้งน้ำใส', unitPrice: 30000 });
    expect(loaded?.participants.map((p) => p.name)).toEqual(['Koses', 'แอน', 'Bo']);
    expect(loaded?.updatedAt).not.toBe(bill.updatedAt);
  });

  it('deletes an item together with its claims', async () => {
    const bill = await createSample();
    const itemId = bill.items[0]!.id;
    const itemClaims = bill.claims.filter((c) => c.itemId === itemId);

    await repo.update(bill.id, { deleteItemIds: [itemId], deleteClaims: itemClaims }, bill.version);
    const loaded = await repo.get(bill.id);

    expect(loaded?.items.some((i) => i.id === itemId)).toBe(false);
    expect(loaded?.claims).toHaveLength(bill.claims.length - itemClaims.length);
  });

  it('treats repeated claims and missing unclaims as harmless', async () => {
    const bill = await createSample();
    const existing = bill.claims[0]!;

    expect(await repo.update(bill.id, { putClaims: [existing] }, bill.version)).toBe(true);
    expect(await repo.update(bill.id, { deleteClaims: [{ itemId: 'nope', participantId: 'nobody' }] }, bill.version + 1)).toBe(true);
    expect((await repo.get(bill.id))?.claims).toHaveLength(bill.claims.length);
  });

  it('lets only one of many writes based on the same version land', async () => {
    const bill = await createSample();
    const itemId = bill.items[0]!.id;
    const claims = Array.from({ length: 10 }, (_, i) => ({ itemId, participantId: `p-${i}` }));

    const results = await Promise.all(claims.map((claim) => repo.update(bill.id, { putClaims: [claim] }, bill.version)));
    const loaded = await repo.get(bill.id);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(loaded?.claims).toContainEqual(claims[results.indexOf(true)]);
    expect(loaded?.claims.filter((c) => c.participantId.startsWith('p-'))).toHaveLength(1);
    expect(loaded?.version).toBe(bill.version + 1);
  });

  it('refuses a write based on an old version and changes nothing', async () => {
    const bill = await createSample();
    await repo.update(bill.id, { meta: { title: 'First' } }, bill.version);

    expect(await repo.update(bill.id, { meta: { title: 'Stale' } }, bill.version)).toBe(false);
    expect(await repo.get(bill.id)).toMatchObject({ title: 'First', version: bill.version + 1 });
  });

  it('retries a write that DynamoDB cancelled for a conflict', async () => {
    // DynamoDB Local never produces TransactionConflict, so inject one the way real DynamoDB reports it.
    const { config } = await integrationSetup();
    const client = createDynamoClient(config);
    let conflicts = 1;
    client.middlewareStack.add(
      (next, context) => async (args) => {
        if (context.commandName === 'TransactWriteItemsCommand' && conflicts-- > 0) {
          throw new TransactionCanceledException({
            message: 'Transaction cancelled',
            $metadata: {},
            CancellationReasons: [{ Code: 'TransactionConflict' }, { Code: 'None' }],
          });
        }
        return next(args);
      },
      { step: 'initialize' },
    );
    const conflictingRepo = new DynamoBillRepository(client, config.tableName);
    const bill = await createSample();

    expect(await conflictingRepo.update(bill.id, { putClaims: [{ itemId: bill.items[0]!.id, participantId: 'p-x' }] }, bill.version)).toBe(true);
    expect(conflicts).toBe(-1);
    expect(await repo.getVersion(bill.id)).toBe(bill.version + 1);
  });

  it('reports a missing bill without creating anything', async () => {
    const id = randomUUID();

    expect(await repo.get(id)).toBeNull();
    expect(await repo.getVersion(id)).toBeNull();
    expect(await repo.update(id, { meta: { title: 'x' } }, 1)).toBe(false);
    expect(await rawMetadata(id)).toBeUndefined();
  });

  it('hides an expired draft even before TTL deletes it', async () => {
    const bill = await createSample(new Date(Date.now() - 1000));

    expect(await rawMetadata(bill.id)).toBeDefined();
    expect(await repo.get(bill.id)).toBeNull();
    expect(await repo.getVersion(bill.id)).toBeNull();
    expect(await repo.update(bill.id, { clearExpiry: true }, bill.version)).toBe(false);
  });

  it('keeps a draft once its expiry is cleared', async () => {
    const bill = await createSample(hourFromNow());
    expect((await rawMetadata(bill.id))?.expiresAt).toBeDefined();

    await repo.update(bill.id, { clearExpiry: true }, bill.version);

    expect((await rawMetadata(bill.id))?.expiresAt).toBeUndefined();
  });
});
