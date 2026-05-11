import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Files, Search, FileUp, Receipt, FileCheck, Database } from 'lucide-react';
import { listDocuments, type DocumentKind, type DocumentOrigin } from '@/api/documents';
import { ReviewedBadge } from '@/components/shared/ReviewedBadge';

const KIND_LABEL: Record<DocumentKind, string> = {
  manual_diary_upload: 'יומן PDF',
  mk_expense_import: 'הוצאות ח"כ',
  diary_source: 'יומן CKAN',
  coi_arrangement: 'הסדר ניגוד עניינים',
};

const KIND_ICON: Record<DocumentKind, typeof Files> = {
  manual_diary_upload: FileUp,
  mk_expense_import: Receipt,
  diary_source: Database,
  coi_arrangement: FileCheck,
};

const ORIGIN_LABEL: Record<DocumentOrigin, string> = {
  odata: 'ODATA',
  gov_il_zip: 'GOV.IL ZIP',
  ckan: 'CKAN',
  manual_upload: 'הועלה ידנית',
};

function detailPath(kind: DocumentKind, id: string): string {
  switch (kind) {
    case 'manual_diary_upload': return `/admin/manual-import/${id}`;
    case 'mk_expense_import':   return `/admin/expense-imports`; // history is on the page, no dedicated detail route yet
    case 'diary_source':        return `/admin/sources?highlight=${id}`;
    case 'coi_arrangement':     return `/admin/coi-arrangements/${id}`;
  }
}

export function DocumentsPage() {
  const [kind, setKind] = useState<DocumentKind | 'all'>('all');
  const [origin, setOrigin] = useState<DocumentOrigin | 'all'>('all');
  const [reviewed, setReviewed] = useState<'all' | 'true' | 'false'>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['admin', 'documents', { kind, origin, reviewed, q, page }],
    queryFn: () => listDocuments({
      kind: kind === 'all' ? undefined : kind,
      origin: origin === 'all' ? undefined : origin,
      reviewed: reviewed === 'all' ? undefined : reviewed,
      q: q.trim() || undefined,
      page,
      per_page: 50,
    }),
  });

  const rows = data?.data ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 inline-flex items-center gap-2">
          <Files className="w-6 h-6" />
          מסמכים
        </h1>
        <p className="text-sm text-gray-600">
          תצוגה מאוחדת של כל המסמכים במערכת: יומני PDF, ייבואי הוצאות חברי כנסת,
          יומני CKAN, והסדרי ניגוד עניינים.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500">סוג:</span>
          {(['all', 'manual_diary_upload', 'mk_expense_import', 'diary_source', 'coi_arrangement'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { setKind(k); setPage(1); }}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                kind === k
                  ? 'bg-primary-100 border-primary-300 text-primary-800 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {k === 'all' ? 'הכל' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500">מקור:</span>
          {(['all', 'odata', 'gov_il_zip', 'ckan', 'manual_upload'] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { setOrigin(o); setPage(1); }}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                origin === o
                  ? 'bg-primary-100 border-primary-300 text-primary-800 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {o === 'all' ? 'הכל' : ORIGIN_LABEL[o]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">סטטוס:</span>
          {(['all', 'true', 'false'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setReviewed(s); setPage(1); }}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                reviewed === s
                  ? 'bg-primary-100 border-primary-300 text-primary-800 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'הכל' : s === 'true' ? 'נבדק' : 'טרם נבדק'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-[200px] max-w-sm bg-white border border-gray-200 rounded px-2">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="חיפוש לפי שם / כותרת..."
            className="flex-1 text-sm py-1 outline-none"
          />
        </div>
      </div>

      <div className="text-xs text-gray-500 mb-2">
        סה"כ {data?.pagination.total.toLocaleString('he-IL') ?? '...'} מסמכים
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700 text-xs">
            <tr>
              <th className="text-right px-3 py-2 font-semibold">סוג</th>
              <th className="text-right px-3 py-2 font-semibold">שם</th>
              <th className="text-right px-3 py-2 font-semibold">מקור</th>
              <th className="text-right px-3 py-2 font-semibold">נוצר</th>
              <th className="text-right px-3 py-2 font-semibold">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <tr key={`${r.kind}-${r.id}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                    <Icon className="w-3.5 h-3.5 inline-block ml-1 text-gray-400" />
                    {KIND_LABEL[r.kind]}
                  </td>
                  <td className="px-3 py-2">
                    <Link to={detailPath(r.kind, r.id)} className="text-primary-700 hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {r.origin ? ORIGIN_LABEL[r.origin] : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleDateString('he-IL')}
                  </td>
                  <td className="px-3 py-2">
                    <ReviewedBadge reviewed={!!r.reviewed_at} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-8">לא נמצאו מסמכים תואמים לסינון.</div>
        )}
      </div>

      {data && data.pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-xs px-2 py-1 rounded border border-gray-200 disabled:opacity-40"
          >
            הקודם
          </button>
          <span className="text-xs text-gray-600">{page} / {data.pagination.total_pages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(data.pagination.total_pages, p + 1))}
            disabled={page >= data.pagination.total_pages}
            className="text-xs px-2 py-1 rounded border border-gray-200 disabled:opacity-40"
          >
            הבא
          </button>
        </div>
      )}
    </div>
  );
}
