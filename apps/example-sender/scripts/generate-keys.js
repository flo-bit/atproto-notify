// Generates the P-256 (ES256) keypair this app signs `send` JWTs with.
// Run once: `pnpm sender:keygen`. Set the private key as the SENDER_PRIVATE_KEY
// secret and paste the public multikey into src/routes/.well-known/did.json/+server.ts.
import { P256PrivateKeyExportable } from '@atcute/crypto';

const keypair = await P256PrivateKeyExportable.createKeypair();
const privateKey = await keypair.exportPrivateKey('multikey');
const publicKey = await keypair.exportPublicKey('multikey');

console.log('=== PRIVATE KEY (set as SENDER_PRIVATE_KEY secret) ===');
console.log(privateKey);
console.log();
console.log('=== PUBLIC KEY (publicKeyMultibase value in did.json) ===');
console.log(publicKey);
console.log();
console.log('Save the private key now — re-running this script generates new keys.');
