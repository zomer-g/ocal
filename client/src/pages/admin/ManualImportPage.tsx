import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, Loader2, AlertCircle, ExternalLink, Trash2 } from 'lucide-react';
import {
  uploadPdf,
  getManualUpload,
  listManualUploads,
  manualUploadFileUrl,
  deleteManualUpload,
} from '@/api/manualUploads';
import { PdfViewer } from '@/components/admin/PdfViewer';
import { ManualEventEditor } from '@/components/admin/ManualEventEditor';

export function ManualImportPage() {
  const navigate = useNavigate();
  const { uploadId } = useParams<{ uploadId?: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string>('');
  const [currentPdfPage, setCurrentPdfPage] = useState(1);

  const { data: uploads = [] } = useQuery({
    queryKey: ['admin', 'manual-uploads'],
    queryFn: listManualUploads,
  });

  const { data: currentUpload, isLoading: loadingUpload } = useQuery({
    queryKey: ['admin', 'manual-upload', uploadId],
    queryFn: () => getManualUpload(uploadId!),
    enabled: !!uploadId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadPdf(file),
    onSuccess: (created) => {
      setUploadError('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'manual-uploads'] });
      navigate(`/admin/manual-import/${created.id}`);
    },
    onError: (err: Error) => setUploadError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteManualUpload(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'manual-uploads'] });
      if (uploadId) navigate('/admin/manual-import');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Index view (no upload selected)
  if (!uploadId) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">ייבוא ידני / מ-PDF</h1>
          <p className="text-sm text-gray-600">
            העלה קובץ PDF סרוק של יומן (לדוגמה יומן ראש הממשלה מ-odata.org.il), והזן את האירועים ידנית או חלץ אותם אוטומטית באמצעות LLM.
          </p>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 mb-6 bg-white">
          <div className="text-center">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded font-semibold hover:bg-primary-800 disabled:opacity-50"
            >
              {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploadMutation.isPending ? 'מעלה...' : 'העלה קובץ PDF'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <p className="text-xs text-gray-500 mt-2">מקסימום 20MB. רק PDF.</p>
          </div>
          {uploadError && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        <h2 className="text-lg font-semibold text-gray-900 mb-3">העלאות קודמות</h2>
        {uploads.length === 0 ? (
          <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            עדיין לא הועלו קבצים.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700 text-xs">
                <tr>
                  <th className="text-right px-3 py-2 font-semibold">קובץ</th>
                  <th className="text-right px-3 py-2 font-semibold">סטטוס</th>
                  <th className="text-right px-3 py-2 font-semibold">חולץ ע"י</th>
                  <th className="text-right px-3 py-2 font-semibold">נשמר ב-DB</th>
                  <th className="text-right px-3 py-2 font-semibold">תאריך</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {uploads.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/manual-import/${u.id}`)}
                        className="inline-flex items-center gap-1.5 text-primary-700 hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" /> {u.filename}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {u.extraction_status === 'completed' ? 'חולץ' : u.extraction_status === 'failed' ? 'נכשל' : u.extraction_status === 'running' ? 'בתהליך' : 'לא הופעל'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {u.extraction_provider === 'claude' ? 'Claude' : u.extraction_provider === 'gpt4o' ? 'GPT-4o' : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {u.committed_at ? '✓' : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {new Date(u.created_at).toLocaleString('he-IL')}
                    </td>
                    <td className="px-3 py-2 text-end">
                      {!u.committed_at && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`למחוק את "${u.filename}"?`)) deleteMutation.mutate(u.id);
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          aria-label="מחק"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // Detail / split-screen view
  if (loadingUpload || !currentUpload) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigate('/admin/manual-import')}
            className="text-primary-700 hover:underline"
          >
            ← רשימת העלאות
          </button>
          <span className="text-gray-400">/</span>
          <span className="font-semibold text-gray-900">{currentUpload.filename}</span>
        </div>
        <a
          href={manualUploadFileUrl(currentUpload.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-primary-700"
        >
          <ExternalLink className="w-3.5 h-3.5" /> פתח PDF בכרטיסייה חדשה
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-180px)]">
        <PdfViewer
          fileUrl={manualUploadFileUrl(currentUpload.id)}
          onPageChange={setCurrentPdfPage}
        />
        <ManualEventEditor
          upload={currentUpload}
          currentPdfPage={currentPdfPage}
          onCommitted={(sourceId) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'manual-upload', currentUpload.id] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'manual-uploads'] });
            navigate(`/admin/sources?highlight=${sourceId}`);
          }}
        />
      </div>
    </div>
  );
}
