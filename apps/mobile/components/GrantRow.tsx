import type { ToolsAtmoNotifsListGrants } from '@atmo/notifs-lexicons';
import { Pressable, Text, View } from 'react-native';

import { useColors } from '../lib/theme/hooks';
import { RelativeTime } from './RelativeTime';
import { Avatar } from './Avatar';

type Grant = ToolsAtmoNotifsListGrants.GrantView;

export function GrantRow({ grant, onPress, last }: { grant: Grant; onPress: () => void; last?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(127,127,127,0.12)' }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: c.line2,
      }}
    >
      <Avatar uri={grant.iconUrl ?? grant.senderBskyAvatar} label={grant.title} seed={grant.sender} size={38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ color: c.fg, fontSize: 14.5, fontWeight: '600', flexShrink: 1 }}>
            {grant.title}
          </Text>
          {grant.muted ? (
            <View style={{ backgroundColor: c.surface2, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
              <Text style={{ color: c.muted, fontSize: 10.5 }}>muted</Text>
            </View>
          ) : null}
        </View>
        {grant.description ? (
          <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12.5, marginTop: 1 }}>
            {grant.description}
          </Text>
        ) : grant.senderHandle ? (
          <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12.5, marginTop: 1 }}>
            @{grant.senderHandle}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <RelativeTime date={grant.grantedAt} />
        <Text style={{ color: c.muted2, fontSize: 18, lineHeight: 18 }}>›</Text>
      </View>
    </Pressable>
  );
}
