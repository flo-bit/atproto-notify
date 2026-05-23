import * as Clipboard from 'expo-clipboard';
import { Text, type TextStyle } from 'react-native';

import { mono, useColors } from '../lib/theme/hooks';
import { shortenDid } from '../lib/utils/handle';

/** A monospace DID, truncated; long-press copies the full value. */
export function CopyableDid({ did, style }: { did: string; style?: TextStyle }) {
  const c = useColors();
  return (
    <Text
      numberOfLines={1}
      onLongPress={() => {
        void Clipboard.setStringAsync(did);
      }}
      style={[{ fontFamily: mono, fontSize: 11.5, color: c.muted2 }, style]}
    >
      {shortenDid(did)}
    </Text>
  );
}
