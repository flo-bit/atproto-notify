import { ActivityIndicator, View } from 'react-native';

import { useColors } from '../lib/theme/hooks';

export function Spinner({ fill }: { fill?: boolean }) {
  const c = useColors();
  if (fill) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.muted} />
      </View>
    );
  }
  return <ActivityIndicator color={c.muted} />;
}
