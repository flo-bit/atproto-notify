import { Text, View } from 'react-native';

import { useColors } from '../lib/theme/hooks';

/** "✓ Verified on Bluesky: @handle" — shown when a sender DID has a bsky profile. */
export function VerifiedLine({ handle }: { handle: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ color: c.success, fontSize: 12 }}>✓</Text>
      <Text style={{ color: c.muted, fontSize: 12 }}>Verified on Bluesky: @{handle}</Text>
    </View>
  );
}
