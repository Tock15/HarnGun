import { useState, type FormEvent } from 'react';
import { api, saveSession, type Session } from '../api';

export function SessionScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [name, setName] = useState('');
  const [promptPayId, setPromptPayId] = useState('');
  const [promptPayType, setPromptPayType] = useState<'PHONE' | 'NATIONAL_ID'>('PHONE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await api<Session>('POST', '/session', { name, promptPayId, promptPayType });
      saveSession(session);
      onSignedIn(session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const phone = promptPayType === 'PHONE';
  return (
    <form className="panel" onSubmit={submit}>
      <h1>HarnGun หารกัน</h1>
      <p className="muted">You paid the bill. Friends pay you back by PromptPay.</p>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required autoComplete="given-name" />
      </label>
      <fieldset>
        <legend>PromptPay with</legend>
        <label className="inline">
          <input type="radio" name="ppType" checked={phone} onChange={() => setPromptPayType('PHONE')} /> Phone
        </label>
        <label className="inline">
          <input type="radio" name="ppType" checked={!phone} onChange={() => setPromptPayType('NATIONAL_ID')} /> National ID
        </label>
      </fieldset>
      <label>
        {phone ? 'Phone number' : 'National ID'}
        <input
          value={promptPayId}
          onChange={(e) => setPromptPayId(e.target.value)}
          inputMode="numeric"
          autoComplete={phone ? 'tel' : 'off'}
          placeholder={phone ? '081-234-5678' : '1-2345-67890-12-3'}
          required
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Starting…' : 'Start'}</button>
    </form>
  );
}
