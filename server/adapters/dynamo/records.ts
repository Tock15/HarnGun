import type { Bill, BillDiscount, BillStatus, CalcConfig, Claim, Item, Participant, PromptPayIdType } from '@harngun/shared';

// Bill ↔ DynamoDB records (02-ARCHITECTURE.md §6.1). Every record of a bill shares PK = BILL#<id>.

export const billPk = (billId: string) => `BILL#${billId}`;
export const METADATA_SK = 'METADATA';
export const itemSk = (itemId: string) => `ITEM#${itemId}`;
export const participantSk = (participantId: string) => `PARTICIPANT#${participantId}`;
export const claimSk = (claim: Claim) => `CLAIM#${claim.itemId}#${claim.participantId}`;

interface Keys {
  PK: string;
  SK: string;
}

export interface MetadataRecord extends Keys {
  hostId: string;
  hostName: string;
  promptPayId: string;
  promptPayType: PromptPayIdType;
  title: string;
  restaurantName: string | null;
  status: BillStatus;
  version: number;
  calcConfig: CalcConfig;
  billDiscounts: BillDiscount[];
  roundingAdjustment: number;
  scannedGrandTotal: number | null;
  receiptImageKey: string | null;
  createdAt: string;
  updatedAt: string;
  GSI1PK: string;
  GSI1SK: string;
  /** Epoch seconds; present only on DRAFT bills that have never had an item. */
  expiresAt?: number;
}

export type ItemRecord = Keys & Omit<Item, 'id'>;
export type ParticipantRecord = Keys & Omit<Participant, 'id'>;
export interface ClaimRecord extends Keys {
  createdAt: string;
}

export type BillRecord = MetadataRecord | ItemRecord | ParticipantRecord | ClaimRecord;

export const toEpochSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

export function metadataRecord(bill: Bill, expiresAt: Date | null): MetadataRecord {
  const record: MetadataRecord = {
    PK: billPk(bill.id),
    SK: METADATA_SK,
    hostId: bill.host.id,
    hostName: bill.host.name,
    promptPayId: bill.host.promptPayId,
    promptPayType: bill.host.promptPayType,
    title: bill.title,
    restaurantName: bill.restaurantName,
    status: bill.status,
    version: bill.version,
    calcConfig: bill.calcConfig,
    billDiscounts: bill.discounts,
    roundingAdjustment: bill.roundingAdjustment,
    scannedGrandTotal: bill.scannedGrandTotal,
    receiptImageKey: bill.receiptImageKey,
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
    GSI1PK: `HOST#${bill.host.id}`,
    GSI1SK: bill.createdAt,
  };
  if (expiresAt) record.expiresAt = toEpochSeconds(expiresAt);
  return record;
}

export function itemRecord(billId: string, { id, ...item }: Item): ItemRecord {
  return { PK: billPk(billId), SK: itemSk(id), ...item };
}

export function participantRecord(billId: string, { id, ...participant }: Participant): ParticipantRecord {
  return { PK: billPk(billId), SK: participantSk(id), ...participant };
}

export function claimRecord(billId: string, claim: Claim, createdAt: string): ClaimRecord {
  return { PK: billPk(billId), SK: claimSk(claim), createdAt };
}

/** All records for a new bill, ready for one batch of Puts. */
export function toRecords(bill: Bill, expiresAt: Date | null): BillRecord[] {
  return [
    metadataRecord(bill, expiresAt),
    ...bill.items.map((item) => itemRecord(bill.id, item)),
    ...bill.participants.map((p) => participantRecord(bill.id, p)),
    ...bill.claims.map((c) => claimRecord(bill.id, c, bill.createdAt)),
  ];
}

const idAfter = (sk: string, prefix: string) => sk.slice(prefix.length);

/** Rebuilds a bill from the records of one `Query PK = BILL#<id>`. Null if there is no METADATA. */
export function fromRecords(records: readonly { SK: string }[]): Bill | null {
  let meta: MetadataRecord | undefined;
  const items: Item[] = [];
  const participants: Participant[] = [];
  const claims: Claim[] = [];

  for (const record of records) {
    const sk = record.SK;
    if (sk === METADATA_SK) {
      meta = record as unknown as MetadataRecord;
    } else if (sk.startsWith('ITEM#')) {
      const { PK: _pk, SK: _sk, ...item } = record as unknown as ItemRecord;
      items.push({ id: idAfter(sk, 'ITEM#'), ...item });
    } else if (sk.startsWith('PARTICIPANT#')) {
      const { PK: _pk, SK: _sk, ...participant } = record as unknown as ParticipantRecord;
      participants.push({ id: idAfter(sk, 'PARTICIPANT#'), ...participant });
    } else if (sk.startsWith('CLAIM#')) {
      // Ids must not contain '#': core assigns UUIDs to every item and participant (never the AI's ids).
      const [, itemId = '', participantId = ''] = sk.split('#');
      claims.push({ itemId, participantId });
    }
  }
  if (!meta) return null;

  // DynamoDB returns records in SK order; the app needs receipt order and join order.
  // Claims stay in SK order: they are a set, and computeSplit orders claimants itself.
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  participants.sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: idAfter(meta.PK, 'BILL#'),
    version: meta.version,
    status: meta.status,
    title: meta.title,
    restaurantName: meta.restaurantName,
    host: { id: meta.hostId, name: meta.hostName, promptPayId: meta.promptPayId, promptPayType: meta.promptPayType },
    calcConfig: meta.calcConfig,
    discounts: meta.billDiscounts,
    roundingAdjustment: meta.roundingAdjustment,
    scannedGrandTotal: meta.scannedGrandTotal,
    receiptImageKey: meta.receiptImageKey,
    items,
    participants,
    claims,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}
