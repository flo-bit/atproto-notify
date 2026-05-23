import * as Notifications from 'expo-notifications';

// Foreground presentation: show the banner + in the notification list, play a
// sound, and bump the badge. Tap handling lives in deep-link.ts.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
