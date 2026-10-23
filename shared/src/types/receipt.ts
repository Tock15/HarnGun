/**
 * Raw AI extraction result (04-THAI_RECEIPT_PATTERNS.md §3).
 * Amounts are decimal Baht exactly as printed; convert to satang right after parsing.
 * Any value not printed or not legible on the receipt is null.
 */
export interface ParsedReceipt {
  restaurantName: string | null;
  table: string | null;
  /** ISO date (YYYY-MM-DD). */
  date: string | null;
  items: ParsedReceiptItem[];
  financials: ParsedFinancials;
}

export interface ParsedReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  modifiers: string[];
  needsReview: boolean;
}

export interface ParsedDiscount {
  label: string;
  type: 'percent' | 'flat';
  /** Percentage for 'percent' (10 = 10%), Baht value for 'flat'. */
  value: number;
  /** Baht amount actually printed on the receipt. */
  amount: number | null;
}

export interface ParsedFinancials {
  subtotal: number | null;
  discounts: ParsedDiscount[];
  /** Percentage (10 = 10%). */
  serviceChargeRate: number | null;
  serviceChargeAmount: number | null;
  /** Percentage (7 = 7%). */
  vatRate: number | null;
  vatAmount: number | null;
  isVatInclusive: boolean | null;
  roundingAdjustment: number | null;
  grandTotal: number | null;
}
