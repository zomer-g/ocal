/**
 * Claude path: native PDF support via the document content block. The
 * Anthropic SDK accepts a base64-encoded PDF as a "document" — Claude
 * processes both vectored and scanned PDFs internally without an explicit
 * OCR step.
 *
 * For Hebrew SCANNED PDFs the native path is unreliable (Claude's internal
 * renderer + OCR struggles with noisy RTL Hebrew scans, and quietly returns
 * `{events: []}`). To recover that use case we also expose a `raster` path
 * that pre-rasterizes pages to PNG via pdfjs+canvas and sends them as image
 * content blocks — bypassing Claude's PDF parser and using its vision
 * directly, which is robust on Hebrew images.
 *
 * The `mode` option picks: 'auto' (default) detects scanned-vs-vectored and
 * dispatches, 'native' forces document-block, 'raster' forces images.
 *
 * Output is enforced via tool-use: we register a `submit_events` tool with a
 * JSON schema and force `tool_choice`, so the model returns a structured
 * payload — eliminating "the model emitted prose" and "the model wrote
 * markdown fences" failure modes.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  LLMNotConfiguredError,
  type ExtractOptions,
  type ExtractResult,
  type ExtractedEvent,
  type ExtractDiagnostics,
  type ExtractMode,
} from './index.js';
import { PDF_EXTRACTION_SYSTEM, PDF_EXTRACTION_USER } from './prompt.js';
import {
  EVENTS_SCHEMA,
  EVENTS_TOOL_NAME,
  EVENTS_TOOL_DESCRIPTION,
} from './schema.js';
import {
  pdfHasTextLayer,
  rasterizePdfToPngBuffers,
  pdfPageCount,
} from './rasterize.js';

const DEFAULT_MAX_OUTPUT_TOKENS = 16384;

function maxOutputTokens(): number {
  return env.ANTHROPIC_MAX_TOKENS ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Extract one page from a PDF buffer into a new single-page PDF buffer.
 * Used by the native path when the admin chooses "extract this page only".
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

async function slicePdfRange(pdfBuffer: Buffer, from: number, to: number): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(pdfBuffer);
  const total = src.getPageCount();
  if (from < 1 || to > total || from > to) {
    throw new Error(`Range [${from}, ${to}] out of range (PDF has ${total} pages)`);
  }
  const dest = await PDFDocument.create();
  const indices = [];
  for (let i = from - 1; i <= to - 1; i++) indices.push(i);
  const copied = await dest.copyPages(src, indices);
  copied.forEach((p) => dest.addPage(p));
  const bytes = await dest.save();
  return Buffer.from(bytes);
}

function buildClient(): Anthropic {
  const apiKey = env.ANTHROPIC_MODEL_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LLMNotConfiguredError('claude');
  return new Anthropic({ apiKey });
}

/** Tool spec shared by both content paths. */
const submitEventsTool: Anthropic.Tool = {
  name: EVENTS_TOOL_NAME,
  description: EVENTS_TOOL_DESCRIPTION,
  input_schema: EVENTS_SCHEMA as unknown as Anthropic.Tool['input_schema'],
};

export async function extractWithClaude(
  pdfBuffer: Buffer,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  const mode: ExtractMode = opts.mode ?? 'auto';
  let resolvedPath: 'native' | 'raster';
  let textLayerDetected: boolean | null = null;

  if (mode === 'native') {
    resolvedPath = 'native';
  } else if (mode === 'raster') {
    resolvedPath = 'raster';
  } else {
    // auto — sample the text layer
    try {
      textLayerDetected = await pdfHasTextLayer(pdfBuffer, 1);
    } catch (err) {
      logger.warn({ err }, 'Could not sample PDF text layer; defaulting to raster');
      textLayerDetected = false;
    }
    resolvedPath = textLayerDetected ? 'native' : 'raster';
  }

  if (resolvedPath === 'native') {
    return extractClaudeNative(pdfBuffer, opts, textLayerDetected);
  }
  return extractClaudeRaster(pdfBuffer, opts, textLayerDetected);
}

