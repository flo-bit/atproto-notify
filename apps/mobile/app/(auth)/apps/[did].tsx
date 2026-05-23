import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { SectionLabel } from '../../../components/SectionLabel';
import { Spinner } from '../../../components/Spinner';
import { getBySender } from '../../../lib/db/notifications';
import { useListGrants, useMuteGrant, useRevoke } from '../../../lib/relay/queries';
import { useColors } from '../../../lib/theme/hooks';
import { relativeTime } from '../../../lib/utils/time';
import { SenderHeader } from '../../../components/SenderHeader';

export default function AppDetail() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ did: string }>();
  const did = decodeURIComponent(params.did ?? '');

  const grants = useListGrants();
  const mute = useMuteGrant();
  const revoke = useRevoke();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const history = useQuery({
    queryKey: ['app-history', did],
    enabled: did !== '',
    queryFn: () => getBySender(did, 50),
  });

  const grant = grants.data?.grants.find((g) => g.sender === did);

  if (grants.isLoading) {
    return <Spinner fill />;
  }
  if (grant === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24 }}>
        <Text style={{ color: c.muted }}>This app is no longer authorized.</Text>
      </View>
    );
  }

  const items = history.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 18 }}>
      <SenderHeader
        did={grant.sender}
        title={grant.title}
        description={grant.description}
        iconUrl={grant.iconUrl ?? grant.senderBskyAvatar}
        senderHandle={grant.senderHandle}
      />

      <View style={{ gap: 10 }}>
        <Button
          title={grant.muted ? 'Unmute' : 'Mute'}
          variant="secondary"
          onPress={() => void mute.mutateAsync({ sender: grant.sender, muted: !grant.muted })}
          loading={mute.isPending}
        />
        {confirmRevoke ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Cancel" variant="secondary" onPress={() => setConfirmRevoke(false)} flex />
            <Button
              title="Confirm revoke"
              variant="danger"
              flex
              loading={revoke.isPending}
              onPress={() => {
                void revoke.mutateAsync({ sender: grant.sender }).then(() => router.back());
              }}
            />
          </View>
        ) : (
          <Button title="Revoke access" variant="danger" onPress={() => setConfirmRevoke(true)} />
        )}
      </View>

      <View>
        <SectionLabel>recent notifications</SectionLabel>
        {items.length === 0 ? (
          <Text style={{ color: c.muted, fontSize: 13.5, paddingHorizontal: 6 }}>
            Nothing from this app yet.
          </Text>
        ) : (
          <Card>
            {items.map((n, i) => (
              <View
                key={n.id}
                style={{
                  padding: 14,
                  borderBottomWidth: i === items.length - 1 ? 0 : 0.5,
                  borderBottomColor: c.line2,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: c.fg, fontSize: 14.5, fontWeight: '500' }}>
                    {n.title}
                  </Text>
                  <Text style={{ color: c.muted2, fontSize: 11 }}>{relativeTime(n.created_at)}</Text>
                </View>
                {n.body ? (
                  <Text numberOfLines={2} style={{ color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
                    {n.body}
                  </Text>
                ) : null}
              </View>
            ))}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
