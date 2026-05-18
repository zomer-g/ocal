/**
 * Source attribution helpers. Every MCP tool response should attach source URLs
 * so AI clients can show users where the data originated. Ocal data is *processed* —
 * we extract entities with AI, cross-reference across diaries, deduplicate, etc. —
 * so users must always be told the underlying source so they can verify.
 */

const OCAL_BASE_URL = 'https://ocal.org.il';

export interface ProvenanceNote {
  is_processed: boolean;
  description: string;
  upstream_source: string;
  presentation_url: string;
}

export const PROVENANCE: ProvenanceNote = {
  is_processed: true,
  description:
    'This is processed / enriched data. Raw calendar entries are ingested from the Israeli government CKAN open-data portal (data.gov.il / odata.org.il), then deduplicated, joined across diaries, and run through AI entity-extraction (NER) to identify people, organizations, and places mentioned in event text. Confidence scores and cross-references reflect those automated steps and may contain errors.',
  upstream_source: 'https://www.odata.org.il',
  presentation_url: OCAL_BASE_URL,
};

/**
 * Build a permalink to the Ocal search page filtered to a particular source
 * (and optionally a date range). This is the closest thing to a per-event URL
 * since the SPA doesn't have an /event/:id route.
 */
export function buildOcalSearchUrl(opts: {
  source_id?: string;
  from_date?: string;
  to_date?: string;
  q?: string;
}): string {
  const params = new URLSearchParams();
  if (opts.source_id) params.set('sources', opts.source_id);
  if (opts.from_date) params.set('from', opts.from_date);
  if (opts.to_date) params.set('to', opts.to_date);
  if (opts.q) params.set('q', opts.q);
  return `${OCAL_BASE_URL}/?${params.toString()}`;
}

/**
 * Source-level URLs collected from the diary_sources row.
 */
export interface SourceLinks {
  ocal_source_view: string;
  ckan_dataset?: string;
  ckan_resource?: string;
}

export function buildSourceLinks(source: {
  id: string;
  dataset_url?: string | null;
  resource_url?: string | null;
}): SourceLinks {
  return {
    ocal_source_view: buildOcalSearchUrl({ source_id: source.id }),
    ckan_dataset: source.dataset_url ?? undefined,
    ckan_resource: source.resource_url ?? undefined,
  };
}

/**
 * Event-level URLs. Falls back gracefully when source fields aren't joined.
 */
export interface EventLinks {
  ocal_view: string;
  ckan_resource?: string;
  ckan_dataset?: string;
}

export function buildEventLinks(event: {
  source_id: string;
  event_date?: string | Date | null;
  dataset_link?: string | null;
  source_dataset_url?: string | null;
  source_resource_url?: string | null;
}): EventLinks {
  const dateStr =
    event.event_date instanceof Date
      ? event.event_date.toISOString().slice(0, 10)
      : (event.event_date as string | null | undefined) ?? undefined;
  return {
    ocal_view: buildOcalSearchUrl({
      source_id: event.source_id,
      from_date: dateStr,
      to_date: dateStr,
    }),
    ckan_resource: event.source_resource_url ?? event.dataset_link ?? undefined,
    ckan_dataset: event.source_dataset_url ?? undefined,
  };
}
