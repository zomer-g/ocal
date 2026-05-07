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

  const events = parseEventsJson(text);

  return {
    events,
    raw_response: { id: response.id, model: response.model, content: response.content, usage: response.usage },
    tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    provider: 'claude',
  };
}

function parseEventsJson(text: string): ExtractedEvent[] {
  // Strip a markdown fence if Claude added one despite the system prompt
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    logger.error({ err, preview: stripped.slice(0, 500) }, 'Claude returned non-JSON');
    throw new Error('Claude response was not valid JSON');
  }

  const obj = parsed as { events?: unknown };
  if (!obj || !Array.isArray(obj.events)) {
    throw new Error('Claude response missing "events" array');
  }

  return obj.events.filter(isValidEvent);
}

function isValidEvent(e: unknown): e is ExtractedEvent {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  return typeof r.title === 'string' && r.title.trim().length > 0 && typeof r.start_time === 'string';
}
