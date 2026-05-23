import { View } from 'react-native';

import { useColors } from '../lib/theme/hooks';

// The stacked-dot brand glyph (4 circles in a 20×20 box), View-based so we don't
// pull in react-native-svg.
const DOTS: Array<{ cx: number; cy: number; opacity: number }> = [
  { cx: 5, cy: 10, opacity: 1 },
  { cx: 11, cy: 6, opacity: 0.55 },
  { cx: 11, cy: 14, opacity: 0.55 },
  { cx: 17, cy: 10, opacity: 0.25 },
];

export function Logomark({ size = 22, color }: { size?: number; color?: string }) {
  const c = useColors();
  const tint = color ?? c.accent;
  const scale = size / 20;
  const r = 2 * scale;
  return (
    <View style={{ width: size, height: size }}>
      {DOTS.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            left: (d.cx - 2) * scale,
            top: (d.cy - 2) * scale,
            backgroundColor: tint,
            opacity: d.opacity,
          }}
        />
      ))}
    </View>
  );
}
