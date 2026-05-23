import { Text, type TextStyle } from 'react-native';

import { useColors } from '../lib/theme/hooks';
import { relativeTime } from '../lib/utils/time';

export function RelativeTime({ date, style }: { date: number | string; style?: TextStyle }) {
  const c = useColors();
  return (
    <Text style={[{ color: c.muted2, fontSize: 11, fontVariant: ['tabular-nums'] }, style]}>
      {relativeTime(date)}
    </Text>
  );
}
