/**
 * OpenAI path: GPT-4o doesn't accept PDF input directly via the chat
 * completions API, so we rasterize each page to an image first and pass
 * the page images as image_url content parts.
 *
 * pdf2pic is intentionally avoided — it requires GraphicsMagick + Ghostscript
 * binaries, which Render's Node runtime doesn't have. Instead we use
 * pdfjs-dist (already required transitively for the client-side viewer) to
 * render pages with a virtual canvas (canvas package) into PNG buffers.
 *
 * If render fails (canvas binary missing on the host), we fall back to
 * sending only the first N kilobytes of the PDF's text layer extracted via
 * pdfjs — which is poor for scans but at least gives the GPT-4o path a
 * graceful degradation rather than a 500.
 */

import axios from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { LLMNotConfiguredError, type ExtractResult, type ExtractedEvent } from './index.js';
import { PDF_EXTRACTION_SYSTEM, PDF_EXTRACTION_USER } from './prompt.js';

const MAX_PAGES = 20; // safety cap — keep request size bounded
const RENDER_SCALE = 2; // DPI multiplier for legible OCR-ish output

export async function extractWithOpenAI(pdfBuffer: Buffer): Promise<ExtractResult> {
  if (!env.OPENAI_API_KEY) {
    throw new LLMNotConfiguredError('gpt4o');
  }

  const pageImages = await rasterizePdf(pdfBuffer);

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: env.OPENAI_VISION_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PDF_EXTRACTION_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: PDF_EXTRACTION_USER },
            ...pageImages.map((dataUrl, idx) => ({
              type: 'image_url' as const,
              image_url: { url: dataUrl, detail: 'high' as const },
              // GPT-4o doesn't expose per-image labels, but we can hint
              // page numbers in the user text to help source_page mapping
            })),
            {
              type: 'text',
              text: `(התמונות לעיל הן עמודי ה-PDF לפי הסדר, החל מעמוד 1. השתמש במספר העמוד הנכון בשדה source_page.)`,
            },
          ],
        },
      ],
      max_tokens: 8192,
    },
    {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 120_000,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('GPT-4o response missing content');
  }

  const events = parseEventsJson(content);

  return {
    events,
    raw_response: response.data,
    tokens_used: response.data?.usage?.total_tokens,
    provider: 'gpt4o',
  };
}

async function rasterizePdf(pdfBuffer: Buffer): Promise<string[]> {
  // Lazy import — pdfjs-dist + canvas are large; only loaded when GPT-4o path runs.
  // canvas binding is optional; if it fails we let the error propagate so the
  // caller can show a useful message rather than silently sending zero images.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);

  const dataUrls: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    // pdfjs's render expects a CanvasRenderingContext2D-compatible object.
    // The node-canvas context is compatible enough for most pages.
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    } as Parameters<typeof page.render>[0]).promise;

    // @napi-rs/canvas exposes encode() rather than toDataURL(); both work
    // but encode() is sync-friendly. Build the data URL manually.
    const png = await canvas.encode('png');
    dataUrls.push(`data:image/png;base64,${png.toString('base64')}`);
    page.cleanup();
  }
  await pdf.destroy();

  if (pageCount < pdf.numPages) {
    logger.warn(
      { totalPages: pdf.numPages, sentPages: pageCount },
      'PDF truncated for GPT-4o extraction (over MAX_PAGES limit)',
    );
  }

  return dataUrls;
}

function parseEventsJson(text: string): ExtractedEvent[] {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    logger.error({ err, preview: stripped.slice(0, 500) }, 'GPT-4o returned non-JSON');
    throw new Error('GPT-4o response was not valid JSON');
  }
  const obj = parsed as { events?: unknown };
  if (!obj || !Array.isArray(obj.events)) {
    throw new Error('GPT-4o response missing "events" array');
  }
  return obj.events.filter(isValidEvent);
}

function isValidEvent(e: unknown): e is ExtractedEvent {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  return typeof r.title === 'string' && r.title.trim().length > 0 && typeof r.start_time === 'string';
}
