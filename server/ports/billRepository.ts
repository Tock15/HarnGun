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
  /**
   * Applies the changes atomically, only if the bill is still at `expectedVersion`. False if it
   * does not exist (or is an expired DRAFT) or another write changed it since.
   * One change may not touch the same record twice (e.g. put and delete the same item).
   */
  update(billId: string, changes: BillChanges, expectedVersion: number): Promise<boolean>;
}
