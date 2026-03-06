interface PaginationParams {
  page?: number;
  per_page?: number;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export function parsePagination(params: PaginationParams) {
  const page = Math.max(1, params.page ?? 1);
  const per_page = Math.min(200, Math.max(1, params.per_page ?? 50));
  const offset = (page - 1) * per_page;
  return { page, per_page, offset };
}

export function buildPaginationMeta(
  page: number,
  per_page: number,
  total: number
): PaginationMeta {
  return {
    page,
    per_page,
    total,
    total_pages: Math.ceil(total / per_page),
  };
}
