import { api } from './client';
import type { DiarySource } from './sources';

// ── Discovery ──

export interface DiscoveredResource {
  id: string;
  name: string;
  format: string;
  size: number | null;
  datastore_active: boolean;
  url: string;
  importable: boolean;
  importMethod: 'datastore' | 'file_download';
  status: 'synced' | 'excepted' | 'available';
}

export interface DiscoveredDataset {
  id: string;
  title: string;
  organization: string | null;
  resources: DiscoveredResource[];
}

export interface DiscoverResponse {
  datasets: DiscoveredDataset[];
  totalDatasets: number;
  totalResources: number;
  supportedFormats: string[];
}

export async function discoverDatasets(query?: string): Promise<DiscoverResponse> {
  const { data } = await api.get('/admin/sync/discover', {
    params: query ? { q: query } : undefined,
  });
  return data;
}

// ── Profiling ──

export interface FieldMapping {
  title: string;
  start_date: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  location?: string;
  participants?: string;
  organizer?: string;
  notes?: string;
}

export interface ProfileResponse {
  resource: {
    id: string;
    name: string;
    format: string;
    url: string;
    package_id: string;
  };
  package: {
    id: string;
    title: string;
    organization?: { title: string } | null;
  };
  sample_records: Record<string, unknown>[];
  fields: string[];
  total_records: number;
  format: string;
  fetch_method: 'datastore' | 'file_download';
  suggested_mapping: FieldMapping;
  mapping_method: 'llm' | 'heuristic' | 'manual';
  mapping_confidence: number;
  unmapped_fields: string[];
  suggested_name: string;
  is_duplicate: boolean;
  existing_source_id?: string;
}

export async function profileResource(resourceId: string): Promise<ProfileResponse> {
  const { data } = await api.post('/admin/sync/profile', { resource_id: resourceId });
  return data;
}

// ── Import ──

export interface ImportRequest {
  resource_id: string;
  dataset_id: string;
  name: string;
  color: string;
  field_mapping: FieldMapping;
  person_id?: string | null;
  organization_id?: string | null;
}

export interface ImportResponse {
  source_id: string;
  message: string;
}

export async function importResource(data: ImportRequest): Promise<ImportResponse> {
  const { data: resp } = await api.post('/admin/sync/import', data);
  return resp;
}

// ── Sync Status ──

export interface SyncStatusResponse {
  source: {
    id: string;
    name: string;
    sync_status: string;
    sync_error: string | null;
    total_events: number;
    last_sync_at: string | null;
  };
  latest_sync_log: {
    id: string;
    status: string;
    records_fetched: number;
    records_created: number;
    records_skipped: number;
    duration_ms: number;
    started_at: string;
    completed_at: string | null;
    error_message: string | null;
  } | null;
}

export async function getSyncStatus(sourceId: string): Promise<SyncStatusResponse> {
  const { data } = await api.get(`/admin/sync/status/${sourceId}`);
  return data;
}

export async function resyncSource(sourceId: string): Promise<{ source_id: string; message: string }> {
  const { data } = await api.post(`/admin/sync/resync/${sourceId}`);
  return data;
}

// ── Admin Sources ──

export async function getAdminSources(): Promise<{ data: DiarySource[] }> {
  const { data } = await api.get('/admin/sources');
  return data;
}

export async function deleteSource(sourceId: string): Promise<{ deleted: boolean; events_deleted: number }> {
  const { data } = await api.delete(`/admin/sources/${sourceId}`);
  return data;
}

export async function updateSource(
  sourceId: string,
  update: { name?: string; color?: string; is_enabled?: boolean }
): Promise<DiarySource> {
  const { data } = await api.patch(`/admin/sources/${sourceId}`, update);
  return data;
}
