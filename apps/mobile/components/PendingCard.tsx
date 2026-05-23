import type { ToolsAtmoNotifsListPending } from '@atmo/notifs-lexicons';
import { Pressable, Text, View } from 'react-native';

import { radius, useColors } from '../lib/theme/hooks';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { CopyableDid } from './CopyableDid';
import { RelativeTime } from './RelativeTime';
import { VerifiedLine } from './VerifiedLine';

type Pending = ToolsAtmoNotifsListPending.PendingView;

export function PendingCard({
  pending,
  onApprove,
  onDeny,
  onPress,
  busy,
}: {
  pending: Pending;
  onApprove: () => void;
  onDeny: () => void;
  /** Tapping the identity row (for a fuller review sheet). */
  onPress?: () => void;
  busy?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.line, padding: 16 }}>
      <Pressable onPress={onPress} disabled={onPress === undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar uri={pending.iconUrl ?? pending.senderBskyAvatar} label={pending.title} seed={pending.sender} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: c.fg, fontSize: 15, fontWeight: '600' }}>
            {pending.title}
          </Text>
          <CopyableDid did={pending.sender} />
        </View>
        <RelativeTime date={pending.createdAt} />
      </Pressable>

      {pending.description ? (
        <Text style={{ color: c.muted, fontSize: 13.5, fontStyle: 'italic', lineHeight: 19, marginTop: 12 }}>
          {pending.description}
        </Text>
      ) : null}

      {pending.senderHandle ? (
        <View style={{ marginTop: 10 }}>
          <VerifiedLine handle={pending.senderHandle} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        <Button title="Deny" variant="secondary" onPress={onDeny} disabled={busy} flex />
        <Button title="Approve" variant="primary" onPress={onApprove} loading={busy} flex />
      </View>
    </View>
  );
}
