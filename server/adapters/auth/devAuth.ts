import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BillHost } from '@harngun/shared';
import type { AuthProvider } from '../../ports';

const SESSION_MS = 12 * 60 * 60 * 1000;

/**
 * Phase 1 sessions without accounts: `<payload>.<signature>`, both base64url, signed with
 * HMAC-SHA256. Local only (02-ARCHITECTURE.md §7); Phase 2 replaces it with Cognito.
 */
export class DevAuth implements AuthProvider {
  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {
    if (secret.length < 16) throw new Error('DEV_AUTH_SECRET must be at least 16 characters');
  }

  async issue(host: BillHost): Promise<string> {
    const payload = Buffer.from(JSON.stringify({ host, exp: this.now() + SESSION_MS })).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  async verify(token: string): Promise<BillHost | null> {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;

    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    // Constant-time comparison, so response timing reveals nothing about the right signature.
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    const { host, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { host: BillHost; exp: number };
    return exp > this.now() ? host : null;
  }

  private sign(payload: string) {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
