import { Link, useRouter } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Logomark } from '../../components/Logomark';
import { mono, useColors } from '../../lib/theme/hooks';

export default function Welcome() {
  const c = useColors();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <Logomark size={28} />
          <Text style={{ fontFamily: mono, fontSize: 17, fontWeight: '600', color: c.fg }}>
            notify<Text style={{ color: c.muted2, fontWeight: '400' }}>.atmo.tools</Text>
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.8, lineHeight: 36, color: c.fg }}>
            Notifications from any atproto app.
          </Text>
          <Text style={{ fontSize: 15.5, color: c.muted, lineHeight: 24, marginTop: 16 }}>
            One inbox for every app. You decide which ones can reach you.
          </Text>
        </View>

        <Button title="Get started" onPress={() => router.push('/onboarding/sign-in')} />
        <Link
          href="/onboarding/sign-in"
          onPress={(e) => {
            e.preventDefault();
            void Linking.openURL('https://bsky.app');
          }}
          style={{ textAlign: 'center', color: c.muted, fontSize: 14, paddingVertical: 14, marginTop: 6 }}
        >
          I don&apos;t have a handle yet
        </Link>
      </View>
    </SafeAreaView>
  );
}
