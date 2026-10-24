import type { Bill, Claim, Item, Participant } from '@harngun/shared';

/** METADATA fields a handler may change. Host, id, version and timestamps are managed by the repository. */
export type BillMetaChanges = Partial<
  Pick<
    Bill,
    | 'title'
    | 'restaurantName'
    | 'status'
    | 'calcConfig'
    | 'discounts'
    | 'roundingAdjustment'
    | 'scannedGrandTotal'
    | 'receiptImageKey'
  >
>;

/**
 * One atomic write to a bill. Core decides what changes (e.g. deleting an item also lists its
 * claims in deleteClaims); the repository applies it all at once and bumps `version` by 1.
 */
export interface BillChanges {
  meta?: BillMetaChanges;
  /** Removes the DRAFT expiry so the bill is kept (first item added). */
  clearExpiry?: boolean;
  putItems?: Item[];
  deleteItemIds?: string[];
  putParticipants?: Participant[];
  deleteParticipantIds?: string[];
  /** Claims are idempotent: putting an existing claim or deleting a missing one is harmless. */
  putClaims?: Claim[];
  deleteClaims?: Claim[];
}

export interface BillRepository {
  /** Stores a new bill. `expiresAt` set = DRAFT that is deleted automatically if never filled. */
  create(bill: Bill, expiresAt: Date | null): Promise<void>;
  /** The whole bill, or null if missing or an expired DRAFT. */
  get(billId: string): Promise<Bill | null>;
  /** Cheap METADATA-only read for polling. Null if the bill does not exist. */
  getVersion(billId: string): Promise<number | null>;
  /** Applies the changes atomically. Returns the new version, or null if the bill does not exist. */
  update(billId: string, changes: BillChanges): Promise<number | null>;
}
