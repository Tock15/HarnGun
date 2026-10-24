import { useEffect, useState } from 'react';

export type Step = 'review' | 'assign' | 'settle';
export type Route = { name: 'home' } | { name: 'bill'; billId: string; step: Step };

const STEPS: readonly string[] = ['review', 'assign', 'settle'];

/** `#/bill/<id>/<step>`: the bill id lives in the URL so a reload or a dropped tab reopens the same bill. */
export function parseRoute(hash: string): Route {
  const [, kind, billId, step = ''] = hash.replace(/^#/, '').split('/');
  if (kind === 'bill' && billId) return { name: 'bill', billId, step: STEPS.includes(step) ? (step as Step) : 'review' };
  return { name: 'home' };
}

export const go = (route: Route) => {
  location.hash = route.name === 'home' ? '/' : `/bill/${route.billId}/${route.step}`;
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
