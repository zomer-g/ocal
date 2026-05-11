import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Upload, Loader2, AlertCircle, CheckCircle2, FileCheck, ExternalLink, FileText, Archive,
} from 'lucide-react';
import {
  discoverCoiResources,
  importCoiFromOdata,
  importCoiFromZip,
  listCoiArrangements,
} from '@/api/coiArrangements';

type Tab = 'odata' | 'zip';

export function CoiImportsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('odata');
  const [error, setError] = useState<string>('');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">ייבוא הסדרי ניגוד עניינים</h1>
        <p className="text-sm text-gray-600">
          הסדרי ניגוד עניינים של נושאי תפקידים ציבוריים מיובאים בשתי דרכים: גילוי דרך ODATA
          לפי חיפוש של "ניגוד עניינים", או העלאה של חבילת ZIP מ-GOV.IL.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {(['odata', 'zip'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'odata' ? 'ODATA — מידע לעם' : 'GOV.IL — קובץ ZIP'}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {tab === 'odata' ? <OdataTab onError={setError} onSuccess={() => queryClient.invalidateQueries({ queryKey: ['coi-arrangements'] })} /> : <ZipTab onError={setError} onSuccess={() => queryClient.invalidateQueries({ queryKey: ['coi-arrangements'] })} />}

      {/* Recent imports */}
      <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">הסדרים שיובאו לאחרונה</h2>
      <RecentArrangements />
    </div>
  );
}

function OdataTab({ onError, onSuccess }: { onError: (e: string) => void; onSuccess: () => void }) {
  const { data: discovery, isLoading } = useQuery({
    queryKey: ['coi-imports', 'discover'],
    queryFn: discoverCoiResources,
    staleTime: 5 * 60_000,
  });

  const importMutation = useMutation({
    mutationFn: (input: { resource_id: string; package_id: string }) => importCoiFromOdata(input),
    onSuccess: () => {
      onSuccess();
      onError('');
    },
    onError: (err: Error) => onError(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin ml-2" /> טוען חבילות ODATA...
      </div>
    );
  }
  if (!discovery) return null;

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">
        נמצאו {discovery.total_datasets} חבילות עם {discovery.total_resources} משאבים תואמים לחיפוש "{discovery.query}".
      </div>
      {discovery.datasets.map((ds) => (
        <div key={ds.id} className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-medium text-gray-900">{ds.title}</h3>
              {ds.organization && <div className="text-xs text-gray-500">{ds.organization}</div>}
            </div>
            <a
              href={ds.odata_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-primary-700 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> פתח ב-ODATA
            </a>
          </div>
          {ds.resources.length === 0 ? (
            <div className="text-xs text-gray-400 italic">לא נמצאו קבצי PDF בחבילה זו.</div>
          ) : (
            <div className="space-y-1">
              {ds.resources.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm py-1 px-2 hover:bg-gray-50 rounded">
                  <div className="inline-flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate text-gray-700">{r.name}</span>
                  </div>
                  {r.status === 'imported' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> יובא
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => importMutation.mutate({ resource_id: r.id, package_id: ds.id })}
                      disabled={importMutation.isPending}
                      className="text-xs px-2 py-0.5 rounded bg-primary-700 text-white hover:bg-primary-800 disabled:opacity-50"
                    >
                      {importMutation.isPending ? '...' : 'ייבא'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ZipTab({ onError, onSuccess }: { onError: (e: string) => void; onSuccess: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importCoiFromZip>> | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => importCoiFromZip(file),
    onSuccess: (r) => {
      setResult(r);
      onSuccess();
      onError('');
    },
    onError: (err: Error) => onError(err.message),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadMutation.mutate(f);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
      <Archive className="w-10 h-10 text-gray-400 mx-auto mb-3" />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded font-semibold hover:bg-primary-800 disabled:opacity-50"
      >
        {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploadMutation.isPending ? 'מעבד...' : 'העלה ZIP'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={onFile}
        className="hidden"
      />
      <p className="text-xs text-gray-500 mt-2">קבצי PDF בתוך ה-ZIP יחולצו אוטומטית ויקושרו לחבר הכנסת המתאים לפי שם הקובץ.</p>

      {result && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-right">
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <div className="text-2xl font-bold text-green-800">{result.created}</div>
            <div className="text-xs text-green-700">נוצרו</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <div className="text-2xl font-bold text-blue-800">{result.matched_people}</div>
            <div className="text-xs text-blue-700">תואמו לאנשים קיימים</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded p-3">
            <div className="text-2xl font-bold text-purple-800">{result.created_people}</div>
            <div className="text-xs text-purple-700">אנשים חדשים נוצרו</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-3">
            <div className="text-2xl font-bold text-amber-800">{result.warnings.length}</div>
            <div className="text-xs text-amber-700">אזהרות</div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecentArrangements() {
  const { data } = useQuery({
    queryKey: ['coi-arrangements', { recent: true }],
    queryFn: () => listCoiArrangements({ page: 1, per_page: 10 }),
  });
  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded p-6 text-center">עדיין לא יובאו הסדרים.</div>;
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
      {rows.map((r) => (
        <Link key={r.id} to={`/admin/coi-arrangements/${r.id}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
          <FileCheck className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate">{r.title}</div>
            <div className="text-xs text-gray-500">
              {r.origin === 'odata' ? 'ODATA' : 'GOV.IL ZIP'} · {r.person_name || r.subject_name_raw}
            </div>
          </div>
          {r.reviewed_at && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
              נבדק
            </span>
          )}
        </Link>
      ))}
      <Link to="/admin/coi-arrangements" className="block text-center text-xs text-primary-700 py-2 hover:bg-gray-50">
        כל הרשימה ←
      </Link>
    </div>
  );
}
