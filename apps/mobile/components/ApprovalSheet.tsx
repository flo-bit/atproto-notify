import type { ToolsAtmoNotifsListPending } from '@atmo/notifs-lexicons';
import { Modal, Pressable, Text, View } from 'react-native';

import { useColors } from '../lib/theme/hooks';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { CopyableDid } from './CopyableDid';
import { VerifiedLine } from './VerifiedLine';

type Pending = ToolsAtmoNotifsListPending.PendingView;

export function ApprovalSheet({
  pending,
  onApprove,
  onDeny,
  onClose,
  busy,
}: {
  pending: Pending;
  onApprove: () => void;
  onDeny: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const c = useColors();
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        {/* Stop propagation so taps inside the sheet don't close it. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 22,
            paddingTop: 12,
            paddingBottom: 36,
          }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, alignSelf: 'center', marginBottom: 18 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <Avatar uri={pending.iconUrl ?? pending.senderBskyAvatar} label={pending.title} seed={pending.sender} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', color: c.fg }}>
                {pending.title}
              </Text>
              <CopyableDid did={pending.sender} />
            </View>
          </View>

          <Text style={{ fontSize: 15, color: c.fg, lineHeight: 22, marginBottom: 16 }}>
            <Text style={{ fontWeight: '600' }}>{pending.title}</Text> wants to send you notifications.
          </Text>

          {pending.description ? (
            <Text style={{ fontSize: 13.5, color: c.muted, fontStyle: 'italic', lineHeight: 19, marginBottom: 16 }}>
              {pending.description}
            </Text>
          ) : null}

          {pending.senderHandle ? (
            <View style={{ marginBottom: 16 }}>
              <VerifiedLine handle={pending.senderHandle} />
            </View>
          ) : null}

          <Text style={{ fontSize: 12, color: c.muted, lineHeight: 18, marginBottom: 20 }}>
            Your handle won&apos;t be shared. You can revoke any time from Settings.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Deny" variant="secondary" onPress={onDeny} disabled={busy} flex />
            <Button title="Accept & enable" variant="primary" onPress={onApprove} loading={busy} flex />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
