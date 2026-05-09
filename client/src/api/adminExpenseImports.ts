import { api } from './client';
import type { MkExpense } from './expenses';

export type MkMatchKind = 'exact' | 'swapped' | 'fuzzy' | 'new';

export interface MkResolution {
  name_raw: string;
  match_kind: MkMatchKind;
  matched_person_id: string | null;
  matched_person_name: string | null;
  score: number | null;
  is_diary_owner: boolean;
}

export interface PreviewResult {
  source_year: number;
  total_rows: number;
  rows: Array<{
    mk_name_raw: string;
    expense_date: string;
    category: string;
    vendor: string | null;
    amount: number;
    notes: string | null;
    credit: string | null;
    receipt_url: string | null;
    source_row_index: number;
  }>;
  mks: MkResolution[];
  warnings: string[];
}

export interface CommitResult {
  import_id: string;
  rows_inserted: number;
  mks_matched: number;
  mks_created: number;
  warnings: string[];
}

export interface ImportSummary {
  id: string;
  filename: string;
  source_year: number;
  total_rows: number;
  rows_inserted: number;
  mks_matched: number;
  mks_created: number;
  warnings: string[];
  uploaded_by_email: string | null;
  created_at: string;
}

export interface ImportDetail {
  import: ImportSummary;
  sample_rows: MkExpense[];
}

export async function previewExpenseImport(file: File): Promise<PreviewResult> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post('/admin/expense-imports/preview', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function commitExpenseImport(file: File): Promise<CommitResult> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post('/admin/expense-imports', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function listExpenseImports(): Promise<ImportSummary[]> {
  const { data } = await api.get('/admin/expense-imports');
  return data.data;
}

export async function getExpenseImport(id: string): Promise<ImportDetail> {
  const { data } = await api.get(`/admin/expense-imports/${id}`);
  return data;
}

export async function deleteExpenseImport(id: string): Promise<void> {
  await api.delete(`/admin/expense-imports/${id}`);
}
