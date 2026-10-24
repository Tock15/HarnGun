import { canUnpack, formatBaht, type Bill, type GuardResult, type Item } from '@harngun/shared';
import { useState, type FormEvent } from 'react';
import { DecimalInput, parseDecimal } from '../DecimalInput';
import { go } from '../route';
import type { BillProps } from './BillScreen';

/** Same line-total rule as the server's updateItem, for the live preview. */
const lineTotal = (quantity: number, unitPrice: number) => Math.round(quantity * unitPrice);
export function ReviewStep({ view, send, preview, busy }: BillProps) {
  const { bill, split } = view;
  const { totals } = split;
  const editItem = (id: string, change: Partial<Item>) =>
    preview((b) => ({ ...b, items: b.items.map((i) => (i.id === id ? { ...i, ...change } : i)) }));
  const editBill = (change: Partial<Bill>) => preview((b) => ({ ...b, ...change }));
  const config = bill.calcConfig;
  const setConfig = (change: Partial<Bill['calcConfig']>) => send('PATCH', '', { calcConfig: { ...config, ...change } });

  return (
    <div className="slip">
      <div className="sawtooth-top" />
      <div className="slip-body">
        <input
          className="title"
          defaultValue={bill.title}
          placeholder="Restaurant"
          maxLength={100}
          onBlur={async (e) => {
            const box = e.target;
            const title = (box.value = box.value.trim()); // the server trims too; show what it saves
            if (title !== bill.title && !(await send('PATCH', '', { title }))) box.value = bill.title;
          }}
        />
        {bill.items.length === 0 && <p className="muted">No items yet. Add them below.</p>}

        <ul className="items">
          {bill.items.map((item) => (
            <li key={item.id} className={item.needsReview ? 'needs-review' : ''}>
              <input
                className="item-name"
                defaultValue={item.name}
                maxLength={100}
                aria-label="Dish name"
                onBlur={async (e) => {
                  const box = e.target;
                  const name = (box.value = box.value.trim()); // the server trims too; show what it saves
                  if (name === item.name) return;
                  // A refused edit shows the saved name again, not what was typed.
                  if (!name || !(await send('PATCH', `/items/${item.id}`, { name }))) box.value = item.name;
                }}
              />
              <div className="item-numbers">
                <input
                  className="qty"
                  type="number"
                  min={1}
                  max={1000}
                  defaultValue={item.quantity}
                  aria-label="Quantity"
                  onBlur={async (e) => {
                    const box = e.target;
                    const quantity = Number(box.value);
                    if (quantity === item.quantity) return;
                    if (!(quantity > 0) || !(await send('PATCH', `/items/${item.id}`, { quantity }))) box.value = String(item.quantity);
                  }}
                />
                <span>×</span>
                <DecimalInput
                  className="money"
                  value={item.unitPrice}
                  aria-label="Unit price"
                  placeholder="price?"
                  onLive={(unitPrice) => editItem(item.id, { unitPrice, totalPrice: unitPrice === null ? null : lineTotal(item.quantity, unitPrice) })}
                  onCommit={(unitPrice) => send('PATCH', `/items/${item.id}`, { unitPrice })}
                />
                <span className="line-total">{item.totalPrice === null ? '—' : formatBaht(item.totalPrice)}</span>
              </div>
              {item.modifiers.length > 0 && <div className="modifiers">{item.modifiers.join(' · ')}</div>}
              {item.itemDiscount > 0 && <div className="modifiers">discount −{formatBaht(item.itemDiscount)}</div>}
              <div className="item-actions">
                {canUnpack(item) && (
                  <button className="link" disabled={busy} onClick={() => send('POST', `/items/${item.id}/unpack`)}>
                    Split into {item.quantity} singles
                  </button>
                )}
                <button className="link danger" disabled={busy} onClick={() => send('DELETE', `/items/${item.id}`)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <AddItem onAdd={(body) => send('POST', '/items', body)} disabled={busy} />

        <div className="tear-dashed-line" />
        <div className="config">
          <label>
            Service charge %
            <DecimalInput value={config.serviceChargeRate} onCommit={(v) => setConfig({ serviceChargeRate: v ?? 0 })} />
          </label>
          <label>
            VAT %
            <DecimalInput value={config.vatRate} onCommit={(v) => setConfig({ vatRate: v ?? 0 })} />
          </label>
          <label>
            VAT is
            <select value={config.vatMode} onChange={(e) => setConfig({ vatMode: e.target.value as Bill['calcConfig']['vatMode'] })}>
              <option value="EXCLUSIVE">added on top</option>
              <option value="INCLUSIVE">already in prices</option>
            </select>
          </label>
          {bill.discounts.length > 0 && (
            <label>
              Discount taken
              <select value={config.discountTiming} onChange={(e) => setConfig({ discountTiming: e.target.value as Bill['calcConfig']['discountTiming'] })}>
                <option value="BEFORE_SC">before service charge</option>
                <option value="AFTER_SC">after service charge</option>
              </select>
            </label>
          )}
        </div>

        <div className="tear-dashed-line" />
        <dl className="totals">
          <Row label="Subtotal" amount={totals.subtotal} />
          {bill.discounts.map((d) => (
            <Row key={d.id} label={d.label || 'Discount'} text={d.type === 'PERCENT' ? `−${d.rate / 100}%` : `−${formatBaht(d.amount)}`} />
          ))}
          {totals.discount > 0 && <Row label="Discount total" amount={-totals.discount} />}
          {totals.serviceCharge > 0 && <Row label={`Service charge ${config.serviceChargeRate / 100}%`} amount={totals.serviceCharge} />}
          {totals.vat > 0 && <Row label={`VAT ${config.vatRate / 100}%${config.vatMode === 'INCLUSIVE' ? ' (included)' : ''}`} amount={totals.vat} />}
          <dt>Rounding</dt>
          <dd>
            <DecimalInput
              className="money"
              signed
              value={bill.roundingAdjustment}
              onLive={(v) => editBill({ roundingAdjustment: v ?? 0 })}
              onCommit={(v) => send('PATCH', '', { roundingAdjustment: v ?? 0 })}
            />
          </dd>
          <Row label="Computed total" amount={totals.grandTotal} strong />
          <dt>Printed on receipt</dt>
          <dd>
            <DecimalInput
              className="money"
              value={bill.scannedGrandTotal}
              placeholder="total?"
              onLive={(v) => editBill({ scannedGrandTotal: v })}
              onCommit={(v) => send('PATCH', '', { scannedGrandTotal: v })}
            />
          </dd>
        </dl>
        <GuardStamp guard={split.guard} />

        <button className="primary" onClick={() => go({ name: 'bill', billId: bill.id, step: 'assign' })}>
          Next: who ate what ›
        </button>
      </div>
    </div>
  );
}

function Row({ label, amount, text, strong }: { label: string; amount?: number; text?: string; strong?: boolean }) {
  return (
    <>
      <dt className={strong ? 'strong' : ''}>{label}</dt>
      <dd className={strong ? 'strong' : ''}>{text ?? formatBaht(amount ?? 0)}</dd>
    </>
  );
}

/** Math Guard (ADR-007): the line items must add up to the printed total before anyone pays. */
export function GuardStamp({ guard }: { guard: GuardResult }) {
  const text = {
    MATCH: '✓ MATCHES RECEIPT',
    ROUNDING: '✓ MATCHES RECEIPT (±0.01)',
    MISMATCH: `✗ OFF BY ${formatBaht(Math.abs(guard.difference ?? 0))}`,
    INCOMPLETE: guard.scannedTotal === null ? '? ENTER PRINTED TOTAL' : '? A PRICE IS MISSING',
    NO_RECEIPT: '✓ TYPED BY HAND',
  }[guard.status];
  return <p className={`receipt-stamp guard-${guard.status.toLowerCase()}`} role="status">{text}</p>;
}

function AddItem({ onAdd, disabled }: { onAdd: (body: object) => Promise<unknown>; disabled: boolean }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const unitPrice = parseDecimal(price);
    if (!name.trim() || unitPrice == null || !(Number(quantity) > 0)) return;
    if (await onAdd({ name, quantity: Number(quantity), unitPrice })) {
      setName('');
      setQuantity('1');
      setPrice('');
    }
  }

  return (
    <form className="add-item" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add dish" maxLength={100} aria-label="New dish name" />
      <input className="qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="New dish quantity" />
      <input className="money" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="price" aria-label="New dish unit price" />
      <button disabled={disabled}>Add</button>
    </form>
  );
}
