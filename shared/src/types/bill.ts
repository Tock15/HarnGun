import type { BasisPoints, Satang } from './money';

/** EXCLUSIVE: VAT is added on top. INCLUSIVE: VAT is already inside the prices and never added again. */
export type VatMode = 'EXCLUSIVE' | 'INCLUSIVE';

/** Whether the bill-level discount is subtracted before or after the service charge is calculated. */
export type DiscountTiming = 'BEFORE_SC' | 'AFTER_SC';

/** How this bill's totals are calculated (PRD §4.2). Pre-filled from the scan, editable by the host. */
export interface CalcConfig {
  serviceChargeRate: BasisPoints;
  vatRate: BasisPoints;
  vatMode: VatMode;
  discountTiming: DiscountTiming;
}

/** A discount applied to the whole bill and shared proportionally between participants. */
export type BillDiscount =
  | { id: string; label: string; type: 'PERCENT'; rate: BasisPoints }
  | { id: string; label: string; type: 'FLAT'; amount: Satang };

export interface Item {
  id: string;
  name: string;
  quantity: number;
  /** Null when the price was illegible on the receipt; the host must fill it in. */
  unitPrice: Satang | null;
  /** Line total as printed (usually quantity × unitPrice). Null when illegible. */
  totalPrice: Satang | null;
  /** Item-level discount, subtracted from totalPrice before the subtotal. */
  itemDiscount: Satang;
  modifiers: string[];
  needsReview: boolean;
  /** Set on single-quantity items created by unpacking; points to the original item's id. */
  parentItemId?: string;
  sortOrder: number;
}

export interface Participant {
  id: string;
  name: string;
  /** Highlighter pen index 0–7 (06-UI_DESIGN_SYSTEM.md). */
  colorIndex: number;
  isHost: boolean;
  isPaid: boolean;
}

/** A participant claiming an item. Several claims on one item split it evenly. */
export interface Claim {
  itemId: string;
  participantId: string;
}

export type BillStatus = 'DRAFT' | 'ACTIVE' | 'SETTLED';

export type PromptPayIdType = 'PHONE' | 'NATIONAL_ID';

export interface BillHost {
  id: string;
  name: string;
  promptPayId: string;
  promptPayType: PromptPayIdType;
}

export interface Bill {
  id: string;
  /** Incremented on every change; used by polling to detect updates. */
  version: number;
  status: BillStatus;
  title: string;
  restaurantName: string | null;
  host: BillHost;
  calcConfig: CalcConfig;
  discounts: BillDiscount[];
  /** Cash rounding line printed on the receipt (ปัดเศษสตางค์), positive or negative. */
  roundingAdjustment: Satang;
  /** Grand total printed on the receipt. This is the amount split at settlement. */
  scannedGrandTotal: Satang | null;
  receiptImageKey: string | null;
  items: Item[];
  participants: Participant[];
  claims: Claim[];
  createdAt: string;
  updatedAt: string;
}
