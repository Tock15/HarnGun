import { useEffect, useState } from 'react';
import { loadSession, saveSession } from './api';
import { useRoute } from './route';
import { BillScreen } from './screens/BillScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SessionScreen } from './screens/SessionScreen';

export function App() {
  const [session, setSession] = useState(loadSession);
  const route = useRoute();

  useEffect(() => {
    const onSignedOut = () => setSession(null);
    addEventListener('harngun:signed-out', onSignedOut);
    return () => removeEventListener('harngun:signed-out', onSignedOut);
  }, []);

  function signOut() {
    saveSession(null);
    setSession(null);
  }

  return (
    <main className="canvas">
      {!session ? (
        <SessionScreen onSignedIn={setSession} />
      ) : route.name === 'bill' ? (
        <BillScreen key={route.billId} billId={route.billId} step={route.step} />
      ) : (
        <HomeScreen session={session} onSignOut={signOut} />
      )}
    </main>
  );
}
