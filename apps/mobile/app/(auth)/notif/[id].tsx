import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { deleteNotification, getById, markRead } from '../../../lib/db/notifications';
import { useColors } from '../../../lib/theme/hooks';
import { senderLabel } from '../../../lib/utils/handle';
import { relativeTime } from '../../../lib/utils/time';

export default function NotificationDetail() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const notif = useQuery({ queryKey: ['notif', id], enabled: !!id, queryFn: () => getById(id) });

  useEffect(() => {
    if (id) {
      void markRead(id).then(() => {
        void qc.invalidateQueries({ queryKey: ['inbox-local'] });
        void qc.invalidateQueries({ queryKey: ['inbox-unread'] });
      });
    }
  }, [id, qc]);

  async function onDelete() {
    if (!id) return;
    await deleteNotification(id);
    void qc.invalidateQueries({ queryKey: ['inbox-local'] });
    router.back();
  }

  const row = notif.data;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => void onDelete()} hitSlop={10}>
              <Ionicons name="trash-outline" size={20} color={c.danger} />
            </Pressable>
          ),
        }}
      />
      {notif.isLoading ? (
        <Spinner fill />
      ) : row === null || row === undefined ? (
        <Text style={{ color: c.muted, padding: 24 }}>This notification is no longer available.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar uri={row.sender_avatar} label={senderLabel({ displayName: row.sender_display_name, handle: row.sender_handle, did: row.sender_did })} seed={row.sender_did} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: c.fg, fontSize: 14.5, fontWeight: '600' }}>
                {senderLabel({ displayName: row.sender_display_name, handle: row.sender_handle, did: row.sender_did })}
              </Text>
              <Text style={{ color: c.muted2, fontSize: 12 }}>{relativeTime(row.created_at)}</Text>
            </View>
          </View>

          <Text style={{ color: c.fg, fontSize: 20, fontWeight: '700', lineHeight: 27 }}>{row.title}</Text>
          {row.body ? (
            <Text style={{ color: c.fg, fontSize: 15.5, lineHeight: 23 }}>{row.body}</Text>
          ) : null}

          {row.uri ? (
            <Button title="Open original" variant="secondary" onPress={() => void Linking.openURL(row.uri!)} />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
