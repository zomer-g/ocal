/**
 * OpenAI path: GPT-4o doesn't accept PDF input directly, so we rasterize each
 * page to PNG and pass the page images as `image_url` content. JSON shape is
 * enforced via `response_format: { type: 'json_schema', strict: true }` —
 * eliminating "markdown fences" and "model wrote prose" failure modes.
 *
 * The rasterizer is shared with the Claude raster path (services/llm/rasterize.ts).
 */

import axios from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  LLMNotConfiguredError,
  type ExtractOptions,
  type ExtractResult,
  type ExtractDiagnostics,
} from './index.js';
import { PDF_EXTRACTION_SYSTEM, PDF_EXTRACTION_USER } from './prompt.js';
import { parseEventsJson } from './claude.js';
import { rasterizePdfToDataUrls } from './rasterize.js';
import { EVENTS_SCHEMA_OPENAI_STRICT } from './schema.js';

const MAX_OUTPUT_TOKENS = 16384;

export async function extractWithOpenAI(
  pdfBuffer: Buffer,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  const apiKey = env.OPENAI_VISION_KEY || env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LLMNotConfiguredError('gpt4o');
  }

  const rasterReport = await rasterizePdfToDataUrls(pdfBuffer, {
    page: opts.page,
    range: opts.range,
    maxPages: 20,
  });
  const { dataUrls, pageNumbers, truncated: pageLimited } = rasterReport;
  const pageList = pageNumbers.join(', ');

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: env.OPENAI_VISION_MODEL,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'diary_events',
          strict: true,
          schema: EVENTS_SCHEMA_OPENAI_STRICT,
        },
      },
      messages: [
        { role: 'system', content: PDF_EXTRACTION_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: PDF_EXTRACTION_USER },
            ...dataUrls.map((dataUrl) => ({
              type: 'image_url' as const,
              image_url: { url: dataUrl, detail: 'high' as const },
            })),
            {
              type: 'text',
              text: `(התמונות לעיל הן עמודי ה-PDF, לפי הסדר. מספרי העמודים: ${pageList}. השתמש במספר העמוד המקורי בשדה source_page.)`,
            },
          ],
        },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 180_000,
    },
  );

  const choice = response.data?.choices?.[0];
  const content = choice?.message?.content;
  const finishReason = choice?.finish_reason as string | undefined;
  if (typeof content !== 'string') {
    throw new Error('GPT-4o response missing content');
  }

  let events = parseEventsJson(content, 'gpt4o');

  // The model is told the real page numbers, but if it returned 1..N (ignoring
  // the hint), remap conservatively to the actual sent page list.
  events = events.map((e) => {
    if (
      typeof e.source_page === 'number' &&
      e.source_page >= 1 &&
      e.source_page <= pageNumbers.length &&
      !pageNumbers.includes(e.source_page)
    ) {
      return { ...e, source_page: pageNumbers[e.source_page - 1] };
    }
    return e;
  });

  const diagnostics: ExtractDiagnostics = {
    stop_reason: finishReason,
    truncated: finishReason === 'length',
    used_path: 'raster',
    text_layer_detected: null,
    sent_pages: pageNumbers,
    page_limited: pageLimited,
    tool_use_succeeded: true, // json_schema strict is the structured-output equivalent
  };

  logger.info(
    {
      provider: 'gpt4o',
      model: env.OPENAI_VISION_MODEL,
      eventCount: events.length,
      sentPages: pageNumbers,
      page_limited: pageLimited,
      finish_reason: finishReason,
    },
    'GPT-4o PDF extraction parsed',
  );

  return {
    events,
    raw_response: { ...response.data, text: content, diagnostics },
    tokens_used: response.data?.usage?.total_tokens,
    provider: 'gpt4o',
    diagnostics,
  };
}
