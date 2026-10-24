import type { BillHost } from '@harngun/shared';
import { describe, expect, it } from 'vitest';
import { DevAuth } from '../../../adapters/auth/devAuth';

const host: BillHost = { id: 'h-1', name: 'Koses', promptPayId: '0812345678', promptPayType: 'PHONE' };
const SECRET = 'test-secret-at-least-16';

describe('DevAuth', () => {
  it('verifies a token it issued', async () => {
    const auth = new DevAuth(SECRET);

    expect(await auth.verify(await auth.issue(host))).toEqual(host);
  });

  it('rejects a token whose payload was changed', async () => {
    const auth = new DevAuth(SECRET);
    const [, signature] = (await auth.issue(host)).split('.');
    const forged = Buffer.from(JSON.stringify({ host: { ...host, id: 'someone-else' }, exp: Date.now() + 1e9 })).toString('base64url');

    expect(await auth.verify(`${forged}.${signature}`)).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const token = await new DevAuth('another-secret-of-16+').issue(host);

    expect(await new DevAuth(SECRET).verify(token)).toBeNull();
  });

  it('rejects an expired token', async () => {
    let now = 0;
    const auth = new DevAuth(SECRET, () => now);
    const token = await auth.issue(host);
    now = 12 * 60 * 60 * 1000;

    expect(await auth.verify(token)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    const auth = new DevAuth(SECRET);

    for (const token of ['', 'abc', 'a.b.c', '.sig']) expect(await auth.verify(token)).toBeNull();
  });

  it('refuses a short secret', () => {
    expect(() => new DevAuth('short')).toThrow(/16 characters/);
  });
});
