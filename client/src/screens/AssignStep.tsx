import { formatBaht, itemNetPrice } from '@harngun/shared';
import { useState, type FormEvent } from 'react';
import { initial, penStyle } from '../pens';
import { go } from '../route';
import type { BillProps } from './BillScreen';

/** Mode A: the host picks a friend's pen, then taps the dishes that friend ate. */
export function AssignStep({ view, send, busy }: BillProps) {
  const { bill, split } = view;
  const [penId, setPenId] = useState(bill.participants[0]?.id ?? '');
  const [newName, setNewName] = useState('');
  // Falls back to the host when the active friend was just removed.
  const pen = bill.participants.find((p) => p.id === penId) ?? bill.participants[0];

  async function addFriend(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    const next = await send('POST', '/participants', { name: newName });
    if (next) {
      setNewName('');
      setPenId(next.bill.participants.at(-1)?.id ?? ''); // the newcomer gets the pen
    }
  }

  const toggle = (itemId: string) => {
    if (!pen) return;
    const claimed = bill.claims.some((c) => c.itemId === itemId && c.participantId === pen.id);
    send(claimed ? 'DELETE' : 'PUT', `/claims/${itemId}/${pen.id}`);
  };

  return (
    <>
      <div className="pens" role="radiogroup" aria-label="Whose dishes are you marking?">
        {bill.participants.map((p) => (
          <button key={p.id} role="radio" aria-checked={p.id === pen?.id} className={`pen${p.id === pen?.id ? ' active' : ''}`} style={penStyle(p)} onClick={() => setPenId(p.id)}>
            <span className="badge">{initial(p.name)}</span> {p.name}
            {p.isHost && ' (you)'}
          </button>
        ))}
      </div>
      <form className="add-friend" onSubmit={addFriend}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add friend" maxLength={50} aria-label="Friend's name" />
        <button disabled={busy}>Add</button>
      </form>
      {pen && !pen.isHost && (
        <button className="link danger" disabled={busy} onClick={() => send('DELETE', `/participants/${pen.id}`)}>
          Remove {pen.name}
        </button>
      )}

      <div className="slip">
        <div className="sawtooth-top" />
        <div className="slip-body">
          <p className="muted">Tap the dishes {pen?.name ?? '…'} had. Tap again to undo.</p>
          <ul className="items claimable">
            {bill.items.map((item) => {
              const claimants = bill.participants.filter((p) => bill.claims.some((c) => c.itemId === item.id && c.participantId === p.id));
              const style = claimants.length > 1 ? penStyle('shared') : claimants[0] ? penStyle(claimants[0]) : undefined;
              const mine = claimants.some((p) => p.id === pen?.id);
              return (
                <li key={item.id}>
                  <button className="claim-row" style={style} aria-pressed={mine} disabled={busy} onClick={() => toggle(item.id)}>
                    <span className="item-name">
                      {item.quantity !== 1 && `${item.quantity} × `}
                      {item.name}
                    </span>
                    <span className="line-total">{formatBaht(itemNetPrice(item) ?? 0)}</span>
                    <span className="badges">
                      {claimants.map((p) => (
                        <span key={p.id} className="badge" style={penStyle(p)} title={p.name}>{initial(p.name)}</span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className={split.unclaimedItemIds.length ? 'warn' : 'muted'}>
            {split.unclaimedItemIds.length ? `${split.unclaimedItemIds.length} dish(es) nobody has claimed yet` : 'Every dish has an owner.'}
          </p>
          <button className="primary" onClick={() => go({ name: 'bill', billId: bill.id, step: 'settle' })}>
            Next: pay back ›
          </button>
        </div>
      </div>
    </>
  );
}
