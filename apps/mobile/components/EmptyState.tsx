import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useColors } from '../lib/theme/hooks';

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 32, gap: 8 }}>
      <Text style={{ color: c.fg, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
      {body ? (
        <Text style={{ color: c.muted, fontSize: 13.5, lineHeight: 20, textAlign: 'center' }}>{body}</Text>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}
