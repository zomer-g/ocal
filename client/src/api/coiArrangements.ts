import { api } from './client';

export type CoiOrigin = 'odata' | 'gov_il_zip';

export interface CoiArrangement {
  id: string;
  origin: CoiOrigin;
  subject_name_raw: string;
  title: string;
  document_date: string | null;
  source_url: string | null;
  filename: string;
  mime_type?: string;
  file_size: number;
  file_hash?: string;
  import_batch_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at?: string;
  person_id: string | null;
  person_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  reviewed_by_email?: string | null;
}

export interface CoiListParams {
  origin?: CoiOrigin;
  person_id?: string;
  reviewed?: 'true' | 'false';
  q?: string;
  page?: number;
  per_page?: number;
}

export async function listCoiArrangements(params: CoiListParams = {}): Promise<{
  data: CoiArrangement[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}> {
  const { data } = await api.get('/admin/coi-arrangements', { params });
  return data;
}

export async function getCoiArrangement(id: string): Promise<CoiArrangement> {
  const { data } = await api.get(`/admin/coi-arrangements/${id}`);
  return data;
}

export function coiArrangementFileUrl(id: string): string {
  return `/api/admin/coi-arrangements/${id}/file`;
}

export async function updateCoiArrangement(
  id: string,
  patch: Partial<{
    title: string;
    subject_name_raw: string;
    document_date: string | null;
    person_id: string | null;
    organization_id: string | null;
    source_url: string | null;
  }>,
): Promise<CoiArrangement> {
  const { data } = await api.patch(`/admin/coi-arrangements/${id}`, patch);
  return data;
}

export async function reviewCoiArrangement(id: string, notes?: string): Promise<{ id: string; reviewed_at: string }> {
  const { data } = await api.post(`/admin/coi-arrangements/${id}/review`, notes ? { notes } : {});
  return data;
}

export async function unreviewCoiArrangement(id: string): Promise<void> {
  await api.post(`/admin/coi-arrangements/${id}/unreview`);
}

export async function deleteCoiArrangement(id: string): Promise<void> {
  await api.delete(`/admin/coi-arrangements/${id}`);
}

// ── COI imports ──

export interface CoiDiscoveryResource {
  id: string;
  name: string;
  format: string;
  size: number | null;
  url: string;
  odata_url: string;
  importable: boolean;
  status: 'imported' | 'available';
  imported_arrangement_id?: string;
}

export interface CoiDiscoveryDataset {
  id: string;
  title: string;
  organization: string | null;
  odata_url: string;
  resources: CoiDiscoveryResource[];
}

export interface CoiDiscoverResponse {
  query: string;
  datasets: CoiDiscoveryDataset[];
  total_datasets: number;
  total_resources: number;
}

export async function discoverCoiResources(): Promise<CoiDiscoverResponse> {
  const { data } = await api.get('/admin/coi-imports/discover');
  return data;
}

export async function importCoiFromOdata(input: {
  resource_id: string;
  package_id: string;
}): Promise<{ id: string; subject: string; match_kind: string }> {
  const { data } = await api.post('/admin/coi-imports/odata', input);
  return data;
}

export async function importCoiFromZip(file: File): Promise<{
  batch_id: string;
  created: number;
  matched_people: number;
  created_people: number;
  warnings: string[];
}> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post('/admin/coi-imports/zip', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
