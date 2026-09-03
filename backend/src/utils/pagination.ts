const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface PaginationParams {
  limit: number;
  offset: number;
}

export function parsePagination(query: { limit?: unknown; offset?: unknown }): PaginationParams {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);

  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

  return { limit, offset };
}
