import { api } from './client';

export interface EventSearchParams {
  q?: string;
  from_date?: string;
  to_date?: string;
  source_ids?: string;
  entity_names?: string;
  location?: string;
  participants?: string;
  page?: number;
  per_page?: number;
  sort?: 'date_asc' | 'date_desc' | 'relevance';
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
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
  event_date: string;
  source_name?: string;
  source_color?: string;
}

export interface EventSearchResponse {
  data: DiaryEvent[];
  pagination: PaginationMeta;
}

export async function searchEvents(params: EventSearchParams): Promise<EventSearchResponse> {
  const { data } = await api.get('/public/events', { params });
  return data;
}

export async function getEvent(id: string): Promise<DiaryEvent> {
  const { data } = await api.get(`/public/events/${id}`);
  return data;
}

// ── Public Entities ──

export interface PublicEntity {
  entity_name: string;
  entity_type: 'person' | 'organization' | 'place';
  entity_id: string | null;
  event_count: number;
}

export async function getPublicEntities(sourceIds?: string[]): Promise<{ data: PublicEntity[] }> {
  const params: Record<string, string> = {};
  if (sourceIds?.length) params.source_ids = sourceIds.join(',');
  const { data } = await api.get('/public/entities', { params });
  return data;
}
