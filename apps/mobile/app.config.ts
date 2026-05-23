import type { ExpoConfig } from 'expo/config';

// Notes:
// - `scheme` is the reverse-DNS of the OAuth host (notify.atmo.tools) and must
//   match the redirect_uri in the OAuth client metadata (tools.atmo.notify://…).
// - `ios.bundleIdentifier` / `android.package` are the app identity; the iOS
//   bundle id is also the relay's APNs topic (APNS_BUNDLE_ID).
const config: ExpoConfig = {
  name: 'notify.atmo.tools',
  slug: 'atmo-notifs',
  scheme: 'tools.atmo.notify',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#fafaf9',
  },
  ios: {
    bundleIdentifier: 'tools.atmo.notifs.app',
    supportsTablet: true,
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    package: 'tools.atmo.notifs.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#fafaf9',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    'expo-web-browser',
    ['expo-notifications', { color: '#3a6fc1' }],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
