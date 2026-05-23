import { Image, Text, View } from 'react-native';

import { useColors } from '../lib/theme/hooks';
import { hueFromString, initial } from '../lib/utils/handle';

/**
 * Sender avatar: shows the image if present, otherwise a deterministic
 * colored disk with the first letter (matches the design's app-mark).
 */
export function Avatar({
  uri,
  label,
  seed,
  size = 40,
}: {
  uri?: string | null;
  label: string;
  /** Stable string (the DID) used to pick the fallback color. */
  seed: string;
  size?: number;
}) {
  const c = useColors();
  const r = size * 0.24;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: r, backgroundColor: c.surface2 }}
      />
    );
  }
  const hue = hueFromString(seed);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: `hsl(${hue}, 45%, 55%)`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.42, fontWeight: '700' }}>
        {initial(label)}
      </Text>
    </View>
  );
}
