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
  odata_url: string;
}

export interface DiscoveredDataset {
  id: string;
  title: string;
  organization: string | null;
  resources: DiscoveredResource[];
  odata_url: string;
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
  odata_dataset_url: string;
  odata_resource_url: string;
  sheet_name?: string;
  available_sheets?: Array<{ name: string; columns: number; rows: number }>;
}

export async function profileResource(resourceId: string, sheetName?: string): Promise<ProfileResponse> {
  const { data } = await api.post('/admin/sync/profile', {
    resource_id: resourceId,
    ...(sheetName ? { sheet_name: sheetName } : {}),
  });
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
  sheet_name?: string;
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
  update: { name?: string; color?: string; is_enabled?: boolean; person_id?: string | null; organization_id?: string | null }
): Promise<DiarySource> {
  const { data } = await api.patch(`/admin/sources/${sourceId}`, update);
  return data;
}

export async function deduplicateSource(sourceId: string): Promise<{ deleted: number; message: string }> {
  const { data } = await api.post(`/admin/sources/${sourceId}/deduplicate`);
  return data;
}

// ── People ──

export interface Person {
  id: string;
  name: string;
  wikipedia_link: string | null;
  notes: string | null;
  organization_id: string | null;
  organization_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonInput {
  name: string;
  wikipedia_link?: string | null;
  notes?: string | null;
  organization_id?: string | null;
}

export async function getPeople(): Promise<{ data: Person[] }> {
  const { data } = await api.get('/admin/people');
  return data;
}

export async function createPerson(input: PersonInput): Promise<Person> {
  const { data } = await api.post('/admin/people', input);
  return data;
}

export async function updatePerson(id: string, input: Partial<PersonInput>): Promise<Person> {
  const { data } = await api.patch(`/admin/people/${id}`, input);
  return data;
}

export async function deletePerson(id: string): Promise<void> {
  await api.delete(`/admin/people/${id}`);
}

export async function bulkImportPeople(
  rows: Array<{ name: string; wikipedia_link?: string; notes?: string; organization_name?: string }>
): Promise<{ created: number; updated: number; errors: string[] }> {
  const { data } = await api.post('/admin/people/bulk-import', { rows });
  return data;
}

// ── Organizations ──

export interface Organization {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInput {
  name: string;
  website?: string | null;
  description?: string | null;
}

export async function getOrganizations(): Promise<{ data: Organization[] }> {
  const { data } = await api.get('/admin/organizations');
  return data;
}

export async function createOrganization(input: OrganizationInput): Promise<Organization> {
  const { data } = await api.post('/admin/organizations', input);
  return data;
}

export async function updateOrganization(id: string, input: Partial<OrganizationInput>): Promise<Organization> {
  const { data } = await api.patch(`/admin/organizations/${id}`, input);
  return data;
}

export async function deleteOrganization(id: string): Promise<void> {
  await api.delete(`/admin/organizations/${id}`);
}

// ── Entity Extraction ──

export interface EntityItem {
  id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  entity_type: 'person' | 'organization' | 'place';
  entity_id: string | null;
  entity_name: string;
  role: 'owner' | 'participant' | 'location' | 'mentioned';
  raw_mention: string | null;
  confidence: number;
  extraction_method: 'owner' | 'participant_parse' | 'ai_ner';
  created_at: string;
}

export interface EntityStats {
  total: number;
  by_type: { person: number; organization: number; place: number };
  by_method: { owner: number; participant_parse: number; ai_ner: number };
  matched: number;
  unmatched: number;
}

export interface EntityListResponse {
  data: EntityItem[];
  total: number;
  page: number;
  limit: number;
  stats: EntityStats;
}

export async function triggerEntityExtraction(
  sourceId: string,
  options: { skip_ai?: boolean; clear_existing?: boolean } = {}
): Promise<{ source_id: string; message: string; events_processed: number; entities_inserted: number; errors: string[] }> {
  const { data } = await api.post(`/admin/sources/${sourceId}/extract-entities`, options);
  return data;
}

export async function getSourceEntities(
  sourceId: string,
  params: { page?: number; limit?: number; type?: string; role?: string; matched_only?: boolean } = {}
): Promise<EntityListResponse> {
  const { data } = await api.get(`/admin/sources/${sourceId}/entities`, { params });
  return data;
}

// ── Entity Rename & Merge ──

export async function renameEntity(entityId: string, newName: string): Promise<EntityItem> {
  const { data } = await api.patch(`/admin/sources/entities/${entityId}/rename`, { new_name: newName });
  return data;
}

export async function mergeEntities(
  sourceEntityIds: string[],
  targetName: string,
  targetEntityId?: string | null
): Promise<{ message: string; updated: number; duplicates_removed: number }> {
  const { data } = await api.post('/admin/sources/entities/merge', {
    source_entity_ids: sourceEntityIds,
    target_name: targetName,
    target_entity_id: targetEntityId,
  });
  return data;
}

export async function bulkRenameEntity(
  oldName: string,
  newName: string,
  entityType?: string
): Promise<{ message: string; updated: number }> {
  const { data } = await api.post('/admin/sources/entities/bulk-rename', {
    old_name: oldName,
    new_name: newName,
    entity_type: entityType,
  });
  return data;
}

// ── Global Entity Management ──

export interface GlobalEntity {
  entity_name: string;
  entity_type: 'person' | 'organization' | 'place';
  entity_id: string | null;
  event_count: number;
  source_count: number;
  max_confidence: number;
  methods: string;
}

export interface GlobalEntityStats {
  total_unique: number;
  person: number;
  organization: number;
  place: number;
}

export interface GlobalEntityListResponse {
  data: GlobalEntity[];
  total: number;
  page: number;
  limit: number;
  stats: GlobalEntityStats;
}

export async function getGlobalEntities(
  params: { type?: string; search?: string; page?: number; limit?: number } = {}
): Promise<GlobalEntityListResponse> {
  const { data } = await api.get('/admin/entities', { params });
  return data;
}

export async function deleteEntityByName(
  entityName: string,
  entityType: string
): Promise<{ message: string; deleted: number }> {
  const { data } = await api.delete('/admin/entities/by-name', {
    data: { entity_name: entityName, entity_type: entityType },
  });
  return data;
}

export async function globalBulkRenameEntity(
  oldName: string,
  newName: string,
  entityType?: string
): Promise<{ message: string; updated: number }> {
  const { data } = await api.post('/admin/entities/bulk-rename', {
    old_name: oldName,
    new_name: newName,
    entity_type: entityType,
  });
  return data;
}

export async function globalMergeEntities(
  sourceNames: Array<{ name: string; type: string }>,
  targetName: string
): Promise<{ message: string; updated: number; duplicates_removed: number }> {
  const { data } = await api.post('/admin/entities/merge', {
    source_names: sourceNames,
    target_name: targetName,
  });
  return data;
}
