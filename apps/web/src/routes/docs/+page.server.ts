import { LEXICON_PREFIX, RELAY_DID, RELAY_ORIGIN } from '$lib/config';
import { highlight, type CodeLang } from '$lib/server/highlight';

import type { PageServerLoad } from './$types';

const requestExample = `# $USER_JWT is minted on the user's PDS via com.atproto.server.getServiceAuth
# (aud=${RELAY_DID}, lxm=${LEXICON_PREFIX}.requestPermission) after the user
# OAuths into your app with the authSender scope.
curl -X POST ${RELAY_ORIGIN}/xrpc/${LEXICON_PREFIX}.requestPermission \\
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
});
// typing tip: \`import '@atmo/notifs-lexicons'\` to register the lexicon,
// or use client.call(ToolsAtmoNotifsSend.mainSchema, { ... }).`;

const sendCurlExample = `curl -X POST ${RELAY_ORIGIN}/xrpc/${LEXICON_PREFIX}.send \\
  -H "Authorization: Bearer $JWT" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipient": "did:plc:recipient",
    "title": "New reply",
    "body": "alice replied to your post",
    "uri": "https://yourapp.example/thread/123"
  }'`;

export interface CodeBlock {
	lang: CodeLang;
	raw: string;
	html: string;
}

// Highlight the (static) examples once per server instance, then reuse.
let cached: Promise<Record<'request' | 'sendJwt' | 'sendAtcute' | 'sendCurl', CodeBlock>> | undefined;
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
			sendCurl: await make(sendCurlExample, 'bash')
		};
	})();
	return cached;
}

export const load: PageServerLoad = async () => {
	return { code: await buildBlocks() };
};
