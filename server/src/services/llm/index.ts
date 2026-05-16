/**
 * Provider-agnostic interface for extracting diary events from a PDF.
 *
 * The route layer calls extractDiaryFromPdf(pdfBuffer, provider). Each
 * provider module returns the same shape so the rest of the system
 * (storage, UI rendering, commit path) stays provider-blind.
 *
 * Existing LLM call sites in services/fieldMapper.ts and
 * services/entityExtractor.ts are intentionally NOT touched — they keep
 * their own raw axios calls. Consolidation is out of scope for this feature.
 */

import { extractWithClaude } from './claude.js';
import { extractWithOpenAI } from './openai.js';

export type LLMProvider = 'claude' | 'gpt4o';
export type ExtractMode = 'auto' | 'native' | 'raster';

export interface ExtractedEvent {
  title: string;
  start_time: string;       // ISO 8601 with TZ offset
  end_time?: string;
  location?: string;
  participants?: string;
  notes?: string;
  confidence?: number;      // 0..1
  source_page?: number;
}

/**
 * Surfaces *why* an extraction returned the events (or didn't). The route
 * forwards this verbatim to the UI so the admin can see whether the file was
 * treated as scanned, whether output was truncated, etc.
 */
export interface ExtractDiagnostics {
  /** Provider-specific stop reason — 'end_turn' | 'max_tokens' | 'tool_use' (claude) | 'stop' | 'length' (openai). */
  stop_reason?: string;
  /** True iff stop_reason indicates output was cut off. */
  truncated: boolean;
  /** Which content path was used by the provider this run. */
  used_path: 'native' | 'raster';
  /** Did the input PDF appear to have a usable text layer? (null if not checked) */
  text_layer_detected: boolean | null;
  /** Page numbers actually sent to the model (helpful when raster path truncates). */
  sent_pages?: number[];
  /** Hard-cap truncation: total pages exceeded the per-call page limit. */
  page_limited?: boolean;
  /** Whether tool-use returned a structured payload (false → text-parse fallback). */
  tool_use_succeeded?: boolean;
}

export interface ExtractResult {
  events: ExtractedEvent[];
  raw_response: unknown;    // For debugging / replay; stored in extraction_result
  tokens_used?: number;
  provider: LLMProvider;
  diagnostics: ExtractDiagnostics;
}

export class LLMNotConfiguredError extends Error {
  constructor(provider: LLMProvider) {
    super(`LLM provider "${provider}" is not configured (missing API key)`);
    this.name = 'LLMNotConfiguredError';
  }
}

export interface ExtractOptions {
  /** 1-based page number; if set, only this page is sent to the LLM. */
  page?: number;
  /** Inclusive page range (1-based). Used by chunked extraction. */
  range?: { from: number; to: number };
  /**
   * Provider content path:
   *  - 'native': send the PDF as a document/document-equivalent block.
   *  - 'raster': pre-rasterize pages to PNG images and send as image blocks.
   *  - 'auto'  : detect scanned-vs-vectored and pick 'raster' or 'native'.
   *
   * OpenAI is always rasterized (its API can't take PDFs directly), so it
   * ignores this option.
   */
  mode?: ExtractMode;
}

export async function extractDiaryFromPdf(
  pdfBuffer: Buffer,
  provider: LLMProvider,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  if (provider === 'claude') return extractWithClaude(pdfBuffer, opts);
  if (provider === 'gpt4o') return extractWithOpenAI(pdfBuffer, opts);
  throw new Error(`Unknown LLM provider: ${provider}`);
}
