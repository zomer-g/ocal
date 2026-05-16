import { api } from './client';

export type LLMProvider = 'claude' | 'gpt4o';
export type EventProvider = LLMProvider | 'manual';
export type ExtractMode = 'auto' | 'native' | 'raster';

export type ExtractionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ExtractDiagnostics {
  stop_reason?: string;
  truncated: boolean;
  used_path: 'native' | 'raster';
  text_layer_detected: boolean | null;
  sent_pages?: number[];
  page_limited?: boolean;
  tool_use_succeeded?: boolean;
}

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
  diagnostics?: ExtractDiagnostics;
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
 * whole document. `mode` picks between native PDF passthrough, pre-rasterized
 * image content, or auto-detect.
 */
export async function extractFromPdf(
  id: string,
  provider: LLMProvider,
  opts?: { page?: number; mode?: ExtractMode },
): Promise<ExtractResponse> {
  const params: Record<string, string | number> = { provider };
  if (opts?.page) params.page = opts.page;
  if (opts?.mode) params.mode = opts.mode;
  const { data } = await api.post(`/admin/manual-uploads/${id}/extract`, undefined, { params });
  return data;
}

export interface BatchProgressEvent {
  type: 'init' | 'progress' | 'chunk_error' | 'done' | 'error';
  total_pages?: number;
  total_chunks?: number;
  chunk_size?: number;
  chunk_index?: number;
  range?: { from: number; to: number };
  events?: DraftEvent[];
  tokens_used?: number;
  diagnostics?: ExtractDiagnostics;
  total_events?: number;
  chunks_completed?: number;
  partial_failures?: Array<{ chunk_index: number; range: { from: number; to: number }; error: string }>;
  error?: string;
  message?: string;
}

/**
 * Stream chunked extraction of an entire PDF. Yields one `BatchProgressEvent`
 * per server message. The promise resolves when the stream terminates
 * (either a `done` or `error` event, or the connection closes).
 *
 * Uses fetch + ReadableStream rather than EventSource so we can POST and
 * carry the admin's session cookie.
 */
export async function extractBatchStream(
  id: string,
  params: { provider: LLMProvider; mode?: ExtractMode; chunk_size?: number },
  onEvent: (ev: BatchProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const qs = new URLSearchParams();
  qs.set('provider', params.provider);
  if (params.mode) qs.set('mode', params.mode);
  if (params.chunk_size) qs.set('chunk_size', String(params.chunk_size));

  const res = await fetch(`/api/admin/manual-uploads/${id}/extract-batch?${qs.toString()}`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'text/event-stream' },
    signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Batch extract failed (${res.status}): ${errText || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE: events delimited by \n\n
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      // each block may have one or more `data: ...` lines
      const dataLines = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());
      if (dataLines.length === 0) continue;
      const payload = dataLines.join('\n');
      try {
        const ev = JSON.parse(payload) as BatchProgressEvent;
        onEvent(ev);
      } catch {
        // ignore unparseable lines
      }
    }
  }
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
