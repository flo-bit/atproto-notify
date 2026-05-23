// Color + scale tokens. React Native's StyleSheet needs hex/rgba (no oklch), so
// these are sRGB conversions of the web design's oklch palette, with the mobile
// design's "grouped surface" treatment (surfaces float above a neutral bg).

export interface Tokens {
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  line2: string;
  fg: string;
  muted: string;
  muted2: string;
  accent: string;
  accentHover: string;
  accentFg: string;
  accentSoft: string;
  success: string;
  warn: string;
  danger: string;
}

export const lightTokens: Tokens = {
  bg: '#f6f5f3',
  surface: '#ffffff',
  surface2: '#efeeec',
  line: '#e7e5e4',
  line2: '#efedeb',
  fg: '#1c1917',
  muted: '#6b6660',
  muted2: '#a8a29e',
  accent: '#3a6fc1',
  accentHover: '#2f5ba3',
  accentFg: '#ffffff',
  accentSoft: 'rgba(58,111,193,0.10)',
  success: '#3f9c5e',
  warn: '#b07d12',
  danger: '#cf4040',
};

export const darkTokens: Tokens = {
  bg: '#1a1917',
  surface: '#272522',
  surface2: '#211f1d',
  line: '#3a3633',
  line2: '#322f2c',
  fg: '#f5f5f4',
  muted: '#b3ada7',
  muted2: '#7d7771',
  accent: '#7a98d8',
  accentHover: '#9bb3e3',
  accentFg: '#1a1917',
  accentSoft: 'rgba(122,152,216,0.16)',
  success: '#5cb47c',
  warn: '#d9b44a',
  danger: '#e26a6a',
};

export const spacing = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96] as const;

export const radius = { sm: 6, md: 10, lg: 16, card: 14, pill: 999 } as const;

export const type = {
  small: 13,
  base: 15,
  lead: 17,
  h3: 20,
  h2: 28,
  h1: 30,
} as const;

/** Monospace family per platform (used for DIDs, eyebrows). */
export const mono = 'ui-monospace';
