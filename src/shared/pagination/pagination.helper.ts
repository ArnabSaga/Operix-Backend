import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
} from './pagination.constant.js';
import type {
  NormalizedPagination,
  PaginationInput,
  PaginationMeta,
} from './pagination.interface.js';

export function normalizePagination(
  input: PaginationInput,
): NormalizedPagination {
  const page =
    input.page === undefined || input.page <= 0 ? DEFAULT_PAGE : input.page;

  const rawLimit =
    input.limit === undefined || input.limit <= 0 ? DEFAULT_LIMIT : input.limit;
  const limit = Math.min(rawLimit, MAX_LIMIT);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function createPaginationMeta(input: {
  page: number;
  limit: number;
  total: number;
}): PaginationMeta {
  return {
    page: input.page,
    limit: input.limit,
    total: input.total,
    totalPages: Math.ceil(input.total / input.limit),
  };
}
