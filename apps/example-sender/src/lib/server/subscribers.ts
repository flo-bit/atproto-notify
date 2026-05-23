// Demo store of users who enabled notifications for this app via atmo.pub's
// "enable apps" flow (the relay's subscriberChanged callback, ENABLE-FROM-WEB.md).
//
// In-memory only — fine for the demo and for local dev (single process), but a
// real app must persist this (D1/KV/Postgres) since Worker isolates are
// ephemeral. Once a user is here, this app would start calling `send` for them.
const subscribers = new Set<string>();

export function recordSubscriber(did: string, enabled: boolean): void {
	if (enabled) {
		subscribers.add(did);
	} else {
		subscribers.delete(did);
	}
}

export function listSubscribers(): string[] {
	return [...subscribers];
}
