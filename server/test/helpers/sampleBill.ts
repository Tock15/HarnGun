import { billDraftFromReceipt, type Bill } from '@harngun/shared';
import { receiptFixtures } from '@harngun/shared/fixtures';

/** A realistic ACTIVE bill: fixture items plus one unpacked unit, two participants, three claims. */
export function sampleBill(id = 'b-1'): Bill {
  const draft = billDraftFromReceipt(receiptFixtures['restaurant-sc-vat-discount']!);
  const [first, second, ...rest] = draft.items;
  return {
    id,
    version: 3,
    status: 'ACTIVE',
    title: 'Friday dinner',
    host: { id: 'h-1', name: 'Koses', promptPayId: '0812345678', promptPayType: 'PHONE' },
    ...draft,
    items: [first!, { ...first!, id: 'unit-1', parentItemId: first!.id, sortOrder: 0.5 }, second!, ...rest],
    // Ids deliberately sort opposite to join order.
    participants: [
      { id: 'z-host', name: 'Koses', colorIndex: 0, isHost: true, isPaid: true, sortOrder: 0 },
      { id: 'a-ann', name: 'แอน', colorIndex: 1, isHost: false, isPaid: false, sortOrder: 1 },
    ],
    claims: [
      { itemId: first!.id, participantId: 'z-host' },
      { itemId: first!.id, participantId: 'a-ann' },
      { itemId: second!.id, participantId: 'a-ann' },
    ],
    receiptImageKey: `receipts/${id}.jpg`,
    createdAt: '2026-10-24T12:00:00.000Z',
    updatedAt: '2026-10-24T12:05:00.000Z',
  };
}
