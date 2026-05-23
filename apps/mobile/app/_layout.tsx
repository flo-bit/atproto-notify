import '../lib/push/handler'; // registers the notification handler (side effect)

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '../lib/auth/session';
import { insertForegroundNotification, routeToNotificationResponse } from '../lib/push/deep-link';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

function useReactQueryAppState() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);
}

function useNotificationListeners() {
  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener((n) => {
      void insertForegroundNotification(n).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['inbox-local'] });
      });
    });
    const responded = Notifications.addNotificationResponseReceivedListener((r) => {
      routeToNotificationResponse(r);
    });
    return () => {
      received.remove();
      responded.remove();
    };
  }, []);
}

export default function RootLayout() {
  useReactQueryAppState();
  useNotificationListeners();

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
