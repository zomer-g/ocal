import { api } from './client';

export interface CKANMetadata {
  datasetTitle?: string;
  resourceName?: string;
  resourceUrl?: string;
  datasetUrl?: string;
  organization?: string | null;
  lastModified?: string;
}

export interface DiarySource {
  id: string;
  name: string;
  color: string;
  is_enabled: boolean;
  total_events: number;
  first_event_date: string | null;
  last_event_date: string | null;
  last_sync_at: string | null;
  sync_error: string | null;
  person_name?: string;
  organization_name?: string;
  sync_status: string;
  dataset_url?: string;
  resource_url?: string;
  ckan_metadata?: CKANMetadata;
}

export async function getSources(): Promise<{ data: DiarySource[] }> {
  const { data } = await api.get('/public/sources');
  return data;
}

export async function getSource(id: string): Promise<DiarySource> {
  const { data } = await api.get(`/public/sources/${id}`);
  return data;
}

// ── Public stats ──

export interface PublicStats {
  total_events: number;
  total_sources: number;
  total_organizations: number;
}

export async function getStats(): Promise<PublicStats> {
  const { data } = await api.get('/public/stats');
  return data;
}
