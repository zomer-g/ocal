export interface Organization {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  name: string;
  wikipedia_link: string | null;
  notes: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiarySource {
  id: string;
  name: string;
  dataset_id: string;
  resource_id: string;
  dataset_url: string | null;
  resource_url: string | null;
  color: string;
  is_enabled: boolean;
  last_sync_at: string | null;
  sync_status: 'pending' | 'syncing' | 'completed' | 'failed';
  sync_error: string | null;
  total_events: number;
  first_event_date: string | null;
  last_event_date: string | null;
  person_id: string | null;
  organization_id: string | null;
  field_mapping: FieldMapping | null;
  ckan_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // Populated fields
  person_name?: string;
  organization_name?: string;
}

export interface DiaryEvent {
  id: string;
  source_id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  participants: string | null;
  dataset_name: string;
  dataset_link: string | null;
  is_active: boolean;
  other_fields: Record<string, unknown>;
  ckan_row_id: number | null;
  event_date: string;
  created_at: string;
  updated_at: string;
  // Populated fields
  source_name?: string;
  source_color?: string;
}

export interface DiaryException {
  id: string;
  dataset_title: string;
  resource_id: string;
  dataset_id: string | null;
  dataset_url: string | null;
  resource_format: string | null;
  resource_name: string | null;
  exception_reason: 'duplicate' | 'unsupported_format' | 'manual';
  moved_at: string;
  created_at: string;
}

export interface SimilarEvent {
  id: string;
  representative_event_id: string;
  event_date: string;
  common_title: string;
  grouped_event_ids: string[];
  total_events: number;
  involved_source_ids: string[];
  created_at: string;
}

export interface SyncLog {
  id: string;
  source_id: string;
  job_id: string | null;
  status: 'started' | 'in_progress' | 'completed' | 'failed';
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface FieldMapping {
  title: string;
  start_date: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  location?: string;
  participants?: string;
  organizer?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  google_id: string | null;
  last_login: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
