import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { mono, useColors } from '../lib/theme/hooks';

export function ScreenTitle({
  title,
  subtitle,
  eyebrow,
  trailing,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  trailing?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
      {eyebrow ? (
        <Text
          style={{
            fontFamily: mono,
            fontSize: 11,
            color: c.muted2,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          {eyebrow}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: c.fg }}>
          {title}
        </Text>
        {trailing}
      </View>
      {subtitle ? (
        <Text style={{ fontSize: 13.5, color: c.muted, marginTop: 4 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}
