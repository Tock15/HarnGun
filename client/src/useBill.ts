import { computeSplit, type Bill } from '@harngun/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type BillView } from './api';

/**
 * Every write bumps `bill.version`, so the higher version is the newer saved state, whatever
 * order two replies arrive in. Equal versions take the reply (it drops any local preview).
 */
export const newestView = (current: BillView | null, next: BillView): BillView =>
  !current || next.bill.version >= current.bill.version ? next : current;

/**
 * The bill view from the server, plus `preview` for instant totals while typing: the same
 * `computeSplit` the server runs, applied locally until the edit is sent and the server answers.
 */
export function useBill(billId: string) {
  const [view, setView] = useState<BillView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(0);

  const keepNewest = useCallback((next: BillView) => setView((v) => newestView(v, next)), []);

  useEffect(() => {
    api('GET', `/bills/${billId}`).then(keepNewest, (e: Error) => setError(e.message));
  }, [billId, keepNewest]);

  const send = useCallback(async (method: string, path: string, body?: unknown) => {
    pending.current++;
    setBusy(true);
    setError('');
    try {
      const next = await api(method, `/bills/${billId}${path}`, body);
      keepNewest(next);
      return next;
    } catch (e) {
      setError((e as Error).message);
      // Drop the local preview: show what the server really has.
      api('GET', `/bills/${billId}`).then(keepNewest, () => {});
      return null;
    } finally {
      // Two saves can run at once (blur one price box, tap the next).
      if (--pending.current === 0) setBusy(false);
    }
  }, [billId, keepNewest]);

  const preview = useCallback((change: (bill: Bill) => Bill) => {
    setView((v) => {
      if (!v) return v;
      const bill = change(v.bill);
      return { bill, split: computeSplit(bill) };
    });
  }, []);

  return { view, error, busy, send, preview };
}
