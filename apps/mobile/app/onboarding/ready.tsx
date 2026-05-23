import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Logomark } from '../../components/Logomark';
import { useColors } from '../../lib/theme/hooks';

export default function Ready() {
  const c = useColors();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: 16 }}>
          <Logomark size={40} />
          <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: c.fg }}>
            You&apos;re set
          </Text>
          <Text style={{ fontSize: 15, color: c.muted, lineHeight: 23 }}>
            Apps will request permission before sending. You can approve them on the Apps tab.
          </Text>
        </View>
        <Button title="Open notify" onPress={() => router.replace('/(auth)/(tabs)/inbox')} />
      </View>
    </SafeAreaView>
  );
}
