// Sender-DID auth — used by `send`. Mints service-auth JWTs signed by THIS app's
// own P-256 key (whose public half is published in our did:web document).
import { P256PrivateKey, parsePrivateMultikey } from '@atcute/crypto';
import type { Did, Nsid } from '@atcute/lexicons';
import { createServiceJwt } from '@atcute/xrpc-server/auth';
import { env } from '$env/dynamic/private';

import { RELAY_DID, SENDER_DID } from '$lib/config';

// Load + cache the keypair once per server instance.
let keypairPromise: Promise<P256PrivateKey> | null = null;

function getKeypair(): Promise<P256PrivateKey> {
	keypairPromise ??= (async () => {
		if (!env.SENDER_PRIVATE_KEY) {
			throw new Error('SENDER_PRIVATE_KEY is not set (run `pnpm sender:keygen`)');
		}
		const { privateKeyBytes } = parsePrivateMultikey(env.SENDER_PRIVATE_KEY);
		return P256PrivateKey.importRaw(privateKeyBytes);
	})();
	return keypairPromise;
}

export async function mintSenderJwt(lxm: string): Promise<string> {
	const keypair = await getKeypair();
	return createServiceJwt({
		keypair,
		issuer: SENDER_DID as Did,
		audience: RELAY_DID as Did,
		lxm: lxm as Nsid,
		expiresIn: 60
	});
}
