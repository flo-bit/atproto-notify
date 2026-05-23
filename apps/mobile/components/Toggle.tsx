import { Switch } from 'react-native';

import { useColors } from '../lib/theme/hooks';

export function Toggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: c.line, true: c.accent }}
      thumbColor={c.surface}
      ios_backgroundColor={c.line}
    />
  );
}
