import type { ParsedReceipt } from '@harngun/shared';
import { receiptFixtures } from '@harngun/shared/fixtures';
import type { ReceiptParser } from '../../ports';

/** MOCK_AI=true: ignores the image and returns a fixture, so grading needs no AWS credentials. */
export class MockParser implements ReceiptParser {
  private readonly receipt: ParsedReceipt;

  constructor(fixture = 'restaurant-sc-vat-discount') {
    const receipt = receiptFixtures[fixture];
    if (!receipt) throw new Error(`Unknown MOCK_FIXTURE "${fixture}". Use one of: ${Object.keys(receiptFixtures).join(', ')}`);
    this.receipt = receipt;
  }

  async parse(): Promise<ParsedReceipt> {
    return structuredClone(this.receipt);
  }
}
