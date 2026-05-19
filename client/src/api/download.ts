export function getSourceDownloadUrl(
  sourceId: string,
  format: 'csv' | 'json',
  opts?: { from_date?: string | null; to_date?: string | null },
): string {
  const params = new URLSearchParams({ format });
  if (opts?.from_date) params.set('from_date', opts.from_date);
  if (opts?.to_date) params.set('to_date', opts.to_date);
  return `/api/public/download/source/${sourceId}?${params.toString()}`;
}

/** Opens the download URL in a new tab — browser handles Content-Disposition filename. */
export function triggerDownload(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Bulk download of multiple sources via POST /api/public/download/bulk.
 *
 * Server returns a ZIP containing one CSV or JSON file per selected diary.
 * We use fetch() rather than window.open() because URL length caps make
 * GET with hundreds of UUIDs impractical, and because we want to surface
 * server errors to the caller instead of silently opening a tab.
 *
 * Returns the filename the server suggested (parsed from Content-Disposition)
 * so callers can show feedback. Throws on HTTP error.
 */
export async function bulkDownload(opts: {
  source_ids: string[];
  format: 'csv' | 'json';
  from_date?: string | null;
  to_date?: string | null;
  signal?: AbortSignal;
}): Promise<{ filename: string; bytes: number }> {
  const body: Record<string, unknown> = {
    source_ids: opts.source_ids,
    format: opts.format,
  };
  if (opts.from_date) body.from_date = opts.from_date;
  if (opts.to_date) body.to_date = opts.to_date;

  const res = await fetch('/api/public/download/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.error) msg = errBody.error;
    } catch { /* not JSON */ }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const filename = parseFilename(res.headers.get('Content-Disposition'))
    ?? `ocal-${opts.source_ids.length}-diaries.zip`;

  // Trigger browser download via a temporary <a> tag (works in all browsers)
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { filename, bytes: blob.size };
}

function parseFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  // Try filename*=UTF-8'' form first (RFC 5987), then plain filename=
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8) {
    try { return decodeURIComponent(utf8[1]); } catch { /* fall through */ }
  }
  const plain = /filename=(?:"([^"]+)"|([^;]+))/i.exec(contentDisposition);
  if (plain) return (plain[1] ?? plain[2] ?? '').trim();
  return null;
}