// ──────────────────────────────────────────────
// Native path (document content block)
// ──────────────────────────────────────────────
async function extractClaudeNative(
  pdfBuffer: Buffer,
  opts: ExtractOptions,
  textLayerDetected: boolean | null,
): Promise<ExtractResult> {
  const client = buildClient();

  let buffer = pdfBuffer;
  if (opts.page) {
    buffer = await slicePdfPage(pdfBuffer, opts.page);
  } else if (opts.range) {
    buffer = await slicePdfRange(pdfBuffer, opts.range.from, opts.range.to);
  }

  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: maxOutputTokens(),
    system: PDF_EXTRACTION_SYSTEM,
    tools: [submitEventsTool],
    tool_choice: { type: 'tool', name: EVENTS_TOOL_NAME },
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
          { type: 'text', text: PDF_EXTRACTION_USER },
        ],
      },
    ],
  });

  const { events, toolUseSucceeded, textPreview } = readEventsFromResponse(response);

  // Rewrite source_page when scoped to one page, since the model sees it as page 1.
  let finalEvents = events;
  if (opts.page) {
    finalEvents = events.map((e) => ({ ...e, source_page: opts.page }));
  } else if (opts.range) {
    // For a range, the model sees pages 1..N where N = range size. Best-effort
    // remap: if model returned page in [1..N], add (from-1); otherwise leave as is.
    const N = opts.range.to - opts.range.from + 1;
    finalEvents = events.map((e) => {
      if (typeof e.source_page === 'number' && e.source_page >= 1 && e.source_page <= N) {
        return { ...e, source_page: e.source_page + opts.range!.from - 1 };
      }
      return e;
    });
  }

  const diagnostics: ExtractDiagnostics = {
    stop_reason: response.stop_reason ?? undefined,
    truncated: response.stop_reason === 'max_tokens',
    used_path: 'native',
    text_layer_detected: textLayerDetected,
    tool_use_succeeded: toolUseSucceeded,
  };

  logger.info(
    {
      provider: 'claude',
      model: response.model,
      path: 'native',
      eventCount: finalEvents.length,
      page: opts.page,
      range: opts.range,
      stop: response.stop_reason,
      tool_use_succeeded: toolUseSucceeded,
    },
    'Claude PDF extraction (native) parsed',
  );

  return {
    events: finalEvents,
    raw_response: {
      id: response.id,
      model: response.model,
      content: response.content,
      usage: response.usage,
      stop_reason: response.stop_reason,
      text: textPreview,
      diagnostics,
    },
    tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    provider: 'claude',
    diagnostics,
  };
}

// ──────────────────────────────────────────────
// Raster path (image content blocks per page)
// ──────────────────────────────────────────────
async function extractClaudeRaster(
  pdfBuffer: Buffer,
  opts: ExtractOptions,
  textLayerDetected: boolean | null,
): Promise<ExtractResult> {
  const client = buildClient();

  const report = await rasterizePdfToPngBuffers(pdfBuffer, {
    page: opts.page,
    range: opts.range,
    // For raster we keep a tighter cap on full-doc extractions since we ship
    // raw image bytes rather than a compressed PDF.
    maxPages: 20,
  });

  if (report.pages.length === 0) {
    throw new Error('Rasterization returned 0 pages');
  }

  const imageBlocks: Anthropic.ImageBlockParam[] = report.pages.map((p) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: p.png.toString('base64'),
    },
  }));

  const pageList = report.pages.map((p) => p.pageNumber).join(', ');
  const pageHint = `(התמונות לעיל הן עמודי ה-PDF, לפי הסדר. מספרי העמודים: ${pageList}. השתמש במספר העמוד המקורי בשדה source_page.)`;

  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: maxOutputTokens(),
    system: PDF_EXTRACTION_SYSTEM,
    tools: [submitEventsTool],
    tool_choice: { type: 'tool', name: EVENTS_TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: pageHint },
          { type: 'text', text: PDF_EXTRACTION_USER },
        ],
      },
    ],
  });

  const { events, toolUseSucceeded, textPreview } = readEventsFromResponse(response);

  // The model is told the real page numbers, so we trust source_page as-is.
  // But if it ignored the hint and used 1..N, remap conservatively to the
  // corresponding sent page number.
  const sentPages = report.pages.map((p) => p.pageNumber);
  const finalEvents = events.map((e) => {
    if (
      typeof e.source_page === 'number' &&
      e.source_page >= 1 &&
      e.source_page <= sentPages.length &&
      !sentPages.includes(e.source_page) // model said "1" but we sent page 5 → remap
    ) {
      return { ...e, source_page: sentPages[e.source_page - 1] };
    }
    return e;
  });

  const diagnostics: ExtractDiagnostics = {
    stop_reason: response.stop_reason ?? undefined,
    truncated: response.stop_reason === 'max_tokens',
    used_path: 'raster',
    text_layer_detected: textLayerDetected,
    sent_pages: sentPages,
    page_limited: report.truncated,
    tool_use_succeeded: toolUseSucceeded,
  };

  logger.info(
    {
      provider: 'claude',
      model: response.model,
      path: 'raster',
      eventCount: finalEvents.length,
      sentPages,
      page_limited: report.truncated,
      stop: response.stop_reason,
      tool_use_succeeded: toolUseSucceeded,
    },
    'Claude PDF extraction (raster) parsed',
  );

  return {
    events: finalEvents,
    raw_response: {
      id: response.id,
      model: response.model,
      content: response.content,
      usage: response.usage,
      stop_reason: response.stop_reason,
      text: textPreview,
      diagnostics,
    },
    tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    provider: 'claude',
    diagnostics,
  };
}

