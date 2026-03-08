import { useState } from 'react';
import { ChevronDown, ChevronUp, Code2 } from 'lucide-react';

interface EndpointParam {
  name: string;
  description: string;
}

interface EndpointDoc {
  path: string;
  description: string;
  params?: EndpointParam[];
  example: string;
}

const ENDPOINTS: EndpointDoc[] = [
  {
    path: '/api/public/events',
    description: 'חיפוש אירועים עם סינון, מיון ועימוד',
    params: [
      { name: 'q', description: 'חיפוש טקסט חופשי' },
      { name: 'from_date / to_date', description: 'טווח תאריכים (YYYY-MM-DD)' },
      { name: 'source_ids', description: 'מזהי מקורות מופרדים בפסיק' },
      { name: 'entity_names', description: 'שמות ישויות מופרדים בפסיק' },
      { name: 'page / per_page', description: 'עימוד (ברירת מחדל: 50)' },
      { name: 'sort', description: 'date_asc | date_desc | relevance' },
    ],
    example: '/api/public/events?from_date=2024-01-01&per_page=10&sort=date_desc',
  },
  {
    path: '/api/public/sources',
    description: 'רשימת כל מקורות היומנים הפעילים עם מטא-דאטה',
    example: '/api/public/sources',
  },
  {
    path: '/api/public/calendar',
    description: 'אירועים לטווח תאריכים לפי תצוגת לוח שנה',
    params: [
      { name: 'date', description: 'תאריך מרכזי (YYYY-MM-DD)' },
      { name: 'view', description: 'month | week | 4day | day' },
      { name: 'source_ids', description: 'מזהי מקורות (אופציונלי)' },
      { name: 'max_date', description: 'תאריך מקסימלי לחיתוך (YYYY-MM-DD)' },
    ],
    example: '/api/public/calendar?date=2024-06-01&view=month',
  },
  {
    path: '/api/public/stats',
    description: 'סטטיסטיקות כלליות — מספר אירועים, מקורות וארגונים',
    example: '/api/public/stats',
  },
  {
    path: '/api/public/entities',
    description: 'ישויות שחולצו מהאירועים — אנשים, ארגונות ומקומות',
    params: [
      { name: 'source_ids', description: 'סינון לפי מקורות (אופציונלי)' },
      { name: 'type', description: 'person | organization | place' },
    ],
    example: '/api/public/entities?type=person',
  },
  {
    path: '/api/public/download/source/:id',
    description: 'הורדת כל אירועי יומן ספציפי (CSV או JSON)',
    params: [
      { name: 'format', description: 'csv (ברירת מחדל) | json' },
    ],
    example: '/api/public/download/source/SOURCE_ID?format=csv',
  },
  {
    path: '/api/public/download/all',
    description: 'הורדת כל האירועים מכל היומנים הפעילים (CSV או JSON)',
    params: [
      { name: 'format', description: 'csv (ברירת מחדל) | json' },
    ],
    example: '/api/public/download/all?format=json',
  },
];

export function ApiDocsSection() {
  const [open, setOpen] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <section className="mt-12 border-t border-gray-200 pt-8" aria-label="תיעוד API">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-right text-lg font-semibold text-gray-800 hover:text-primary-700 transition-colors"
        aria-expanded={open}
      >
        <Code2 className="w-5 h-5 text-primary-600 shrink-0" aria-hidden="true" />
        <span className="flex-1">ממשק API פתוח</span>
        {open
          ? <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" aria-hidden="true" />
          : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" aria-hidden="true" />
        }
      </button>

      {open && (
        <div className="mt-5 space-y-3" role="list">
          <p className="text-sm text-gray-500">
            כל נקודות הקצה פתוחות לציבור ואינן דורשות אימות.
            בסיס ה-URL:{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-primary-700 text-xs">
              {baseUrl}
            </code>
          </p>

          {ENDPOINTS.map((ep) => (
            <div
              key={ep.path}
              className="bg-gray-50 border border-gray-200 rounded-lg p-4"
              role="listitem"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded shrink-0">
                  GET
                </span>
                <code className="text-sm font-mono text-gray-800 min-w-0" style={{ overflowWrap: 'anywhere' }}>
                  {ep.path}
                </code>
              </div>
              <p className="text-sm text-gray-600 mb-2">{ep.description}</p>

              {ep.params && ep.params.length > 0 && (
                <ul className="text-xs text-gray-500 space-y-1 mb-2">
                  {ep.params.map((p) => (
                    <li key={p.name}>
                      <code className="bg-white border border-gray-200 px-1 py-0.5 rounded text-primary-700">
                        {p.name}
                      </code>
                      {' — '}{p.description}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-start gap-2 mt-2">
                <span className="text-[10px] text-gray-400 mt-0.5 shrink-0">דוגמה:</span>
                <a
                  href={ep.example}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-primary-600 hover:underline break-all"
                >
                  {ep.example}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
