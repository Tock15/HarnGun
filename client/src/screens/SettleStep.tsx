import { formatBaht, generatePromptPayPayload, guardAllowsSettlement, type Bill, type Participant, type PersonShare, type SplitResult } from '@harngun/shared';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { initial, penStyle } from '../pens';
import type { BillProps } from './BillScreen';
import { GuardStamp } from './ReviewStep';

export function SettleStep({ view, send }: BillProps) {
  const { bill, split } = view;
  const [copied, setCopied] = useState(false);
  const shareOf = (p: Participant) => split.shares.find((s) => s.participantId === p.id)!;

  async function copy() {
    const text = summaryText(bill, split);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // navigator.clipboard only exists on https/localhost; a phone on http://192.168.x.x needs the old way.
      if (!copyWithTextarea(text)) {
        alert('Could not copy on this browser.');
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {!split.canSettle && (
        <div className="panel warn" role="alert">
          <GuardStamp guard={split.guard} />
          <p>
            {split.unclaimedItemIds.length > 0
              ? `${split.unclaimedItemIds.length} dish(es) still have no owner. `
              : ''}
            {guardAllowsSettlement(split.guard) ? '' : 'The items do not add up to the printed total yet. '}
            Amounts below are a preview; QR codes appear once everything is settled.
          </p>
        </div>
      )}

      {bill.participants.map((p) => (
        <PersonCard key={p.id} bill={bill} person={p} share={shareOf(p)} showQr={split.canSettle}
          onPaid={(isPaid) => send('PATCH', `/participants/${p.id}`, { isPaid })} />
      ))}

      <button className="primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy summary for LINE'}</button>
    </>
  );
}

function PersonCard({ bill, person, share, showQr, onPaid }: {
  bill: Bill; person: Participant; share: PersonShare; showQr: boolean; onPaid: (isPaid: boolean) => void;
}) {
  const vatAdded = bill.calcConfig.vatMode === 'EXCLUSIVE';
  return (
    <article className="slip card">
      <div className="sawtooth-top" />
      <div className="slip-body">
        <h2>
          <span className="badge" style={penStyle(person)}>{initial(person.name)}</span> {person.name}
          {person.isHost && ' (you paid)'}
        </h2>
        <dl className="totals">
          {share.items.map((line) => (
            <Line key={line.itemId} label={line.claimantCount > 1 ? `${line.name} ÷${line.claimantCount}` : line.name} amount={line.amount} />
          ))}
          {share.discount > 0 && <Line label="Discount" amount={-share.discount} />}
          {share.serviceCharge > 0 && <Line label="Service charge" amount={share.serviceCharge} />}
          {share.vat > 0 && <Line label={vatAdded ? 'VAT' : 'VAT (included)'} amount={share.vat} muted={!vatAdded} />}
          {share.rounding !== 0 && <Line label="Rounding" amount={share.rounding} />}
          <dt className="strong">Total</dt>
          <dd className="strong">{formatBaht(share.total)}</dd>
        </dl>
        {!person.isHost && share.total > 0 && (
          <>
            <div className="tear-dashed-line tear-label">✂ TEAR HERE ✂</div>
            {showQr && <PromptPayQr bill={bill} amount={share.total} />}
            <label className="inline paid">
              <input type="checkbox" checked={person.isPaid} onChange={(e) => onPaid(e.target.checked)} /> Paid
            </label>
          </>
        )}
      </div>
    </article>
  );
}

function Line({ label, amount, muted }: { label: string; amount: number; muted?: boolean }) {
  return (
    <>
      <dt className={muted ? 'muted' : ''}>{label}</dt>
      <dd className={muted ? 'muted' : ''}>{formatBaht(amount)}</dd>
    </>
  );
}

function PromptPayQr({ bill, amount }: { bill: Bill; amount: number }) {
  const [src, setSrc] = useState('');
  const { promptPayId, promptPayType, name } = bill.host;
  useEffect(() => {
    const payload = generatePromptPayPayload({ id: promptPayId, type: promptPayType, amount });
    QRCode.toDataURL(payload, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setSrc, () => setSrc(''));
  }, [promptPayId, promptPayType, amount]);

  return (
    <figure className="qr">
      {src && <img src={src} width={240} height={240} alt={`PromptPay QR: pay ${formatBaht(amount)} to ${name}`} />}
      <figcaption>
        <strong>{formatBaht(amount)}</strong> to {name} · PromptPay {promptPayId}
      </figcaption>
    </figure>
  );
}

function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length); // iOS ignores select() alone
  const ok = document.execCommand('copy');
  area.remove();
  return ok;
}

/** Plain text for the LINE group: who pays what, and where to send it. */
export function summaryText(bill: Bill, split: SplitResult): string {
  const lines = [`🧾 ${bill.title || 'Bill'}: ${formatBaht(split.splitTotal)}`];
  for (const p of bill.participants) {
    const share = split.shares.find((s) => s.participantId === p.id);
    if (!share || p.isHost) continue;
    lines.push('', `${p.name}: ${formatBaht(share.total)}${p.isPaid ? ' ✅' : ''}`);
    for (const item of share.items) lines.push(`  ${item.name}${item.claimantCount > 1 ? ` ÷${item.claimantCount}` : ''} ${formatBaht(item.amount)}`);
  }
  lines.push('', `PromptPay ${bill.host.promptPayId} (${bill.host.name})`);
  return lines.join('\n');
}
