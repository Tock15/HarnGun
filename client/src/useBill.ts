import { computeSplit, type Bill } from '@harngun/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, type BillView } from './api';

/**
 * The bill view from the server, plus `preview` for instant totals while typing: the same
 * `computeSplit` the server runs, applied locally until the edit is sent and the server answers.
 */
export function useBill(billId: string) {
  const [view, setView] = useState<BillView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('GET', `/bills/${billId}`).then(setView, (e: Error) => setError(e.message));
  }, [billId]);

  const send = useCallback(async (method: string, path: string, body?: unknown) => {
    setBusy(true);
    setError('');
    try {
      const next = await api(method, `/bills/${billId}${path}`, body);
      setView(next);
      return next;
    } catch (e) {
      setError((e as Error).message);
      // Drop the local preview: show what the server really has.
      api('GET', `/bills/${billId}`).then(setView, () => {});
      return null;
    } finally {
      setBusy(false);
    }
  }, [billId]);

  const preview = useCallback((change: (bill: Bill) => Bill) => {
    setView((v) => {
      if (!v) return v;
      const bill = change(v.bill);
      return { bill, split: computeSplit(bill) };
    });
  }, []);

  return { view, error, busy, send, preview };
}
