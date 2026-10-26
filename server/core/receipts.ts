import { randomUUID } from 'node:crypto';
import { billDraftFromReceipt, type BillHost, type ParsedReceipt } from '@harngun/shared';
import { createBill } from './bills';
import { loadOwnedBill, writeBill, type Deps } from './context';
import { AppError } from './errors';

const receiptKey = (billId: string) => `receipts/${billId}.jpg`;

/** Creates the DRAFT bill and signs a direct browser upload for its receipt photo (decision 1). */
export async function createUploadUrl(deps: Deps, host: BillHost, body: unknown) {
  const view = await createBill(deps, host, body, receiptKey);
  return { ...view, upload: await deps.images.createUpload(receiptKey(view.bill.id)) };
}

/** Reads the uploaded photo with the parser and fills the bill with its items and totals. */
export async function parseReceipt(deps: Deps, host: BillHost, billId: string) {
  // Checked before the slow AI call, so a refused request costs nothing.
  const bill = await loadOwnedBill(deps, host, billId);
  if (bill.items.length > 0) throw new AppError('CONFLICT', 'This bill already has items');
  if (!bill.receiptImageKey) throw new AppError('CONFLICT', 'This bill has no receipt photo');

  const image = await deps.images.get(bill.receiptImageKey);
  if (!image) throw new AppError('CONFLICT', 'Upload the receipt photo first');

  let receipt: ParsedReceipt;
  try {
    receipt = await deps.parser.parse(image);
  } catch (error) {
    // AWS errors can name the account and role, so the details stay in the server log.
    throw new AppError('PARSER_FAILED', 'Could not read the receipt. Try another photo or enter the items by hand.', error);
  }
  const draft = billDraftFromReceipt(receipt);

  return writeBill(deps, host, billId, (current) => {
    // Checked again on the fresh copy: a parse that finished meanwhile wins, and this one is refused.
    if (current.items.length > 0) throw new AppError('CONFLICT', 'This bill already has items');
    return {
      meta: {
        title: current.title || draft.restaurantName || '',
        restaurantName: draft.restaurantName,
        calcConfig: draft.calcConfig,
        discounts: draft.discounts,
        roundingAdjustment: draft.roundingAdjustment,
        scannedGrandTotal: draft.scannedGrandTotal,
      },
      // Never trust the AI's item ids as database keys: duplicates would overwrite each other.
      putItems: draft.items.map((item) => ({ ...item, id: randomUUID() })),
      clearExpiry: true,
    };
  });
}
