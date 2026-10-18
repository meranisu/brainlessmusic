/** Strict positive-integer id from a route param. Returns undefined for anything else (0, negatives, fractions, text). */
export function parseId(raw: unknown): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
