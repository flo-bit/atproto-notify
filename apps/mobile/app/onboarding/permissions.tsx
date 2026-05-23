import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { useSession } from '../../lib/auth/session';
import { ensurePushRegistered } from '../../lib/push/register';
import { useColors } from '../../lib/theme/hooks';

export default function Permissions() {
  const c = useColors();
  const router = useRouter();
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  async function allow() {
    if (session === null) {
      return;
    }
    setBusy(true);
    try {
      const result = await ensurePushRegistered(session);
      if (result !== null) {
        router.replace('/onboarding/ready');
      } else {
        setDenied(true);
      }
    } catch (err) {
      console.warn('push registration failed', err);
      setDenied(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: c.fg }}>
            Allow notifications
          </Text>
          <Text style={{ fontSize: 15, color: c.muted, lineHeight: 23, marginTop: 12 }}>
            We use system notifications to deliver messages from apps you&apos;ve approved. You can
            change this any time in Settings.
          </Text>
          {denied ? (
            <Text style={{ color: c.muted, fontSize: 13.5, lineHeight: 20, marginTop: 20 }}>
              You can enable notifications later in Settings. Without them, this device won&apos;t
              receive pushes.
            </Text>
          ) : null}
        </View>

        {denied ? (
          <Button title="Continue anyway" variant="secondary" onPress={() => router.replace('/onboarding/ready')} />
        ) : (
          <Button title="Allow" onPress={() => void allow()} loading={busy} />
        )}
      </View>
    </SafeAreaView>
  );
}
