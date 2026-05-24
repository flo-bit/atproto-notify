// Server-only feature gating by DID allowlist. Email delivery is limited to these
// users for now: everyone else doesn't see the Email section in Settings and can't
// link an address (the `linkEmail` command rejects them too). Add DIDs here to
// grant access. Kept server-side so the list never ships to the browser.
const EMAIL_WHITELIST = new Set<string>([
	// 'did:plc:257wekqxg4hyapkq6k47igmp',
]);

/** True if `did` may use the email delivery channel. */
export function emailEnabledFor(did: string | null | undefined): boolean {
	return did != null && EMAIL_WHITELIST.has(did);
}
