import { TransactionCanceledException, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { Bill } from '@harngun/shared';
import type { BillChanges, BillRepository } from '../../ports';
import { TTL_ATTRIBUTE } from '../../db/table-def';
import {
  type BillRecord,
  billPk,
  claimRecord,
  claimSk,
  itemRecord,
  itemSk,
  METADATA_SK,
  participantRecord,
  participantSk,
  toEpochSeconds,
  toRecords,
  fromRecords,
} from './records';

type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

const MAX_ATTEMPTS = 4;

/** Domain field → METADATA attribute, where the names differ. */
const META_ATTRIBUTE: Record<string, string> = { discounts: 'billDiscounts' };

export class DynamoBillRepository implements BillRepository {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    client: DynamoDBClient,
    private readonly tableName: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    // Optional fields such as parentItemId are simply left off the record.
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  async create(bill: Bill, expiresAt: Date | null): Promise<void> {
    const [meta, ...rest] = toRecords(bill, expiresAt);
    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.tableName, Item: meta, ConditionExpression: 'attribute_not_exists(PK)' } },
          ...rest.map((Item) => ({ Put: { TableName: this.tableName, Item } })),
        ],
      }),
    );
  }

  async get(billId: string): Promise<Bill | null> {
    const records: Record<string, unknown>[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': billPk(billId) },
          ExclusiveStartKey: startKey,
          // Handlers re-read right after writing, so the read must see that write.
          ConsistentRead: true,
        }),
      );
      records.push(...(page.Items ?? []));
      startKey = page.LastEvaluatedKey;
    } while (startKey);

    const meta = records.find((r) => r.SK === METADATA_SK);
    if (!meta || this.isExpired(meta)) return null;
    return fromRecords(records as { SK: string }[]);
  }

  async getVersion(billId: string): Promise<number | null> {
    const { Item } = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: billPk(billId), SK: METADATA_SK },
        ProjectionExpression: '#version, #expiresAt',
        ExpressionAttributeNames: { '#version': 'version', '#expiresAt': TTL_ATTRIBUTE },
        ConsistentRead: true,
      }),
    );
    if (!Item || this.isExpired(Item)) return null;
    return Item.version as number;
  }

  async update(billId: string, changes: BillChanges): Promise<boolean> {
    const pk = billPk(billId);
    const now = this.now();
    const createdAt = now.toISOString();
    const put = (Item: BillRecord): TransactItem => ({ Put: { TableName: this.tableName, Item } });
    const del = (SK: string): TransactItem => ({ Delete: { TableName: this.tableName, Key: { PK: pk, SK } } });

    return this.transact([
      this.metadataUpdate(pk, changes, now),
      ...(changes.putItems ?? []).map((item) => put(itemRecord(billId, item))),
      ...(changes.deleteItemIds ?? []).map((id) => del(itemSk(id))),
      ...(changes.putParticipants ?? []).map((p) => put(participantRecord(billId, p))),
      ...(changes.deleteParticipantIds ?? []).map((id) => del(participantSk(id))),
      ...(changes.putClaims ?? []).map((c) => put(claimRecord(billId, c, createdAt))),
      ...(changes.deleteClaims ?? []).map((c) => del(claimSk(c))),
    ]);
  }

  /** Bumps version and updatedAt, sets changed fields; fails the whole transaction if the bill is gone. */
  private metadataUpdate(pk: string, changes: BillChanges, now: Date): TransactItem {
    const names: Record<string, string> = { '#version': 'version', '#updatedAt': 'updatedAt', '#expiresAt': TTL_ATTRIBUTE, '#pk': 'PK' };
    const values: Record<string, unknown> = { ':one': 1, ':now': now.toISOString(), ':nowSeconds': toEpochSeconds(now) };
    const sets = ['#updatedAt = :now'];

    for (const [field, value] of Object.entries(changes.meta ?? {})) {
      if (value === undefined) continue;
      const attribute = META_ATTRIBUTE[field] ?? field;
      names[`#${attribute}`] = attribute;
      values[`:${attribute}`] = value;
      sets.push(`#${attribute} = :${attribute}`);
    }

    return {
      Update: {
        TableName: this.tableName,
        Key: { PK: pk, SK: METADATA_SK },
        UpdateExpression: `SET ${sets.join(', ')} ADD #version :one${changes.clearExpiry ? ' REMOVE #expiresAt' : ''}`,
        // An expired DRAFT may linger until TTL deletes it; treat it as gone.
        ConditionExpression: 'attribute_exists(#pk) AND (attribute_not_exists(#expiresAt) OR #expiresAt > :nowSeconds)',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    };
  }

  private async transact(items: TransactItem[]): Promise<boolean> {
    for (let attempt = 1; ; attempt++) {
      try {
        // shortcut: one transaction holds 100 records, so create() and a parse need < 99 items + participants; real receipts are far smaller.
        await this.doc.send(new TransactWriteCommand({ TransactItems: items }));
        return true;
      } catch (error) {
        if (!(error instanceof TransactionCanceledException)) throw error;
        const reasons = error.CancellationReasons ?? [];
        // The METADATA update is always first, so reason 0 is the "bill exists" check.
        if (reasons[0]?.Code === 'ConditionalCheckFailed') return false;
        // Every write bumps METADATA, so two writes to one bill at once cancel each other.
        // Retrying is safe: all changes are idempotent.
        if (attempt >= MAX_ATTEMPTS || !reasons.some((r) => r.Code === 'TransactionConflict')) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40 * attempt));
      }
    }
  }

  private isExpired(meta: Record<string, unknown>) {
    const expiresAt = meta[TTL_ATTRIBUTE];
    return typeof expiresAt === 'number' && expiresAt <= toEpochSeconds(this.now());
  }
}
