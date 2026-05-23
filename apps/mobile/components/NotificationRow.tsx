import { Pressable, Text, View } from 'react-native';

import type { NotificationRow as Row } from '../lib/db/notifications';
import { useColors } from '../lib/theme/hooks';
import { senderLabel } from '../lib/utils/handle';
import { Avatar } from './Avatar';
import { RelativeTime } from './RelativeTime';

export function NotificationRow({ row, onPress, last }: { row: Row; onPress: () => void; last?: boolean }) {
  const c = useColors();
  const unread = row.read_at === null;
  const label = senderLabel({
    displayName: row.sender_display_name,
    handle: row.sender_handle,
    did: row.sender_did,
  });
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(127,127,127,0.12)' }}
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: 'flex-start',
        backgroundColor: unread ? c.accentSoft : 'transparent',
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: c.line2,
      }}
    >
      <Avatar uri={row.sender_avatar} label={label} seed={row.sender_did} size={34} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.muted, fontSize: 13, fontWeight: '600' }}>
            {label}
          </Text>
          <RelativeTime date={row.created_at} style={{ marginLeft: 8 }} />
        </View>
        <Text
          numberOfLines={2}
          style={{
            color: c.fg,
            fontSize: 14.5,
            fontWeight: unread ? '600' : '500',
            lineHeight: 19,
            marginTop: 2,
          }}
        >
          {row.title}
        </Text>
        {row.body ? (
          <Text numberOfLines={2} style={{ color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
            {row.body}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
