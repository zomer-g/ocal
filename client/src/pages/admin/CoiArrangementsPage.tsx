import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileCheck, Search } from 'lucide-react';
import { listCoiArrangements, type CoiOrigin } from '@/api/coiArrangements';
import { ReviewedBadge } from '@/components/shared/ReviewedBadge';

export function CoiArrangementsPage() {
  const [origin, setOrigin] = useState<CoiOrigin | 'all'>('all');
  const [reviewed, setReviewed] = useState<'all' | 'true' | 'false'>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['coi-arrangements', { origin, reviewed, q, page }],
    queryFn: () => listCoiArrangements({
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">הסדרי ניגוד עניינים</h1>
        <p className="text-sm text-gray-600">
          רשימת כל הסדרי ניגוד העניינים שיובאו למערכת. ניתן לסנן לפי מקור ולפי סטטוס בדיקה,
          לחפש לפי נושא, ולערוך/לאשר כל הסדר בנפרד.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">מקור:</span>
          {(['all', 'odata', 'gov_il_zip'] as const).map((o) => (
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
              {o === 'all' ? 'הכל' : o === 'odata' ? 'ODATA' : 'GOV.IL ZIP'}
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
            placeholder="חיפוש לפי נושא, שם קובץ..."
            className="flex-1 text-sm py-1 outline-none"
          />
        </div>
      </div>

      <div className="text-xs text-gray-500 mb-2">
        סה"כ {data?.pagination.total.toLocaleString('he-IL') ?? '...'} הסדרים
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700 text-xs">
            <tr>
              <th className="text-right px-3 py-2 font-semibold">נושא</th>
              <th className="text-right px-3 py-2 font-semibold">מקור</th>
              <th className="text-right px-3 py-2 font-semibold">בעל ההסדר</th>
              <th className="text-right px-3 py-2 font-semibold">תאריך ייבוא</th>
              <th className="text-right px-3 py-2 font-semibold">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link to={`/admin/coi-arrangements/${r.id}`} className="inline-flex items-center gap-1.5 text-primary-700 hover:underline">
                    <FileCheck className="w-3.5 h-3.5" /> {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-700 text-xs">
                  {r.origin === 'odata' ? 'ODATA' : 'GOV.IL ZIP'}
                </td>
                <td className="px-3 py-2 text-gray-700">{r.person_name ?? r.subject_name_raw}</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {new Date(r.created_at).toLocaleDateString('he-IL')}
                </td>
                <td className="px-3 py-2">
                  <ReviewedBadge reviewed={!!r.reviewed_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-8">לא נמצאו הסדרים תואמים לסינון.</div>
        )}
      </div>

      {/* Pagination */}
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
