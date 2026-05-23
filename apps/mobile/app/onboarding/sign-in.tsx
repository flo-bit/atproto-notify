import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { useSession } from '../../lib/auth/session';
import { mono, useColors } from '../../lib/theme/hooks';

export default function SignIn() {
  const c = useColors();
  const router = useRouter();
  const { signIn } = useSession();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    const value = handle.trim().replace(/^@/, '');
    if (value === '') {
      setError('Enter your handle to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(value);
      router.replace('/onboarding/permissions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: c.fg }}>
            Sign in
          </Text>
          <Text style={{ fontSize: 15, color: c.muted, lineHeight: 22, marginTop: 8 }}>
            Use your atproto handle to authorize notify.atmo.tools.
          </Text>

          <Text
            style={{
              fontFamily: mono,
              fontSize: 11,
              color: c.muted2,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginTop: 32,
              marginBottom: 8,
            }}
          >
            your atproto handle
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Text style={{ color: c.muted2, fontFamily: mono, fontSize: 16 }}>@</Text>
            <TextInput
              value={handle}
              onChangeText={setHandle}
              placeholder="alice.bsky.social"
              placeholderTextColor={c.muted2}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              keyboardType="email-address"
              returnKeyType="go"
              onSubmitEditing={() => void onContinue()}
              editable={!busy}
              style={{ flex: 1, color: c.fg, fontSize: 16, fontWeight: '500', paddingVertical: 12 }}
            />
          </View>

          {error ? (
            <Text style={{ color: c.danger, fontSize: 13.5, marginTop: 12, lineHeight: 19 }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <Text style={{ fontSize: 12.5, color: c.muted, lineHeight: 18, marginTop: 16 }}>
            We sign in via your PDS. Your handle is never shared with the apps that notify you.
          </Text>
        </View>

        <Button
          title={busy ? 'Opening browser…' : 'Continue'}
          onPress={() => void onContinue()}
          loading={busy}
        />
      </View>
    </SafeAreaView>
  );
}
