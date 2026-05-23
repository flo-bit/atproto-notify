import type { Did } from '@atcute/lexicons';

// "Trusted apps": sender DIDs that are auto-granted at `requestPermission`
// (skipping the pending step). Hardcoded for now — add known-good app DIDs here.
export const TRUSTED_SENDERS: readonly Did[] = [
  // 'did:web:example.atmo.pub',
];

export function isTrustedSender(did: Did): boolean {
  return TRUSTED_SENDERS.includes(did);
}
