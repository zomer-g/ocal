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
  match_group_id?: string | null;
  source_name?: string;
  source_color?: string;
  match_count?: number | null;
  other_fields?: Record<string, unknown> | null;
  top_entities?: Array<{ name: string; type: string }> | null;
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

// ── Event Entities ──

export interface EventEntityDetail {
  entity_type: 'person' | 'organization' | 'place';
  entity_name: string;
  role: 'owner' | 'participant' | 'location' | 'mentioned';
  confidence: number;
  extraction_method: string;
}

export async function getEventEntities(eventId: string): Promise<{ data: EventEntityDetail[] }> {
  const { data } = await api.get(`/public/events/${eventId}/entities`);
  return data;
}

// ── Public Entities ──

export interface PublicEntity {
  entity_name: string;
  entity_type: 'person' | 'organization' | 'place';
  entity_id: string | null;
  event_count: number;
}

export async function getPublicEntities(
  sourceIds?: string[],
  fromDate?: string,
  toDate?: string,
): Promise<{ data: PublicEntity[] }> {
  const params: Record<string, string> = {};
  if (sourceIds?.length) params.source_ids = sourceIds.join(',');
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;
  const { data } = await api.get('/public/entities', { params });
  return data;
}

// ── Event Matches ──

export interface MatchedEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  participants: string | null;
  event_date: string;
  source_name: string;
  source_color: string;
}

export interface EventMatchesResponse {
  match_group: {
    id: string;
    event_date: string;
    common_title: string;
    total_events: number;
  } | null;
  matched_events: MatchedEvent[];
}

export async function getEventMatches(eventId: string): Promise<EventMatchesResponse> {
  const { data } = await api.get(`/public/events/${eventId}/matches`);
  return data;
}
