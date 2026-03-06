import type { DiaryEvent, DiarySource } from './models';

// Pagination
export interface PaginationParams {
  page?: number;
  per_page?: number;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// Events search
export interface EventSearchParams extends PaginationParams {
  q?: string;
  from_date?: string;
  to_date?: string;
  source_ids?: string;
  location?: string;
  participants?: string;
  sort?: 'date_asc' | 'date_desc' | 'relevance';
}

export interface EventSearchResponse extends PaginatedResponse<DiaryEvent> {
  facets?: {
    sources: Array<{ id: string; name: string; count: number }>;
  };
}

// Calendar
export interface CalendarParams {
  date: string;
  view: 'month' | 'week' | 'day';
  source_ids?: string;
}

export interface CalendarResponse {
  events: DiaryEvent[];
  date_range: { from: string; to: string };
  event_counts: Record<string, number>;
}

// Sources
export interface SourcesResponse {
  data: DiarySource[];
}

// Sync
export interface SyncPreviewRequest {
  resource_id: string;
  dataset_id: string;
}

export interface SyncPreviewResponse {
  sample_records: Record<string, unknown>[];
  fields: string[];
  suggested_mapping: import('./models').FieldMapping;
  mapping_method: 'llm' | 'heuristic';
  total_records: number;
  duplicate_check: {
    is_duplicate: boolean;
    existing_source_id?: string;
  };
}

export interface SyncStartRequest {
  resource_id: string;
  dataset_id: string;
  field_mapping: import('./models').FieldMapping;
  person_id?: string;
  organization_id?: string;
  name: string;
  color: string;
}

export interface SyncStartResponse {
  job_id: string;
  source_id: string;
}

export interface SyncStatusResponse {
  job_id: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  progress?: {
    fetched: number;
    total: number;
    percentage: number;
  };
  error?: string;
}

// Auth
export interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    picture_url: string | null;
  };
}

// API Error
export interface ApiError {
  error: string;
  details?: unknown;
}
