// Inbound XRPC the relay calls on this app (relay → app). Currently just
// `pub.atmo.notify.subscriberChanged`: the relay tells us a user enabled or
// disabled notifications for us from inside atmo.pub. See ENABLE-FROM-WEB.md.
//
// Auth: a service-auth JWT signed by the RELAY's key. We verify the signature
// against the relay's did:web document AND assert the issuer is the relay — that
// last check is what makes this safe (anyone can address a token to us; only the
// relay's signature counts).
import {
	CompositeDidDocumentResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver
} from '@atcute/identity-resolver';
import type { Did, Nsid } from '@atcute/lexicons';
import { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';
import { error, json } from '@sveltejs/kit';

import { RELAY_DID, SENDER_DID } from '$lib/config';
import { recordSubscriber } from '$lib/server/subscribers';

import type { RequestHandler } from './$types';

const SUBSCRIBER_CHANGED = 'pub.atmo.notify.subscriberChanged';

let verifier: ServiceJwtVerifier | null = null;
function getVerifier(): ServiceJwtVerifier {
	verifier ??= new ServiceJwtVerifier({
		// Tokens must be addressed to us, and we only accept the relay as issuer
		// (checked below). did:web for the relay, did:plc fallback for safety.
		acceptAudiences: [SENDER_DID as Did],
		resolver: new CompositeDidDocumentResolver({
			methods: { plc: new PlcDidDocumentResolver(), web: new WebDidDocumentResolver() }
		}),
		maxAge: 300
	});
	return verifier;
}

export const POST: RequestHandler = async ({ params, request }) => {
	if (params.method !== SUBSCRIBER_CHANGED) {
		error(404, 'Unknown method');
	}

	let issuer: Did;
	try {
		({ issuer } = await getVerifier().verifyRequest(request, { lxm: SUBSCRIBER_CHANGED as Nsid }));
	} catch {
		error(401, 'Invalid service-auth token');
	}
	// Critical: trust ONLY the relay. A valid signature from anyone else is not enough.
	if (issuer !== RELAY_DID) {
		error(403, 'Issuer is not the notification relay');
	}

	const body = (await request.json().catch(() => null)) as {
		recipient?: string;
		enabled?: boolean;
	} | null;
	if (!body || typeof body.recipient !== 'string' || typeof body.enabled !== 'boolean') {
		error(400, 'Expected { recipient, enabled }');
	}

	recordSubscriber(body.recipient, body.enabled);
	return json({ ok: true });
};
