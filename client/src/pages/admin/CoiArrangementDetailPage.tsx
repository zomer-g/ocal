import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Loader2, Trash2, Save } from 'lucide-react';
import {
  getCoiArrangement,
  coiArrangementFileUrl,
  reviewCoiArrangement,
  unreviewCoiArrangement,
  updateCoiArrangement,
  deleteCoiArrangement,
} from '@/api/coiArrangements';
import { PdfViewer } from '@/components/admin/PdfViewer';
import { useAuth } from '@/hooks/useAuth';

export function CoiArrangementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const { data: row, isLoading } = useQuery({
    queryKey: ['coi-arrangement', id],
    queryFn: () => getCoiArrangement(id!),
    enabled: !!id,
  });

  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [docDate, setDocDate] = useState('');

  useEffect(() => {
    if (row) {
      setTitle(row.title);
      setSubjectName(row.subject_name_raw);
      setDocDate(row.document_date ?? '');
    }
  }, [row]);

  const saveMutation = useMutation({
    mutationFn: () => updateCoiArrangement(id!, {
      title: title.trim(),
      subject_name_raw: subjectName.trim(),
      document_date: docDate || null,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coi-arrangement', id] }),
  });

  const reviewMutation = useMutation({
    mutationFn: () => reviewCoiArrangement(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coi-arrangement', id] }),
  });

  const unreviewMutation = useMutation({
    mutationFn: () => unreviewCoiArrangement(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coi-arrangement', id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCoiArrangement(id!),
    onSuccess: () => navigate('/admin/coi-arrangements'),
  });

  if (isLoading || !row) {
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
          <button type="button" onClick={() => navigate('/admin/coi-arrangements')} className="text-primary-700 hover:underline">
            ← רשימת הסדרים
          </button>
          <span className="text-gray-400">/</span>
          <span className="font-semibold text-gray-900 truncate max-w-md">{row.title}</span>
        </div>
        <a
          href={coiArrangementFileUrl(row.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-primary-700"
        >
          <ExternalLink className="w-3.5 h-3.5" /> פתח PDF בכרטיסייה חדשה
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-180px)]">
        {/* PDF on right (RTL first) */}
        <PdfViewer fileUrl={coiArrangementFileUrl(row.id)} />

        {/* Metadata + review panel */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">כותרת</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                dir="rtl"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">שם הנושא (כפי שמופיע במקור)</label>
              <input
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                dir="rtl"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">תאריך המסמך</label>
              <input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-gray-500">מקור</div>
                <div className="text-gray-900">{row.origin === 'odata' ? 'ODATA' : 'GOV.IL ZIP'}</div>
              </div>
              <div>
                <div className="text-gray-500">בעל ההסדר</div>
                <div className="text-gray-900">{row.person_name ?? '—'}</div>
              </div>
              {row.source_url && (
                <div className="col-span-2">
                  <div className="text-gray-500">קישור למקור</div>
                  <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline text-xs inline-flex items-center gap-1">
                    {row.source_url} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {row.reviewed_at && (
                <div className="col-span-2">
                  <div className="text-gray-500">נבדק על ידי</div>
                  <div className="text-gray-900">
                    {row.reviewed_by_email ?? '—'} ({new Date(row.reviewed_at).toLocaleString('he-IL')})
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-700 text-white rounded hover:bg-primary-800 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> שמור שינויים
              </button>
              {row.reviewed_at ? (
                <button
                  type="button"
                  onClick={() => unreviewMutation.mutate()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-100 text-amber-800 border border-amber-300 rounded hover:bg-amber-200"
                >
                  בטל סימון נבדק
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => reviewMutation.mutate()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4" /> סמן כנבדק
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('למחוק את ההסדר?')) deleteMutation.mutate();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 border border-red-200 rounded hover:bg-red-50 ml-auto"
                >
                  <Trash2 className="w-4 h-4" /> מחק
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
