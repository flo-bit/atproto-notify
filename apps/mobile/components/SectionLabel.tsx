import { Text } from 'react-native';

import { mono, useColors } from '../lib/theme/hooks';

export function SectionLabel({ children }: { children: string }) {
  const c = useColors();
  return (
    <Text
      style={{
        fontFamily: mono,
        fontSize: 10.5,
        color: c.muted2,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        paddingHorizontal: 6,
        paddingBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}
