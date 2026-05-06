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

export interface ExtractResult {
  events: ExtractedEvent[];
  raw_response: unknown;    // For debugging / replay; stored in extraction_result
  tokens_used?: number;
  provider: LLMProvider;
}

export class LLMNotConfiguredError extends Error {
  constructor(provider: LLMProvider) {
    super(`LLM provider "${provider}" is not configured (missing API key)`);
    this.name = 'LLMNotConfiguredError';
  }
}

export async function extractDiaryFromPdf(
  pdfBuffer: Buffer,
  provider: LLMProvider,
): Promise<ExtractResult> {
  if (provider === 'claude') return extractWithClaude(pdfBuffer);
  if (provider === 'gpt4o') return extractWithOpenAI(pdfBuffer);
  throw new Error(`Unknown LLM provider: ${provider}`);
}
