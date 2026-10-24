import { randomUUID } from 'node:crypto';
import type { Bill, BillHost, Participant } from '@harngun/shared';
import { parseInput, writeBill, type Deps } from './context';
import { AppError } from './errors';
import { addParticipantInput, updateParticipantInput } from './schemas';

/** Highlighter pens 0–7 (06-UI_DESIGN_SYSTEM.md). */
const COLOR_COUNT = 8;

function findParticipant(bill: Bill, participantId: string): Participant {
  const participant = bill.participants.find((p) => p.id === participantId);
  if (!participant) throw new AppError('NOT_FOUND', 'Person not found');
  return participant;
}

export async function addParticipant(deps: Deps, host: BillHost, billId: string, body: unknown) {
  const { name } = parseInput(addParticipantInput, body);
  return writeBill(deps, host, billId, (bill) => {
    const last = Math.max(-1, ...bill.participants.map((p) => p.sortOrder));
    return {
      putParticipants: [
        { id: randomUUID(), name, colorIndex: (last + 1) % COLOR_COUNT, isHost: false, isPaid: false, sortOrder: last + 1 },
      ],
    };
  });
}

export async function updateParticipant(deps: Deps, host: BillHost, billId: string, participantId: string, body: unknown) {
  const input = parseInput(updateParticipantInput, body);
  return writeBill(deps, host, billId, (bill) => ({
    putParticipants: [{ ...findParticipant(bill, participantId), ...input }],
  }));
}

/** Removing someone who is already gone is harmless, so a double tap never errors. */
export async function deleteParticipant(deps: Deps, host: BillHost, billId: string, participantId: string) {
  return writeBill(deps, host, billId, (bill) => {
    if (bill.participants.find((p) => p.id === participantId)?.isHost) throw new AppError('CONFLICT', 'The host cannot be removed');
    return {
      deleteParticipantIds: [participantId],
      deleteClaims: bill.claims.filter((c) => c.participantId === participantId),
    };
  });
}
