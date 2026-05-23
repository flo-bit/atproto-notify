// @atcute/lex-cli configuration.
//
// NOTE: lex-cli loads its config via dynamic `import()`, which only resolves
// `lex.config.js` / `lex.config.ts` (not `.json`). We use `.js` so `pnpm
// generate` works on the project's Node version without TypeScript loader flags.
import { defineLexiconConfig } from '@atcute/lex-cli';

export default defineLexiconConfig({
  generate: {
    files: ['lexicons/**/*.json'],
    outdir: 'src/lexicons/',
  },
});
