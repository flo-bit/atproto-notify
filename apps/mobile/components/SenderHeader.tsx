import { Text, View } from 'react-native';

import { useColors } from '../lib/theme/hooks';
import { Avatar } from './Avatar';
import { CopyableDid } from './CopyableDid';
import { VerifiedLine } from './VerifiedLine';

/** Large sender identity block (used on the per-app detail screen). */
export function SenderHeader({
  did,
  title,
  description,
  iconUrl,
  senderHandle,
}: {
  did: string;
  title: string;
  description?: string;
  iconUrl?: string | null;
  senderHandle?: string | null;
}) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      <Avatar uri={iconUrl} label={title} seed={did} size={64} />
      <Text style={{ color: c.fg, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      <CopyableDid did={did} style={{ fontSize: 12 }} />
      {description ? (
        <Text style={{ color: c.muted, fontSize: 14, fontStyle: 'italic', textAlign: 'center', lineHeight: 20 }}>
          {description}
        </Text>
      ) : null}
      {senderHandle ? <VerifiedLine handle={senderHandle} /> : null}
    </View>
  );
}
