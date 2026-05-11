import { api } from './client';

export interface MkExpense {
  id: string;
  expense_date: string;
  category: string;
  vendor: string | null;
  amount: number | string;        // pg numeric returns as string in some setups
  currency: string;
  notes: string | null;
  credit: string | null;
  receipt_url: string | null;
  mk_name_raw: string;
  source_year: number;
  source_row_index: number;
  person_id: string | null;
  person_name: string | null;
  /** True when the originating mk_expense_imports row is marked reviewed. */
  import_reviewed?: boolean;
}

export interface ExpenseSearchParams {
  q?: string;
  from_date?: string;
  to_date?: string;
  person_ids?: string[];
  /** Names to match against person.name OR mk_name_raw — same shape the
   * events endpoint uses for cross-filtering by selected people/entities. */
  entity_names?: string[];
  category?: string;
  page?: number;
  per_page?: number;
  sort?: 'date_asc' | 'date_desc' | 'amount_desc' | 'amount_asc';
}

export interface ExpenseSearchResult {
  data: MkExpense[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface ExpenseSummaryRow {
  expense_date: string;
  person_id: string | null;
  person_name: string | null;
  count: number;
  total_amount: number;
}

export async function searchExpenses(params: ExpenseSearchParams): Promise<ExpenseSearchResult> {
  const qs: Record<string, string | number> = {};
  if (params.q) qs.q = params.q;
  if (params.from_date) qs.from_date = params.from_date;
  if (params.to_date) qs.to_date = params.to_date;
  if (params.person_ids?.length) qs.person_ids = params.person_ids.join(',');
  if (params.entity_names?.length) qs.entity_names = params.entity_names.join('||');
  if (params.category) qs.category = params.category;
  if (params.page) qs.page = params.page;
  if (params.per_page) qs.per_page = params.per_page;
  if (params.sort) qs.sort = params.sort;
  const { data } = await api.get('/public/expenses', { params: qs });
  return data;
}

export async function getExpenseSummary(
  fromDate: string,
  toDate: string,
  options?: { personIds?: string[]; entityNames?: string[] },
): Promise<ExpenseSummaryRow[]> {
  const qs: Record<string, string> = { from_date: fromDate, to_date: toDate };
  if (options?.personIds?.length) qs.person_ids = options.personIds.join(',');
  if (options?.entityNames?.length) qs.entity_names = options.entityNames.join('||');
  const { data } = await api.get('/public/expenses/summary', { params: qs });
  return data.data;
}

export async function getExpenseCategories(): Promise<{ category: string; count: number }[]> {
  const { data } = await api.get('/public/expenses/categories');
  return data.data;
}
