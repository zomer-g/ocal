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

export function getAllDownloadUrl(format: 'csv' | 'json'): string {
  return `/api/public/download/all?format=${format}`;
}

/** Opens the download URL in a new tab — browser handles Content-Disposition filename. */
export function triggerDownload(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
