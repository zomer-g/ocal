/**
 * Claude path: native PDF support via the document content block. The
 * Anthropic SDK accepts a base64-encoded PDF as a "document" — Claude
 * processes both vectored and scanned PDFs internally without an explicit
 * OCR step. Best signal we have on Hebrew FOI scans.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { LLMNotConfiguredError, type ExtractResult, type ExtractedEvent } from './index.js';
import { PDF_EXTRACTION_SYSTEM, PDF_EXTRACTION_USER } from './prompt.js';

const MAX_OUTPUT_TOKENS = 8192;

export async function extractWithClaude(pdfBuffer: Buffer): Promise<ExtractResult> {
  // Prefer the PDF-feature-dedicated key; fall back to the canonical one.
  const apiKey = env.ANTHROPIC_MODEL_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LLMNotConfiguredError('claude');
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
              data: pdfBuffer.toString('base64'),
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

  const events = parseEventsJson(text, 'claude');

  logger.info(
    { provider: 'claude', model: response.model, eventCount: events.length, textPreview: text.slice(0, 1500) },
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
