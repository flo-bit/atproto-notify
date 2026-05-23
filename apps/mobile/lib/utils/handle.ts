/** Best display label for a sender: title → display name → @handle → DID. */
export function senderLabel(opts: {
  title?: string | null;
  displayName?: string | null;
  handle?: string | null;
  did: string;
}): string {
  return opts.title || opts.displayName || (opts.handle ? `@${opts.handle}` : opts.did);
}

/** Truncate a long DID (e.g. did:plc:abcdef…wxyz) for compact display. */
export function shortenDid(did: string, head = 16, tail = 4): string {
  if (did.length <= head + tail + 1) {
    return did;
  }
  return `${did.slice(0, head)}…${did.slice(-tail)}`;
}

/** First letter for placeholder avatars. */
export function initial(label: string): string {
  const ch = label.replace(/^@/, '').trim()[0];
  return (ch ?? '?').toUpperCase();
}

/** Best-effort handle for a did:plc, via the public PLC directory (unauthenticated). */
export async function resolveHandleFromPlc(did: string): Promise<string | null> {
  if (!did.startsWith('did:plc:')) {
    return null;
  }
  try {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) {
      return null;
    }
    const doc = (await res.json()) as { alsoKnownAs?: string[] };
    const aka = doc.alsoKnownAs?.find((u) => u.startsWith('at://'));
    return aka ? aka.slice('at://'.length) : null;
  } catch {
    return null;
  }
}

/** Deterministic hue (0–359) from a string, for placeholder avatar colors. */
export function hueFromString(s: string): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    sum += s.charCodeAt(i);
  }
  return sum % 360;
}