// ──────────────────────────────────────────────
// Shared response parsing
// ──────────────────────────────────────────────

/**
 * Extract events from a Claude response. Prefer the `tool_use` block (our
 * forced tool_choice should make it the primary path). Fall back to text
 * parsing if the model unexpectedly returned plain text.
 */
function readEventsFromResponse(response: Anthropic.Message): {
  events: ExtractedEvent[];
  toolUseSucceeded: boolean;
  textPreview: string;
} {
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === EVENTS_TOOL_NAME,
  );

  if (toolUse) {
    const events = normalizeEvents((toolUse.input as { events?: unknown })?.events);
    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return {
      events,
      toolUseSucceeded: true,
      textPreview: textBlocks || `[tool_use:${EVENTS_TOOL_NAME}] ${JSON.stringify(toolUse.input).slice(0, 1500)}`,
    };
  }

  // Fallback: parse text blocks as JSON.
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  try {
    const events = parseEventsJson(text, 'claude');
    return { events, toolUseSucceeded: false, textPreview: text };
  } catch (err) {
    logger.warn({ err, preview: text.slice(0, 400) }, 'Claude returned no tool_use and text was not valid JSON');
    return { events: [], toolUseSucceeded: false, textPreview: text };
  }
}

function normalizeEvents(input: unknown): ExtractedEvent[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e): ExtractedEvent => ({
      title: typeof e.title === 'string' ? e.title : '',
      start_time:
        typeof e.start_time === 'string'
          ? e.start_time
          : typeof e.start === 'string'
          ? e.start
          : typeof e.datetime === 'string'
          ? e.datetime
          : '',
      end_time:
        typeof e.end_time === 'string' ? e.end_time : typeof e.end === 'string' ? e.end : undefined,
      location: typeof e.location === 'string' ? e.location : undefined,
      participants: typeof e.participants === 'string' ? e.participants : undefined,
      notes: typeof e.notes === 'string' ? e.notes : undefined,
      confidence: typeof e.confidence === 'number' ? e.confidence : undefined,
      source_page:
        typeof e.source_page === 'number'
          ? e.source_page
          : typeof e.page === 'number'
          ? e.page
          : undefined,
    }));
}

/**
 * Permissive text parser, kept as a fallback when tool-use is unavailable
 * (e.g. user pinned ANTHROPIC_MODEL to an older model). Coerces missing or
 * differently-named fields rather than dropping events.
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
  const arr: unknown = Array.isArray(obj?.events)
    ? obj.events
    : Array.isArray(obj?.event)
    ? obj.event
    : Array.isArray(parsed)
    ? parsed
    : null;

  if (!arr || !Array.isArray(arr)) {
    throw new Error(`${provider} response missing "events" array — got: ${stripped.slice(0, 200)}`);
  }
  return normalizeEvents(arr);
}

// Re-export for callers that count PDF pages elsewhere (e.g. batch route).
export { pdfPageCount };
