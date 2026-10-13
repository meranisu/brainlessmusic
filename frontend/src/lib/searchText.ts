/** One character as search compares it: accents dropped, lower case. Keeps a 1:1 index with the original text. */
function foldChar(c: string): string {
  return c.normalize('NFD')[0]?.toLowerCase() ?? c;
}

/**
 * `text` cut into runs, each marked when it matches a word of `query`, ignoring case and accents (as the server's
 * search does). For picking out what matched in a result.
 */
export function highlightRuns(text: string, query: string): { text: string; match: boolean }[] {
  const chars = [...text];
  const folded = chars.map(foldChar).join('');
  // Folding keeps one char per char, but code points beyond the BMP are two UTF-16 units; map back by index.
  const unitToChar: number[] = [];
  chars.forEach((c, i) => {
    for (let k = 0; k < foldChar(c).length; k++) unitToChar.push(i);
  });
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const word of query.trim().split(/\s+/).filter(Boolean)) {
    const w = [...word].map(foldChar).join('');
    let from = folded.indexOf(w);
    while (from >= 0) {
      for (let u = from; u < from + w.length; u++) marked[unitToChar[u]] = true;
      from = folded.indexOf(w, from + w.length);
    }
  }
  const runs: { text: string; match: boolean }[] = [];
  chars.forEach((c, i) => {
    const last = runs[runs.length - 1];
    if (last && last.match === marked[i]) last.text += c;
    else runs.push({ text: c, match: marked[i] });
  });
  return runs;
}
