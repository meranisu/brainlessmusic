/** `\`, `%` and `_` in a query are literal in LIKE, not wildcards. Pair with `ESCAPE '\\'` in the SQL. */
export function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Contains-pattern for `LIKE ? ESCAPE '\\'`. Trim or fold the text first when the column needs it. */
export function likePattern(text: string): string {
  return `%${likeEscape(text)}%`;
}
