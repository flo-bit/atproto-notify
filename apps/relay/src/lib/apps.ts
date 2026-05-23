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
}

export const APPS: readonly RegisteredApp[] = [
  {
    did: 'did:web:example.atmo.pub',
    title: 'Example Sender',
    description: 'Demo app showing the atmo.pub integration.',
    // For local end-to-end testing, point this at your local example-sender.
    callbackUrl: 'https://example.atmo.pub',
  },
];

/** Auto-grant senders (the former TRUSTED_SENDERS). */
export function isTrustedSender(did: Did): boolean {
  return APPS.some((app) => app.did === did && app.trusted === true);
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
