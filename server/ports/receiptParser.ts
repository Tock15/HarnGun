import type { ParsedReceipt } from '@harngun/shared';

export interface ReceiptParser {
  /** Reads a JPEG receipt. Amounts come back in decimal Baht; core converts them to satang. */
  parse(image: Uint8Array): Promise<ParsedReceipt>;
}
