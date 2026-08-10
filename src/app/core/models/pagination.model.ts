export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface PageParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Tamaño de página por defecto y opciones ofrecidas por <app-pager> en todo el panel. */
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];

export function toHttpParams(params?: PageParams): Record<string, string> {
  if (!params) return {};
  const out: Record<string, string> = {};
  if (params.page) out['page'] = String(params.page);
  if (params.pageSize) out['pageSize'] = String(params.pageSize);
  if (params.search) out['search'] = params.search;
  return out;
}
