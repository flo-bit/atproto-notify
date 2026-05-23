import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../../components/Avatar';
import { Card } from '../../../components/Card';
import { CopyableDid } from '../../../components/CopyableDid';
import { ScreenTitle } from '../../../components/ScreenTitle';
import { SectionLabel } from '../../../components/SectionLabel';
import { useSession } from '../../../lib/auth/session';
import { DOCS_URL } from '../../../lib/config';
import { getStoredDeviceId } from '../../../lib/push/register';
import { useLinkTelegram, useListChannels, useUnlinkChannel } from '../../../lib/relay/queries';
import { mono, useColors } from '../../../lib/theme/hooks';
import { resolveHandleFromPlc, senderLabel } from '../../../lib/utils/handle';
import { relativeTime } from '../../../lib/utils/time';

function platformLabel(platform: string): string {
  if (platform === 'ios') return 'iOS device';
  if (platform === 'android') return 'Android device';
  return 'Telegram';
}

export default function Settings() {
  const c = useColors();
  const router = useRouter();
  const { did, signOut } = useSession();
  const channels = useListChannels();
  const unlink = useUnlinkChannel();
  const linkTelegram = useLinkTelegram();
  const [unlinking, setUnlinking] = useState<string | null>(null);

  const handle = useQuery({
    queryKey: ['account-handle', did],
    enabled: did !== null,
    queryFn: () => resolveHandleFromPlc(did!),
  });
  const thisDevice = useQuery({ queryKey: ['this-device'], queryFn: getStoredDeviceId });

  const channelItems = channels.data?.channels ?? [];
  const label = senderLabel({ handle: handle.data, did: did ?? '' });

  async function onUnlink(deviceId: string) {
    setUnlinking(deviceId);
    try {
      await unlink.mutateAsync({ deviceId });
    } finally {
      setUnlinking(null);
    }
  }

  async function onAddTelegram() {
    try {
      const { deepLink } = await linkTelegram.mutateAsync();
      await Linking.openURL(deepLink);
    } catch (err) {
      console.warn('link telegram failed', err);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={channels.isRefetching} onRefresh={() => void channels.refetch()} tintColor={c.muted} />
        }
      >
        <ScreenTitle title="Settings" />

        {/* Account */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <Avatar label={label} seed={did ?? 'x'} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: c.fg, fontSize: 15, fontWeight: '600' }}>
                  {handle.data ? `@${handle.data}` : 'Signed in'}
                </Text>
                {did ? <CopyableDid did={did} /> : null}
              </View>
            </View>
          </Card>
        </View>

        {/* Devices */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
          <SectionLabel>devices</SectionLabel>
          <Card>
            {channelItems.length === 0 ? (
              <Text style={{ color: c.muted, fontSize: 13.5, padding: 14 }}>No devices linked yet.</Text>
            ) : (
              channelItems.map((ch, i) => (
                <View
                  key={ch.deviceId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderBottomWidth: i === channelItems.length - 1 ? 0 : 0.5,
                    borderBottomColor: c.line2,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: c.fg, fontSize: 14.5, fontWeight: '500' }}>
                      {ch.displayName ?? platformLabel(ch.platform)}
                      {ch.deviceId === thisDevice.data ? (
                        <Text style={{ color: c.muted2 }}> · this device</Text>
                      ) : null}
                    </Text>
                    <Text style={{ color: c.muted2, fontSize: 12, marginTop: 1 }}>
                      {platformLabel(ch.platform)} · linked {relativeTime(ch.linkedAt)}
                    </Text>
                  </View>
                  <Pressable onPress={() => void onUnlink(ch.deviceId)} disabled={unlinking === ch.deviceId} hitSlop={8}>
                    <Text style={{ color: c.danger, fontSize: 14, fontWeight: '500', opacity: unlinking === ch.deviceId ? 0.5 : 1 }}>
                      Unlink
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </Card>
          <Pressable onPress={() => void onAddTelegram()} disabled={linkTelegram.isPending} style={{ paddingVertical: 12, paddingHorizontal: 6 }}>
            <Text style={{ color: c.accent, fontSize: 14, fontWeight: '600' }}>
              {linkTelegram.isPending ? 'Opening Telegram…' : '+ Add Telegram'}
            </Text>
          </Pressable>
        </View>

        {/* About */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
          <SectionLabel>about</SectionLabel>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 0.5, borderBottomColor: c.line2 }}>
              <Text style={{ color: c.fg, fontSize: 14.5 }}>Version</Text>
              <Text style={{ color: c.muted2, fontSize: 13, fontFamily: mono }}>
                {Constants.expoConfig?.version ?? '0.1.0'}
              </Text>
            </View>
            <Pressable onPress={() => void Linking.openURL(DOCS_URL)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
              <Text style={{ color: c.fg, fontSize: 14.5 }}>Developer docs</Text>
              <Text style={{ color: c.muted2, fontSize: 18 }}>›</Text>
            </Pressable>
          </Card>
        </View>

        {/* Account actions */}
        <View style={{ paddingHorizontal: 16 }}>
          <SectionLabel>account</SectionLabel>
          <Card>
            <Pressable
              onPress={() => {
                void signOut().then(() => router.replace('/onboarding/welcome'));
              }}
              style={{ padding: 14 }}
            >
              <Text style={{ color: c.danger, fontSize: 14.5, fontWeight: '500' }}>Sign out</Text>
            </Pressable>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
