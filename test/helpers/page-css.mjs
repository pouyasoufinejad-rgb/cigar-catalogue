import { readFile } from 'node:fs/promises';

// The page's CSS was 27 inline <style> blocks and is now one stylesheet. Tests care about
// the rules, not where they are kept, so this returns all of it in cascade order: the
// linked sheets as they appear in the document, then anything still inline.
export async function readPageCss() {
  const html = await readFile(new URL('../../public/index.html', import.meta.url), 'utf8');
  const parts = [];
  for (const match of html.matchAll(/<link rel="stylesheet" href="\/([^"]+)">|<style[^>]*>([\s\S]*?)<\/style>/g)) {
    parts.push(match[1]
      ? await readFile(new URL(`../../public/${match[1]}`, import.meta.url), 'utf8')
      : match[2]);
  }
  return parts.join('\n');
}

// jsdom parses every declaration it is given, and the flags and medal wreaths are enormous
// data URIs that buy a test nothing. Dropping those rules keeps the suite quick.
export function withoutDataUris(css) {
  return css.replace(/[^{}]*\{[^{}]*base64[^{}]*\}/g, '');
}
