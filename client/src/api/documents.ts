import { api } from './client';

export type DocumentKind =
  | 'manual_diary_upload'
  | 'mk_expense_import'
  | 'diary_source'
  | 'coi_arrangement';

export type DocumentOrigin = 'odata' | 'gov_il_zip' | 'ckan' | 'manual_upload';

export interface AdminDocumentRow {
  kind: DocumentKind;
  origin: DocumentOrigin | null;
  id: string;
  title: string;
  file_size: number | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export interface DocumentListParams {
  kind?: DocumentKind;
  origin?: DocumentOrigin;
  reviewed?: 'true' | 'false';
  q?: string;
  page?: number;
  per_page?: number;
}

export async function listDocuments(params: DocumentListParams = {}): Promise<{
  data: AdminDocumentRow[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}> {
  const { data } = await api.get('/admin/documents', { params });
  return data;
}
