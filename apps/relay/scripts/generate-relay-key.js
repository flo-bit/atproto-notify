// Generates the P-256 (ES256) keypair the relay signs OUTBOUND service-auth JWTs
// with — e.g. the `subscriberChanged` callback it POSTs to apps (see
// ENABLE-FROM-WEB.md). Run once: `pnpm --filter @atmo/notifs-relay relay:keygen`.
// Set the private key as the RELAY_PRIVATE_KEY secret and paste the public
// multikey into the did.json `verificationMethod` in src/well-known.ts.
import { P256PrivateKeyExportable } from '@atcute/crypto';

const keypair = await P256PrivateKeyExportable.createKeypair();
const privateKey = await keypair.exportPrivateKey('multikey');
const publicKey = await keypair.exportPublicKey('multikey');

console.log('=== PRIVATE KEY (set as RELAY_PRIVATE_KEY secret / .dev.vars) ===');
console.log(privateKey);
console.log();
console.log('=== PUBLIC KEY (publicKeyMultibase value in well-known.ts) ===');
console.log(publicKey);
console.log();
console.log('Save the private key now — re-running this script generates new keys.');
