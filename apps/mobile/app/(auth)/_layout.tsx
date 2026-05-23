import { Redirect, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { Spinner } from '../../components/Spinner';
import { useSession } from '../../lib/auth/session';
import { routeToNotificationResponse } from '../../lib/push/deep-link';
import { ensurePushRegistered } from '../../lib/push/register';
import { useColors } from '../../lib/theme/hooks';

export default function AuthLayout() {
  const c = useColors();
  const { session, restoring } = useSession();
  const coldRouted = useRef(false);

  // Register for push on every authed launch — cheap + idempotent.
  useEffect(() => {
    if (session !== null) {
      void ensurePushRegistered(session).catch((err) => console.warn('push register', err));
    }
  }, [session]);

  // Cold launch via a notification tap: route once the gate has resolved.
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (session !== null && lastResponse && !coldRouted.current) {
      coldRouted.current = true;
      routeToNotificationResponse(lastResponse);
    }
  }, [session, lastResponse]);

  if (restoring) {
    return <Spinner fill />;
  }
  if (session === null) {
    return <Redirect href="/onboarding/welcome" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.fg },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="notif/[id]" options={{ headerShown: true, title: 'Notification' }} />
      <Stack.Screen name="apps/[did]" options={{ headerShown: true, title: 'App' }} />
    </Stack>
  );
}
