import { useColorScheme } from 'react-native';

import { darkTokens, lightTokens, mono, radius, spacing, type, type Tokens } from './tokens';

/** Current theme colors based on the system color scheme (no manual toggle). */
export function useColors(): Tokens {
  return useColorScheme() === 'dark' ? darkTokens : lightTokens;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

export { mono, radius, spacing, type };
export type { Tokens };
