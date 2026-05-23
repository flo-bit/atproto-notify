import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useColors } from '../lib/theme/hooks';

/** A grouped surface that floats above the screen background (iOS-style). */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: radius.card, overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}
