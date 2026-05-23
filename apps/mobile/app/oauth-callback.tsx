import { Redirect } from 'expo-router';

// Redirect target for `tools.atmo.notify://oauth/callback`. The OAuth client
// normally completes the token exchange inside the in-app browser session (so
// `signIn()` resolves directly); if the OS instead cold-routes the deep link
// here, just bounce back to the gate, which sends the user on once the session
// is available.
export default function OAuthCallback() {
  return <Redirect href="/" />;
}
