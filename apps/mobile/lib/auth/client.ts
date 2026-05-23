import { ExpoOAuthClient } from '@atproto/oauth-client-expo';

import { clientMetadata } from './client-metadata';

// Singleton OAuth client. `@atproto/oauth-client-expo` manages token + state
// storage internally (expo-secure-store / async-storage) and drives the browser
// session via expo-web-browser, returning to us through the `tools.atmo.notify`
// scheme registered in app.config.ts.
export const oauthClient = new ExpoOAuthClient({
  clientMetadata,
});

export type { OAuthSession } from '@atproto/oauth-client-expo';
