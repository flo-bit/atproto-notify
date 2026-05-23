import type { Did } from '@atcute/lexicons';

import type { AppInfo } from '@atmo/notifs-lexicons';

// Hardcoded catalog of known apps (for now). Single source for three things:
//   - the web's "apps you can enable" list (via the listApps binding method),
//   - requestPermission auto-grant (the old TRUSTED_SENDERS `trusted` flag),
//   - relay → app subscriber callbacks (`callbackUrl`, see ENABLE-FROM-WEB.md).
// Replaces the former lib/trusted.ts.
export interface RegisteredApp {
  did: Did;
  title: string;
  description?: string;
  iconUrl?: string;
  /**
   * Origin the relay POSTs subscriber callbacks to (`/xrpc/<method>` is
   * appended). Omit to disable callbacks for this app.
   */
  callbackUrl?: string;
  /** Auto-grant at `requestPermission` (skips the pending step). */
  trusted?: boolean;
  /**
   * Relay-wide management designation (see MANAGEMENT-AUTH.md). 'full' = a
   * first-party manager that may manage any user's whole account; 'self' =
   * relay-allowlisted to manage its own slice for any user. Omit → none
   * (users may still designate per-grant).
   */
  manage?: 'self' | 'full';
}

export const APPS: readonly RegisteredApp[] = [
  {
    did: 'did:web:example.atmo.pub',
    title: 'Example Sender',
    description: 'Demo app showing the atmo.pub integration.',
    // For local end-to-end testing, point this at your local example-sender.
    callbackUrl: 'https://example.atmo.pub',
    // Relay-allowlisted for self-management so the example's "Step 3" demo works
    // without a per-user designation UI (which lands in a later slice).
    manage: 'self',
  },
];

/** Auto-grant senders (the former TRUSTED_SENDERS). */
export function isTrustedSender(did: Did): boolean {
  return APPS.some((app) => app.did === did && app.trusted === true);
}

/** Relay-wide management designation for `did`, if any ('self' | 'full'). */
export function relayManageFor(did: string): 'self' | 'full' | undefined {
  return APPS.find((app) => app.did === did)?.manage;
}

/** The registered app for `did`, if it has a callback URL configured. */
export function callbackAppFor(did: string): RegisteredApp | undefined {
  return APPS.find((app) => app.did === did && app.callbackUrl !== undefined);
}

/** Public catalog metadata for the web "enable apps" UI (no callback URLs). */
export function appCatalog(): AppInfo[] {
  return APPS.map(({ did, title, description, iconUrl }) => ({
    did,
    title,
    description,
    iconUrl,
  }));
}
