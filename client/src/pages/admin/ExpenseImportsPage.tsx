import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Loader2, AlertCircle, CheckCircle2, Trash2, FileSpreadsheet,
  UserCheck, UserPlus, ArrowRightLeft, Sparkles,
} from 'lucide-react';
import {
  previewExpenseImport,
  commitExpenseImport,
  listExpenseImports,
  deleteExpenseImport,
  type PreviewResult,
  type MkResolution,
  type MkMatchKind,
} from '@/api/adminExpenseImports';

const MATCH_LABEL: Record<MkMatchKind, string> = {
  exact: 'התאמה מדויקת',
  swapped: 'סדר הופך',
  fuzzy: 'התאמה מקורבת',
  new: 'חדש (ייווצר)',
};

const MATCH_BADGE_CLASS: Record<MkMatchKind, string> = {
  exact: 'bg-green-100 text-green-800 border-green-300',
  swapped: 'bg-blue-100 text-blue-800 border-blue-300',
  fuzzy: 'bg-amber-100 text-amber-800 border-amber-300',
  new: 'bg-purple-100 text-purple-800 border-purple-300',
};

const MATCH_ICON: Record<MkMatchKind, typeof UserCheck> = {
  exact: UserCheck,
  swapped: ArrowRightLeft,
  fuzzy: Sparkles,
  new: UserPlus,
};

export function ExpenseImportsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string>('');

  const { data: imports = [] } = useQuery({
    queryKey: ['admin', 'expense-imports'],
    queryFn: listExpenseImports,
  });

  const previewMutation = useMutation({
    mutationFn: (file: File) => previewExpenseImport(file),
    onSuccess: (data) => {
      setPreview(data);
      setError('');
    },
    onError: (err: Error) => {
      setError(err.message);
      setPreview(null);
    },
  });

  const commitMutation = useMutation({
    mutationFn: (file: File) => commitExpenseImport(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'expense-imports'] });
      setPreview(null);
      setSelectedFile(null);
      setError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteExpenseImport(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'expense-imports'] }),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSelectedFile(f);
    setPreview(null);
    setError('');
    previewMutation.mutate(f);
  };

  const matchCounts = preview
    ? {
        exact: preview.mks.filter((m) => m.match_kind === 'exact').length,
        swapped: preview.mks.filter((m) => m.match_kind === 'swapped').length,
        fuzzy: preview.mks.filter((m) => m.match_kind === 'fuzzy').length,
        new: preview.mks.filter((m) => m.match_kind === 'new').length,
      }
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">ייבוא הוצאות חברי כנסת</h1>
        <p className="text-sm text-gray-600">
          טוען דוחות "הוצאות קשר עם הציבור" של חברי הכנסת מקבצי XLSX רשמיים.
          קובץ 2023 (ללא תאריך לכל שורה) אינו נתמך — רק 2024/2025 ואילך.
        </p>
      </div>

      {/* Upload zone */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-6 bg-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={previewMutation.isPending || commitMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded font-semibold hover:bg-primary-800 disabled:opacity-50"
          >
            {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {previewMutation.isPending ? 'מנתח...' : 'בחר קובץ XLSX'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFile}
            className="hidden"
          />
          <span className="text-xs text-gray-500">מקסימום 25MB</span>
          {selectedFile && (
            <span className="text-sm text-gray-700 inline-flex items-center gap-1">
              <FileSpreadsheet className="w-4 h-4" /> {selectedFile.name}
            </span>
          )}
        </div>
        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && matchCounts && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-gray-50 rounded p-3">
              <div className="text-2xl font-bold text-gray-900">{preview.total_rows.toLocaleString('he-IL')}</div>
              <div className="text-xs text-gray-500">שורות</div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <div className="text-2xl font-bold text-gray-900">{preview.source_year}</div>
              <div className="text-xs text-gray-500">שנת המקור</div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <div className="text-2xl font-bold text-green-700">{matchCounts.exact + matchCounts.swapped + matchCounts.fuzzy}</div>
              <div className="text-xs text-gray-500">חברי כנסת תואמו</div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <div className="text-2xl font-bold text-purple-700">{matchCounts.new}</div>
              <div className="text-xs text-gray-500">ייווצרו חדשים</div>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800 space-y-1">
              {preview.warnings.map((w, i) => (
                <div key={i} className="inline-flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {w}
                </div>
              ))}
            </div>
          )}

          {/* MK match table */}
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">
              התאמת חברי כנסת ({preview.mks.length} שמות ייחודיים)
            </div>
            <div className="border border-gray-200 rounded overflow-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 text-xs sticky top-0">
                  <tr>
                    <th className="text-right px-3 py-2 font-semibold">שם בקובץ</th>
                    <th className="text-right px-3 py-2 font-semibold">סטטוס</th>
                    <th className="text-right px-3 py-2 font-semibold">משויך ל-</th>
                    <th className="text-right px-3 py-2 font-semibold">בעל יומן?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.mks.map((m: MkResolution, i) => {
                    const Icon = MATCH_ICON[m.match_kind];
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-medium text-gray-900">{m.name_raw}</td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${MATCH_BADGE_CLASS[m.match_kind]}`}>
                            <Icon className="w-3 h-3" />
                            {MATCH_LABEL[m.match_kind]}
                            {m.score != null && ` (${m.score})`}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-700">{m.matched_person_name ?? '—'}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{m.is_diary_owner ? '✓' : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={() => selectedFile && commitMutation.mutate(selectedFile)}
              disabled={commitMutation.isPending || !selectedFile}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded font-semibold hover:bg-primary-800 disabled:opacity-50"
            >
              {commitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              אשר ייבוא ({preview.total_rows.toLocaleString('he-IL')} שורות)
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">היסטוריית ייבוא</h2>
      {imports.length === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          עדיין לא בוצעו ייבואים.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700 text-xs">
              <tr>
                <th className="text-right px-3 py-2 font-semibold">קובץ</th>
                <th className="text-right px-3 py-2 font-semibold">שנה</th>
                <th className="text-right px-3 py-2 font-semibold">שורות</th>
                <th className="text-right px-3 py-2 font-semibold">תואמו</th>
                <th className="text-right px-3 py-2 font-semibold">חדשים</th>
                <th className="text-right px-3 py-2 font-semibold">תאריך</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {imports.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-gray-900">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> {i.filename}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{i.source_year}</td>
                  <td className="px-3 py-2 text-gray-700">{i.rows_inserted.toLocaleString('he-IL')}</td>
                  <td className="px-3 py-2 text-green-700">{i.mks_matched}</td>
                  <td className="px-3 py-2 text-purple-700">{i.mks_created}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(i.created_at).toLocaleString('he-IL')}
                  </td>
                  <td className="px-3 py-2 text-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `למחוק את הייבוא "${i.filename}"? פעולה זו תמחק ${i.rows_inserted.toLocaleString('he-IL')} שורות הוצאות.`,
                          )
                        ) {
                          deleteMutation.mutate(i.id);
                        }
                      }}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      aria-label="מחק"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
