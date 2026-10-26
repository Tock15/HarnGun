import { bahtToSatang } from '@harngun/shared';
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  /** Hundredths: satang for Baht, basis points for percent (both are value × 100). */
  value: number | null;
  /** Every keystroke that parses, for the live totals. */
  onLive?: (value: number | null) => void;
  /** On blur, only if the value differs from when the field was focused. A falsy result (refused save) restores the old text. */
  onCommit: (value: number | null) => Promise<unknown>;
};

const show = (value: number | null) => (value === null ? '' : String(value / 100));

/** "180", "364.87", "1,200" → integer × 100; empty → null; anything else → undefined (invalid). */
export function parseDecimal(text: string, signed = false): number | null | undefined {
  if (text.trim() === '') return null;
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) && (signed || n >= 0) ? bahtToSatang(n) : undefined;
}

/** Text box for a decimal amount stored as an integer × 100. `signed` allows negatives (rounding lines). */
export function DecimalInput({ value, onLive, onCommit, signed = false, ...rest }: Props & { signed?: boolean }) {
  const [text, setText] = useState(show(value));
  const focused = useRef(false);
  const atFocus = useRef(value);

  useEffect(() => {
    if (!focused.current) setText(show(value));
  }, [value]);

  return (
    <input
      {...rest}
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        atFocus.current = value;
        e.target.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseDecimal(e.target.value, signed);
        if (parsed !== undefined) onLive?.(parsed);
      }}
      onBlur={() => {
        focused.current = false;
        const parsed = parseDecimal(text, signed);
        if (parsed === undefined) {
          setText(show(atFocus.current));
          onLive?.(atFocus.current);
        } else if (parsed !== atFocus.current) {
          const before = atFocus.current;
          void onCommit(parsed).then((saved) => {
            if (!saved && !focused.current) setText(show(before));
          });
        }
      }}
    />
  );
}
