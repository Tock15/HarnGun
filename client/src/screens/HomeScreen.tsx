import { useState, type ChangeEvent } from 'react';
import { api, type BillView, type Session, type UploadTarget } from '../api';
import { compressPhoto, uploadPhoto } from '../compress';
import { go } from '../route';

export function HomeScreen({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function scan(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so picking the same photo again still fires change
    if (!file) return;
    setError('');
    try {
      setStatus('Shrinking photo…');
      const photo = await compressPhoto(file);
      setStatus('Uploading…');
      const { bill, upload } = await api<BillView & { upload: UploadTarget }>('POST', '/receipts/upload-url', {});
      await uploadPhoto(upload, photo);
      setStatus('Reading receipt…');
      await api('POST', `/receipts/${bill.id}/parse`);
      go({ name: 'bill', billId: bill.id, step: 'review' });
    } catch (e) {
      setStatus('');
      setError((e as Error).message);
    }
  }

  async function startEmpty() {
    setError('');
    try {
      const { bill } = await api('POST', '/bills', {});
      go({ name: 'bill', billId: bill.id, step: 'review' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const busy = status !== '';
  return (
    <section className="panel">
      <h1>Hi {session.host.name}</h1>
      <p className="muted">PromptPay {session.host.promptPayId}</p>
      {/* The label is the button: a styled file input that opens the rear camera on phones. */}
      <label className={`button primary big${busy ? ' disabled' : ''}`}>
        {busy ? status : 'Scan receipt'}
        <input type="file" accept="image/*" capture="environment" onChange={scan} disabled={busy} hidden />
      </label>
      <button onClick={startEmpty} disabled={busy}>Type items in by hand</button>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="link" onClick={onSignOut}>Not {session.host.name}? Sign out</button>
    </section>
  );
}
