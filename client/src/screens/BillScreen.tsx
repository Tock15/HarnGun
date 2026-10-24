import { go, type Step } from '../route';
import { useBill } from '../useBill';
import { AssignStep } from './AssignStep';
import { ReviewStep } from './ReviewStep';
import { SettleStep } from './SettleStep';

const STEPS: { step: Step; label: string }[] = [
  { step: 'review', label: '1 Check' },
  { step: 'assign', label: '2 Who ate what' },
  { step: 'settle', label: '3 Pay back' },
];

export type BillProps = ReturnType<typeof useBill> & { view: NonNullable<ReturnType<typeof useBill>['view']> };

export function BillScreen({ billId, step }: { billId: string; step: Step }) {
  const bill = useBill(billId);
  const { view, error } = bill;

  return (
    <>
      <nav className="steps">
        <button className="link" onClick={() => go({ name: 'home' })}>‹ New bill</button>
        {STEPS.map((s) => (
          <button key={s.step} className={s.step === step ? 'current' : ''} onClick={() => go({ name: 'bill', billId, step: s.step })}>
            {s.label}
          </button>
        ))}
      </nav>
      {error && <p className="error" role="alert">{error}</p>}
      {!view ? (
        !error && <p className="muted center">Loading bill…</p>
      ) : step === 'review' ? (
        <ReviewStep {...bill} view={view} />
      ) : step === 'assign' ? (
        <AssignStep {...bill} view={view} />
      ) : (
        <SettleStep {...bill} view={view} />
      )}
    </>
  );
}
