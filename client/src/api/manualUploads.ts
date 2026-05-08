import { api } from './client';

export type LLMProvider = 'claude' | 'gpt4o';
export type EventProvider = LLMProvider | 'manual';

export type ExtractionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface DraftEvent {
  title: string;
  start_time: string; // ISO 8601
  end_time?: string | null;
  location?: string | null;
  participants?: string | null;
  notes?: string | null;
  source_page?: number | null;
  provider?: EventProvider;
}

export interface ManualUploadSummary {
  id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  source_id: string | null;
  extraction_status: ExtractionStatus;
  extraction_provider: LLMProvider | null;
  committed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManualUpload extends ManualUploadSummary {
  extraction_result: {
    events: DraftEvent[];
    raw_response?: unknown;
    tokens_used?: number;
    provider: LLMProvider;
  } | null;
  extraction_error: string | null;
  draft_events: DraftEvent[];
}

export interface ExtractResponse {
  provider: LLMProvider;
  events: DraftEvent[];
  tokens_used?: number;
  event_count: number;
  raw_text_preview?: string | null;
}

export interface CommitBody {
  source_id?: string;
  source?: {
    name: string;
    color: string;
    person_id?: string | null;
    organization_id?: string | null;
    dataset_link?: string | null;
  };
  events: DraftEvent[];
  run_entity_extraction?: boolean;
}

export interface CommitResponse {
  source_id: string;
  events_inserted: number;
  entity_extraction_queued: boolean;
}

export async function uploadPdf(file: File): Promise<ManualUploadSummary> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post('/admin/manual-uploads', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function listManualUploads(): Promise<ManualUploadSummary[]> {
  const { data } = await api.get('/admin/manual-uploads');
  return data.data;
}

export async function getManualUpload(id: string): Promise<ManualUpload> {
  const { data } = await api.get(`/admin/manual-uploads/${id}`);
  return data;
}

export function manualUploadFileUrl(id: string): string {
  return `/api/admin/manual-uploads/${id}/file`;
}

/**
 * Extract events from the uploaded PDF via the chosen LLM.
 * Pass `page` to scope extraction to a single page (1-based); omit for the
 * whole document.
 */
export async function extractFromPdf(
  id: string,
  provider: LLMProvider,
  page?: number,
): Promise<ExtractResponse> {
  const { data } = await api.post(`/admin/manual-uploads/${id}/extract`, undefined, {
    params: page ? { provider, page } : { provider },
  });
  return data;
}

export async function saveDraftEvents(id: string, events: DraftEvent[]): Promise<{ saved: boolean; count: number }> {
  const { data } = await api.patch(`/admin/manual-uploads/${id}/draft-events`, {
    draft_events: events,
  });
  return data;
}

export async function commitManualUpload(id: string, body: CommitBody): Promise<CommitResponse> {
  const { data } = await api.post(`/admin/manual-uploads/${id}/commit`, body);
  return data;
}

export async function deleteManualUpload(id: string): Promise<void> {
  await api.delete(`/admin/manual-uploads/${id}`);
}
