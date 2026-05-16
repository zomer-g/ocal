/**
 * Shared PDF rasterization utilities used by both Claude (image content blocks)
 * and OpenAI (image_url content blocks) extraction paths.
 *
 * Approach: pdfjs-dist renders each page to a virtual canvas (via @napi-rs/canvas)
 * at a high DPI, then encodes to PNG. We cap the long edge at MAX_LONG_EDGE so
 * Anthropic's 5MB-per-image limit can't be tripped by very large pages, and we
 * cap total pages per call at MAX_PAGES.
 *
 * Also exposes `pdfHasTextLayer` — a heuristic that distinguishes a scanned
 * (image-only) PDF from a vectored one by sampling the first page's text layer.
 * Used by the Claude provider's auto-mode dispatcher.
 */

import { logger } from '../../utils/logger.js';

const DEFAULT_MAX_PAGES = 20;
const DEFAULT_RENDER_SCALE = 2; // DPI multiplier for legibility
const MAX_LONG_EDGE = 2048;     // px — Anthropic-recommended cap for vision

export interface RasterizeOptions {
  /** 1-based page; if set, only this page is rasterized. */
  page?: number;
  /** 1-based inclusive range [from, to]; ignored if `page` is set. */
  range?: { from: number; to: number };
  /** Hard cap on number of pages (default 20). Ignored when `page`/`range` set. */
  maxPages?: number;
  /** Render scale (default 2). Auto-reduced if a page would exceed MAX_LONG_EDGE. */
  scale?: number;
}

export interface RasterizedPage {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
}

export interface RasterizeReport {
  pages: RasterizedPage[];
  totalPagesInPdf: number;
  truncated: boolean; // true if we cut off pages due to maxPages
}

/**
 * Render PDF pages to PNG buffers. Use this for Anthropic which wants
 * base64+media_type separately. Returns the report (pages + truncation flag).
 */
export async function rasterizePdfToPngBuffers(
  pdfBuffer: Buffer,
  opts: RasterizeOptions = {},
): Promise<RasterizeReport> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const pdf = await loadingTask.promise;

  const totalPages = pdf.numPages;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const baseScale = opts.scale ?? DEFAULT_RENDER_SCALE;

  let startPage: number;
  let endPage: number;
  if (opts.page) {
    if (opts.page < 1 || opts.page > totalPages) {
      throw new Error(`Page ${opts.page} out of range (PDF has ${totalPages} pages)`);
    }
    startPage = opts.page;
    endPage = opts.page;
  } else if (opts.range) {
    if (opts.range.from < 1 || opts.range.to > totalPages || opts.range.from > opts.range.to) {
      throw new Error(`Range [${opts.range.from}, ${opts.range.to}] out of range (PDF has ${totalPages} pages)`);
    }
    startPage = opts.range.from;
    endPage = opts.range.to;
  } else {
    startPage = 1;
    endPage = Math.min(totalPages, maxPages);
  }

  const pages: RasterizedPage[] = [];
  for (let i = startPage; i <= endPage; i++) {
    const page = await pdf.getPage(i);

    // Choose a scale that keeps the long edge at most MAX_LONG_EDGE
    const baseViewport = page.getViewport({ scale: 1 });
    const longEdge = Math.max(baseViewport.width, baseViewport.height);
    const scaleCap = MAX_LONG_EDGE / longEdge;
    const scale = Math.min(baseScale, scaleCap);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    } as Parameters<typeof page.render>[0]).promise;

    const png = await canvas.encode('png');
    pages.push({
      pageNumber: i,
      png: Buffer.from(png),
      width: viewport.width,
      height: viewport.height,
    });
    page.cleanup();
  }
  await pdf.destroy();

  const truncated = !opts.page && !opts.range && endPage < totalPages;
  if (truncated) {
    logger.warn(
      { totalPages, sentPages: endPage },
      'PDF rasterization truncated to maxPages',
    );
  }

  return { pages, totalPagesInPdf: totalPages, truncated };
}

/**
 * Same as `rasterizePdfToPngBuffers` but returns data URLs (data:image/png;base64,...)
 * for direct use as OpenAI `image_url` content.
 */
export async function rasterizePdfToDataUrls(
  pdfBuffer: Buffer,
  opts: RasterizeOptions = {},
): Promise<{ dataUrls: string[]; pageNumbers: number[]; totalPagesInPdf: number; truncated: boolean }> {
  const report = await rasterizePdfToPngBuffers(pdfBuffer, opts);
  return {
    dataUrls: report.pages.map((p) => `data:image/png;base64,${p.png.toString('base64')}`),
    pageNumbers: report.pages.map((p) => p.pageNumber),
    totalPagesInPdf: report.totalPagesInPdf,
    truncated: report.truncated,
  };
}

/**
 * Heuristic: does this PDF have a usable text layer, or is it image-only (scanned)?
 * Samples up to `samplePages` pages from the start and checks whether the
 * combined non-whitespace text length crosses a small threshold (30 chars).
 *
 * A scanned PDF typically returns 0 or a handful of glyph artifacts. A vectored
 * Hebrew PDF returns several hundred chars per page.
 */
export async function pdfHasTextLayer(pdfBuffer: Buffer, samplePages = 1): Promise<boolean> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const pdf = await loadingTask.promise;
  try {
    const pagesToSample = Math.min(samplePages, pdf.numPages);
    let combined = '';
    for (let i = 1; i <= pagesToSample; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // pdfjs's `items` is an array of { str, ... }
      const text = (content.items as Array<{ str?: string }>)
        .map((it) => (typeof it.str === 'string' ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, '');
      combined += text;
      page.cleanup();
      if (combined.length > 30) break;
    }
    return combined.length > 30;
  } finally {
    await pdf.destroy();
  }
}

export function pdfPageCount(pdfBuffer: Buffer): Promise<number> {
  return (async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      isEvalSupported: false,
      useSystemFonts: false,
    });
    const pdf = await loadingTask.promise;
    const n = pdf.numPages;
    await pdf.destroy();
    return n;
  })();
}
