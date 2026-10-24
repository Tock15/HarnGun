import type { BillHost } from '@harngun/shared';

export interface AuthProvider {
  /** Issues a session token for the host (Phase 1: DevAuth, no accounts). */
  issue(host: BillHost): Promise<string>;
  /** The host the token belongs to, or null if it is invalid or expired. */
  verify(token: string): Promise<BillHost | null>;
}
