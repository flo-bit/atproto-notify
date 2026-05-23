// Server-only syntax highlighting via Shiki. Uses the fine-grained core + the
// JavaScript regex engine (no WASM) so it runs on Cloudflare Workers, and a
// single lazily-created highlighter is reused across requests.
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import bash from 'shiki/langs/bash.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';

export type CodeLang = 'bash' | 'ts';

const LANG_ID: Record<CodeLang, string> = { bash: 'bash', ts: 'typescript' };

let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
	highlighterPromise ??= createHighlighterCore({
		themes: [githubLight, githubDark],
		langs: [bash, typescript],
		engine: createJavaScriptRegexEngine()
	});
	return highlighterPromise;
}

/**
 * Render code to themed HTML. Emits dual-theme output (light inline + a
 * `--shiki-dark` CSS variable); `layout.css` swaps to the dark variable under our
 * dark theme.
 */
export async function highlight(code: string, lang: CodeLang): Promise<string> {
	const highlighter = await getHighlighter();
	return highlighter.codeToHtml(code, {
		lang: LANG_ID[lang],
		themes: { light: 'github-light', dark: 'github-dark' }
	});
}
