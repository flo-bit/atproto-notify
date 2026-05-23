import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApprovalSheet } from '../../../components/ApprovalSheet';
import { Card } from '../../../components/Card';
import { EmptyState } from '../../../components/EmptyState';
import { GrantRow } from '../../../components/GrantRow';
import { PendingCard } from '../../../components/PendingCard';
import { ScreenTitle } from '../../../components/ScreenTitle';
import { SectionLabel } from '../../../components/SectionLabel';
import { Spinner } from '../../../components/Spinner';
import { useDenyPending, useGrant, useListGrants, useListPending } from '../../../lib/relay/queries';
import { useColors } from '../../../lib/theme/hooks';
import { useUiStore } from '../../../lib/store/ui';

export default function Apps() {
  const c = useColors();
  const router = useRouter();
  const pending = useListPending();
  const grants = useListGrants();
  const grant = useGrant();
  const deny = useDenyPending();
  const { approvalSenderDid, openApproval, closeApproval } = useUiStore();
  const [actingOn, setActingOn] = useState<string | null>(null);

  const pendingItems = pending.data?.pending ?? [];
  const grantItems = grants.data?.grants ?? [];
  const refreshing = pending.isRefetching || grants.isRefetching;
  const loading = pending.isLoading || grants.isLoading;

  function refresh() {
    void pending.refetch();
    void grants.refetch();
  }

  async function approve(requestId: string, sender: string) {
    setActingOn(sender);
    try {
      await grant.mutateAsync({ sender: sender as `did:${string}:${string}`, requestId });
      closeApproval();
    } finally {
      setActingOn(null);
    }
  }

  async function reject(requestId: string, sender: string) {
    setActingOn(sender);
    try {
      await deny.mutateAsync({ requestId });
      closeApproval();
    } finally {
      setActingOn(null);
    }
  }

  const sheetPending = pendingItems.find((p) => p.sender === approvalSenderDid);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.muted} />}
      >
        <ScreenTitle
          title="Apps"
          subtitle={`${grantItems.length} connected · ${pendingItems.length} pending`}
        />

        {loading ? (
          <View style={{ paddingTop: 48 }}>
            <Spinner />
          </View>
        ) : null}

        {pendingItems.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
            <SectionLabel>{`pending requests · ${pendingItems.length}`}</SectionLabel>
            <View style={{ gap: 10 }}>
              {pendingItems.map((p) => (
                <PendingCard
                  key={p.id}
                  pending={p}
                  busy={actingOn === p.sender}
                  onPress={() => openApproval(p.sender)}
                  onApprove={() => void approve(p.id, p.sender)}
                  onDeny={() => void reject(p.id, p.sender)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
          <SectionLabel>{`connected · ${grantItems.length}`}</SectionLabel>
          {grantItems.length === 0 && !loading ? (
            <EmptyState title="No apps yet" body="Authorize one when it requests permission." />
          ) : (
            <Card>
              {grantItems.map((g, i) => (
                <GrantRow
                  key={g.sender}
                  grant={g}
                  last={i === grantItems.length - 1}
                  onPress={() => router.push(`/apps/${encodeURIComponent(g.sender)}`)}
                />
              ))}
            </Card>
          )}
        </View>
      </ScrollView>

      {sheetPending ? (
        <ApprovalSheet
          pending={sheetPending}
          busy={actingOn === sheetPending.sender}
          onClose={closeApproval}
          onApprove={() => void approve(sheetPending.id, sheetPending.sender)}
          onDeny={() => void reject(sheetPending.id, sheetPending.sender)}
        />
      ) : null}
    </SafeAreaView>
  );
}
