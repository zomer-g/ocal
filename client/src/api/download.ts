export function getSourceDownloadUrl(sourceId: string, format: 'csv' | 'json'): string {
  return `/api/public/download/source/${sourceId}?format=${format}`;
}

export function getAllDownloadUrl(format: 'csv' | 'json'): string {
  return `/api/public/download/all?format=${format}`;
}

/** Opens the download URL in a new tab — browser handles Content-Disposition filename. */
export function triggerDownload(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
