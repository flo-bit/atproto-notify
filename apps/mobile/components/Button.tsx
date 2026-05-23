import { ActivityIndicator, Pressable, type StyleProp, Text, type ViewStyle } from 'react-native';

import { useColors } from '../lib/theme/hooks';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  flex = false,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  flex?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.fg, fg: c.bg, border: 'transparent' },
    secondary: { bg: 'transparent', fg: c.fg, border: c.line },
    ghost: { bg: 'transparent', fg: c.muted, border: 'transparent' },
    danger: { bg: 'transparent', fg: c.danger, border: c.line },
  };
  const p = palette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{ color: 'rgba(127,127,127,0.18)' }}
      style={({ pressed }) => [
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: 1,
          borderRadius: 12,
          minHeight: 48,
          paddingVertical: 13,
          paddingHorizontal: 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        flex ? { flex: 1 } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={p.fg} /> : null}
      <Text style={{ color: p.fg, fontSize: 15, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}
