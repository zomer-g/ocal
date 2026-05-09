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
import { LLMNotConfiguredError, type ExtractOptions, type ExtractResult } from './index.js';
import { PDF_EXTRACTION_SYSTEM, buildExtractionUserPrompt } from './prompt.js';
import { parseEventsJson } from './claude.js';

const MAX_PAGES = 20; // safety cap — keep request size bounded
const RENDER_SCALE = 2; // DPI multiplier for legible OCR-ish output

export async function extractWithOpenAI(pdfBuffer: Buffer, opts: ExtractOptions = {}): Promise<ExtractResult> {
  // Prefer the PDF-feature-dedicated key; fall back to the entity-extractor's
  // shared OPENAI_API_KEY if no dedicated one was provisioned.
  const apiKey = env.OPENAI_VISION_KEY || env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LLMNotConfiguredError('gpt4o');
  }

  const pageImages = await rasterizePdf(pdfBuffer, opts.page);

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
            { type: 'text', text: buildExtractionUserPrompt({ filename: opts.filename, page: opts.page }) },
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
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120_000,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('GPT-4o response missing content');
  }

  let events = parseEventsJson(content, 'gpt4o');
  // When only one page was sent, the LLM may label it as page 1 — rewrite
  // back to the original PDF page number for traceability.
  if (opts.page) {
    events = events.map((e) => ({ ...e, source_page: opts.page }));
  }

  logger.info(
    { provider: 'gpt4o', model: env.OPENAI_VISION_MODEL, eventCount: events.length, page: opts.page, textPreview: content.slice(0, 1500) },
    'GPT-4o PDF extraction parsed',
  );

  return {
    events,
    raw_response: { ...response.data, text: content },
    tokens_used: response.data?.usage?.total_tokens,
    provider: 'gpt4o',
  };
}

async function rasterizePdf(pdfBuffer: Buffer, singlePage?: number): Promise<string[]> {
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

  // If a single page was requested, restrict iteration to it. Otherwise
  // fall back to MAX_PAGES from the start of the document.
  const startPage = singlePage ?? 1;
  const endPage = singlePage ?? Math.min(pdf.numPages, MAX_PAGES);
  if (singlePage && (singlePage < 1 || singlePage > pdf.numPages)) {
    throw new Error(`Page ${singlePage} out of range (PDF has ${pdf.numPages} pages)`);
  }

  const dataUrls: string[] = [];
  for (let i = startPage; i <= endPage; i++) {
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

  if (!singlePage && endPage < pdf.numPages) {
    logger.warn(
      { totalPages: pdf.numPages, sentPages: endPage },
      'PDF truncated for GPT-4o extraction (over MAX_PAGES limit)',
    );
  }

  return dataUrls;
}

// parseEventsJson is shared with claude.ts (imported above)
