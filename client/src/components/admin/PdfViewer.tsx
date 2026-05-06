import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Bundle the pdfjs worker via Vite — the URL constructor is rewritten at build
// time so the worker is co-hosted (no CDN, works on Render's domain).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  fileUrl: string;
  onPageChange?: (page: number) => void;
}

export function PdfViewer({ fileUrl, onPageChange }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPageChange?.(pageNumber);
  }, [pageNumber, onPageChange]);

  // Pass cookies for authenticated PDF download
  const file = { url: fileUrl, withCredentials: true };

  return (
    <div className="flex flex-col h-full bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-2 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="עמוד קודם"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-700 min-w-[5rem] text-center">
            {numPages > 0 ? `${pageNumber} / ${numPages}` : '...'}
          </span>
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="עמוד הבא"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            className="p-1.5 rounded hover:bg-gray-100"
            aria-label="הקטן"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-700 min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            className="p-1.5 rounded hover:bg-gray-100"
            aria-label="הגדל"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Page area */}
      <div className="flex-1 overflow-auto p-4 flex justify-center" dir="ltr">
        {error ? (
          <div className="text-red-600 text-sm p-4 text-center" dir="rtl">
            {error}
          </div>
        ) : (
          <Document
            file={file}
            onLoadSuccess={({ numPages }) => {
              setNumPages(numPages);
              setError(null);
            }}
            onLoadError={(err) => setError(`טעינת PDF נכשלה: ${err.message}`)}
            loading={<div className="text-gray-500 text-sm p-4" dir="rtl">טוען PDF...</div>}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer
              renderAnnotationLayer={false}
            />
          </Document>
        )}
      </div>
    </div>
  );
}
