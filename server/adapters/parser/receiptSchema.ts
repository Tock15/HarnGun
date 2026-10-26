import type { ParsedReceipt } from '@harngun/shared';
import { z } from 'zod';

// The extraction schema of 04-THAI_RECEIPT_PATTERNS.md §3. One definition serves twice:
// as Bedrock's tool input schema (JSON Schema) and to validate what the model sends back.

// ฿10M cap, as for typed-in amounts (core/schemas.ts): a misread huge number would make the bill unreadable.
const baht = z
  .number()
  .min(-10_000_000)
  .max(10_000_000)
  .describe('Decimal Baht exactly as printed. null if not printed or illegible; never guess.');

export const receiptSchema = z.object({
  restaurantName: z.string().nullable(),
  table: z.string().nullable(),
  date: z.string().nullable().describe('ISO date YYYY-MM-DD'),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string().describe('Dish name exactly as printed, Thai or English'),
      quantity: z.number().positive().describe('Quantity as printed on the line; do not split it'),
      unitPrice: baht.min(0).nullable(),
      totalPrice: baht.min(0).nullable(),
      modifiers: z.array(z.string()).describe('Add-ons and notes such as spice level'),
      needsReview: z.boolean().describe('true if any part of the line is unclear; always true when a price is null'),
    }),
  ),
  financials: z.object({
    subtotal: baht.nullable(),
    discounts: z.array(
      z.object({
        label: z.string(),
        type: z.enum(['percent', 'flat']),
        value: z.number().describe('Percentage for percent (10 = 10%), Baht for flat'),
        amount: baht.nullable(),
      }),
    ),
    serviceChargeRate: z.number().min(0).nullable().describe('Percentage, 10 = 10%'),
    serviceChargeAmount: baht.nullable(),
    vatRate: z.number().min(0).nullable().describe('Percentage, 7 = 7%'),
    vatAmount: baht.nullable(),
    isVatInclusive: z.boolean().nullable().describe('true if the receipt says VAT is included (รวม VAT แล้ว / VAT Included)'),
    roundingAdjustment: baht.nullable().describe('Cash rounding line (ปัดเศษ), may be negative'),
    grandTotal: baht.nullable(),
  }),
}) satisfies z.ZodType<ParsedReceipt>;

const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(receiptSchema);
/** JSON Schema for Bedrock's tool definition and Gemini's response schema. */
export const receiptJsonSchema = jsonSchema;

/** Thrown by every real parser when the model's reply can't be used. */
export class ReceiptParseError extends Error {
  override name = 'ReceiptParseError';
}

// Guardrails from 04-THAI_RECEIPT_PATTERNS.md §4, shared by every real parser.
export const RECEIPT_RULES = `- Report only what is printed. Never calculate or guess amounts.
- If a price is smudged or cut off, use null and set needsReview to true.
- Report each line with its printed quantity; do not split lines.
- Set isVatInclusive to true when the receipt says VAT is included (e.g. "รวม VAT 7% แล้ว", "VAT Included").
- Use null for any financial line that is not printed.`;
