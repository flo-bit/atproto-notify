import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '../../../components/EmptyState';
import { NotificationRow } from '../../../components/NotificationRow';
import { ScreenTitle } from '../../../components/ScreenTitle';
import { useSession } from '../../../lib/auth/session';
import {
  getRecent,
  getUnreadCount,
  markAllRead,
  markRead,
  type NotificationRow as Row,
} from '../../../lib/db/notifications';
import { syncFromRelay } from '../../../lib/db/sync';
import { radius, useColors } from '../../../lib/theme/hooks';

export default function Inbox() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useSession();
  const [refreshing, setRefreshing] = useState(false);

  const local = useQuery({ queryKey: ['inbox-local'], queryFn: () => getRecent(200) });
  const unread = useQuery({ queryKey: ['inbox-unread'], queryFn: getUnreadCount });

  const refreshLocal = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['inbox-local'] });
    void qc.invalidateQueries({ queryKey: ['inbox-unread'] });
  }, [qc]);

  const sync = useCallback(async () => {
    if (session === null) {
      return;
    }
    try {
      await syncFromRelay(session);
      refreshLocal();
    } catch (err) {
      console.warn('inbox sync failed', err);
    }
  }, [session, refreshLocal]);

  // Sync whenever the tab gains focus.
  useFocusEffect(
    useCallback(() => {
      void sync();
    }, [sync]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  }, [sync]);

  const onOpen = useCallback(
    (row: Row) => {
      void markRead(row.id).then(refreshLocal);
      router.push(`/notif/${row.id}`);
    },
    [router, refreshLocal],
  );

  const data = local.data ?? [];
  const unreadCount = unread.data ?? 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.muted} />
        }
        ListHeaderComponent={
          <ScreenTitle
            title="Inbox"
            subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
            trailing={
              unreadCount > 0 ? (
                <Pressable onPress={() => void markAllRead().then(refreshLocal)}>
                  <Text style={{ color: c.accent, fontSize: 14, fontWeight: '600' }}>Mark all</Text>
                </Pressable>
              ) : undefined
            }
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No notifications yet"
            body="Apps that you've approved will appear here."
          />
        }
        renderItem={({ item, index }) => {
          const isLast = index === data.length - 1;
          return (
            <View
              style={{
                marginHorizontal: 16,
                backgroundColor: c.surface,
                borderTopLeftRadius: index === 0 ? radius.card : 0,
                borderTopRightRadius: index === 0 ? radius.card : 0,
                borderBottomLeftRadius: isLast ? radius.card : 0,
                borderBottomRightRadius: isLast ? radius.card : 0,
                overflow: 'hidden',
              }}
            >
              <NotificationRow row={item} last={isLast} onPress={() => onOpen(item)} />
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
