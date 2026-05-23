import { LEXICON_PREFIX, RELAY_DID, RELAY_ORIGIN, WEBAPP_URL } from '$lib/config';
import { highlight, type CodeLang } from '$lib/server/highlight';

import type { PageServerLoad } from './$types';

const requestExample = `curl -X POST ${RELAY_ORIGIN}/xrpc/${LEXICON_PREFIX}.requestPermission \\
  -H "Authorization: Bearer $USER_JWT" \\
  -H "Content-Type: application/json" \\
  -d '{
    "senderDid": "did:web:yourapp.example",
    "title": "Bookhive",
    "description": "New comments on your books"
  }'`;

const sendJwtExample = `import { createServiceJwt } from '@atcute/xrpc-server/auth';

// Signed with YOUR app's key — this proves the sender identity.
const jwt = await createServiceJwt({
  keypair: yourKeypair,
  issuer: 'did:web:yourapp.example',
  audience: '${RELAY_DID}',
  lxm: '${LEXICON_PREFIX}.send'
});`;

// Easier: use @atcute/client instead of hand-rolling fetch (pass the JWT per call).
const sendAtcuteExample = `import { Client, simpleFetchHandler } from '@atcute/client';

const client = new Client({
  handler: simpleFetchHandler({ service: '${RELAY_ORIGIN}' })
});

await client.post('${LEXICON_PREFIX}.send', {
  headers: { authorization: \`Bearer \${jwt}\` },
  input: {
    recipient: 'did:plc:recipient',
    title: 'New reply',
    body: 'alice replied to your post',
    uri: 'https://yourapp.example/thread/123'
  }
});`;

const sendCurlExample = `curl -X POST ${RELAY_ORIGIN}/xrpc/${LEXICON_PREFIX}.send \\
  -H "Authorization: Bearer $JWT" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipient": "did:plc:recipient",
    "title": "New reply",
    "body": "alice replied to your post",
    "uri": "https://yourapp.example/thread/123"
  }'`;

const appLoginExample = `// 1. Add to your app's OAuth scope:  rpc?lxm=pub.atmo.auth&aud=*
// 2. Mint a single-use, ~60s identity token on the signed-in user's PDS:
const { data } = await client.get('com.atproto.server.getServiceAuth', {
  params: { aud: '${RELAY_DID}', lxm: 'pub.atmo.auth' }
});

// 3. Open atmo.pub already signed in — deep-link to YOUR app's settings page.
//    (Open the tab on the click first to keep the user gesture.)
const url = \`${WEBAPP_URL}/applogin?token=\${encodeURIComponent(data.token)}\`
  + \`&redirect=\${encodeURIComponent('/apps/did:web:yourapp.example')}\`;
window.open(url);`;

export interface CodeBlock {
	lang: CodeLang;
	raw: string;
	html: string;
}

const enableCallbackExample = `import { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';
import { CompositeDidDocumentResolver, PlcDidDocumentResolver,
         WebDidDocumentResolver } from '@atcute/identity-resolver';

// Endpoint the relay POSTs when a user enables/disables you from atmo.pub:
//   POST /xrpc/pub.atmo.notify.subscriberChanged  { recipient, enabled, changedAt }
const verifier = new ServiceJwtVerifier({
  acceptAudiences: ['did:web:yourapp.example'],          // tokens addressed to you
  resolver: new CompositeDidDocumentResolver({ methods: {
    plc: new PlcDidDocumentResolver(), web: new WebDidDocumentResolver() } })
});

const { issuer } = await verifier.verifyRequest(request, {
  lxm: 'pub.atmo.notify.subscriberChanged'
});
// CRITICAL: only the relay may tell you this — a valid signature isn't enough.
if (issuer !== '${RELAY_DID}') throw new Error('issuer is not the relay');

const { recipient, enabled } = await request.json();
// enabled ? start sending to \`recipient\` via send : stop.`;

// Highlight the (static) examples once per server instance, then reuse.
let cached:
	| Promise<
			Record<
				'request' | 'sendJwt' | 'sendAtcute' | 'sendCurl' | 'appLogin' | 'enableCallback',
				CodeBlock
			>
	  >
	| undefined;
function buildBlocks() {
	cached ??= (async () => {
		const make = async (raw: string, lang: CodeLang): Promise<CodeBlock> => ({
			lang,
			raw,
			html: await highlight(raw, lang)
		});
		return {
			request: await make(requestExample, 'bash'),
			sendJwt: await make(sendJwtExample, 'ts'),
			sendAtcute: await make(sendAtcuteExample, 'ts'),
			sendCurl: await make(sendCurlExample, 'bash'),
			appLogin: await make(appLoginExample, 'ts'),
			enableCallback: await make(enableCallbackExample, 'ts')
		};
	})();
	return cached;
}

export const load: PageServerLoad = async () => {
	return { code: await buildBlocks() };
};
