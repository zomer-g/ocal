/**
 * Claude path: native PDF support via the document content block. The
 * Anthropic SDK accepts a base64-encoded PDF as a "document" — Claude
 * processes both vectored and scanned PDFs internally without an explicit
 * OCR step. Best signal we have on Hebrew FOI scans.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { LLMNotConfiguredError, type ExtractOptions, type ExtractResult, type ExtractedEvent } from './index.js';
import { PDF_EXTRACTION_SYSTEM, PDF_EXTRACTION_USER } from './prompt.js';

const MAX_OUTPUT_TOKENS = 8192;

/**
 * Extract one page from a PDF buffer into a new single-page PDF buffer.
 * Used when the admin chooses "extract this page only" — keeps token cost
 * proportional to the visible page rather than the full document.
 */
async function slicePdfPage(pdfBuffer: Buffer, page: number): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(pdfBuffer);
  const total = src.getPageCount();
  if (page < 1 || page > total) {
    throw new Error(`Page ${page} out of range (PDF has ${total} pages)`);
  }
  const dest = await PDFDocument.create();
  const [copied] = await dest.copyPages(src, [page - 1]);
  dest.addPage(copied);
  const bytes = await dest.save();
  return Buffer.from(bytes);
}

export async function extractWithClaude(pdfBuffer: Buffer, opts: ExtractOptions = {}): Promise<ExtractResult> {
  // Prefer the PDF-feature-dedicated key; fall back to the canonical one.
  const apiKey = env.ANTHROPIC_MODEL_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LLMNotConfiguredError('claude');
  }

  // Slice down to one page if requested (cheaper + scoped extraction)
  let buffer = pdfBuffer;
  if (opts.page) {
    buffer = await slicePdfPage(pdfBuffer, opts.page);
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: PDF_EXTRACTION_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: buffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: PDF_EXTRACTION_USER,
          },
        ],
      },
    ],
  });

  // Concatenate all text blocks (Claude may return multiple)
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  let events = parseEventsJson(text, 'claude');

  // When only one page was sent, the LLM sees it as page 1 — rewrite that
  // back to the original page number so source_page stays meaningful.
  if (opts.page) {
    events = events.map((e) => ({ ...e, source_page: opts.page }));
  }

  logger.info(
    { provider: 'claude', model: response.model, eventCount: events.length, page: opts.page, textPreview: text.slice(0, 1500) },
    'Claude PDF extraction parsed',
  );

  return {
    events,
    raw_response: { id: response.id, model: response.model, content: response.content, usage: response.usage, text },
    tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    provider: 'claude',
  };
}

/**
 * Permissive parser — keeps every event-shaped object the LLM returned,
 * coercing missing/typed fields rather than dropping them. Earlier we
 * silently filtered out events without `title` or `start_time`, which
 * meant a half-correct LLM response surfaced as "0 results" with no
 * visible error. Better to show the partial events and let the admin fix
 * them in the editor.
 */
export function parseEventsJson(text: string, provider: string): ExtractedEvent[] {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    logger.error({ err, provider, preview: stripped.slice(0, 800) }, 'LLM returned non-JSON');
    throw new Error(`${provider} response was not valid JSON: ${stripped.slice(0, 200)}`);
  }

  const obj = parsed as { events?: unknown; event?: unknown };
  // Accept either {events:[...]} or {event:[...]} (some models singularize)
  const arr: unknown = Array.isArray(obj?.events) ? obj.events
    : Array.isArray(obj?.event) ? obj.event
    : Array.isArray(parsed) ? parsed
    : null;

  if (!arr || !Array.isArray(arr)) {
    throw new Error(`${provider} response missing "events" array — got: ${stripped.slice(0, 200)}`);
  }

  return (arr as unknown[])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e): ExtractedEvent => ({
      title: typeof e.title === 'string' ? e.title : '',
      start_time: typeof e.start_time === 'string' ? e.start_time
        : typeof e.start === 'string' ? e.start
        : typeof e.datetime === 'string' ? e.datetime
        : '',
      end_time: typeof e.end_time === 'string' ? e.end_time
        : typeof e.end === 'string' ? e.end
        : undefined,
      location: typeof e.location === 'string' ? e.location : undefined,
      participants: typeof e.participants === 'string' ? e.participants : undefined,
      notes: typeof e.notes === 'string' ? e.notes : undefined,
      confidence: typeof e.confidence === 'number' ? e.confidence : undefined,
      source_page: typeof e.source_page === 'number' ? e.source_page
        : typeof e.page === 'number' ? e.page
        : undefined,
    }));
}
