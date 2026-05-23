import { APP_DOMAIN, SENDER_DID } from '$lib/config';

import type { RequestHandler } from './$types';

// Replace after running `pnpm sender:keygen` (the public-key multikey).
const PUBLIC_KEY_MULTIBASE = 'zDnaedyxQgL3SipK731YHPiJPbow5tDp7AbofZ2yskvsNHL96';

// Serves this app's did:web document so the relay can verify `send` JWTs signed
// by our private key (it resolves this via WebDidDocumentResolver).
export const GET: RequestHandler = () =>
	Response.json({
		'@context': ['https://www.w3.org/ns/did/v1'],
		id: SENDER_DID,
		verificationMethod: [
			{
				id: `${SENDER_DID}#atproto`,
				type: 'Multikey',
				controller: SENDER_DID,
				publicKeyMultibase: PUBLIC_KEY_MULTIBASE
			}
		],
		service: [
			{
				id: '#example_sender',
				type: 'AtmoNotifsSender',
				serviceEndpoint: `https://${APP_DOMAIN}`
			}
		]
	});
