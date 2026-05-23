import { useState } from 'react';
import { ChevronDown, ChevronUp, Code2, Plug, Lock, Sparkles } from 'lucide-react';

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

interface EndpointGroup {
  title: string;
  endpoints: EndpointDoc[];
}

const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    title: 'אירועים',
    endpoints: [
      {
        path: '/api/public/events',
        description: 'חיפוש אירועים עם סינון, מיון ועימוד',
        params: [
          { name: 'q', description: 'חיפוש טקסט חופשי' },
          { name: 'from_date / to_date', description: 'טווח תאריכים (YYYY-MM-DD)' },
          { name: 'source_ids', description: 'מזהי מקורות מופרדים בפסיק' },
          { name: 'location', description: 'סינון לפי מיקום' },
          { name: 'participants', description: 'סינון לפי משתתפים' },
          { name: 'entity_names', description: 'שמות ישויות מופרדים ב-|| (למשל: שם1||שם2)' },
          { name: 'cross_ref_status', description: 'סטטוס הצלבה בין יומנים' },
          { name: 'page / per_page', description: 'עימוד (ברירת מחדל: 50)' },
          { name: 'sort', description: 'date_asc | date_desc | relevance' },
        ],
        example: '/api/public/events?from_date=2024-01-01&per_page=10&sort=date_desc',
      },
      {
        path: '/api/public/events/:id',
        description: 'פרטי אירוע יחיד לפי מזהה',
        example: '/api/public/events/EVENT_ID',
      },
      {
        path: '/api/public/events/:id/entities',
        description: 'ישויות שחולצו מאירוע מסוים (אנשים, ארגונים, מקומות)',
        example: '/api/public/events/EVENT_ID/entities',
      },
      {
        path: '/api/public/events/:id/cross-refs',
        description: 'הצלבות של ישויות מהאירוע ליומנים אחרים',
        example: '/api/public/events/EVENT_ID/cross-refs',
      },
      {
        path: '/api/public/events/:id/matches',
        description: 'אירועים תואמים שזוהו בין יומנים שונים',
        example: '/api/public/events/EVENT_ID/matches',
      },
    ],
  },
  {
    title: 'מקורות (יומנים)',
    endpoints: [
      {
        path: '/api/public/sources',
        description: 'רשימת כל מקורות היומנים הפעילים עם מטא-דאטה',
        example: '/api/public/sources',
      },
      {
        path: '/api/public/sources/:id',
        description: 'פרטי מקור יחיד (יומן ספציפי)',
        example: '/api/public/sources/SOURCE_ID',
      },
    ],
  },
  {
    title: 'לוח שנה',
    endpoints: [
      {
        path: '/api/public/calendar',
        description: 'אירועים לטווח תאריכים לפי תצוגת לוח שנה',
        params: [
          { name: 'date', description: 'תאריך מרכזי (YYYY-MM-DD)' },
          { name: 'view', description: 'month | week | 4day | day' },
          { name: 'source_ids', description: 'מזהי מקורות (אופציונלי)' },
          { name: 'entity_names', description: 'שמות ישויות מופרדים ב-||' },
          { name: 'max_date', description: 'תאריך מקסימלי לחיתוך (YYYY-MM-DD)' },
        ],
        example: '/api/public/calendar?date=2024-06-01&view=month',
      },
    ],
  },
  {
    title: 'ישויות',
    endpoints: [
      {
        path: '/api/public/entities',
        description: 'ישויות שחולצו מהאירועים — אנשים, ארגונים ומקומות',
        params: [
          { name: 'source_ids', description: 'סינון לפי מקורות (אופציונלי)' },
          { name: 'type', description: 'person | organization | place' },
          { name: 'from_date / to_date', description: 'טווח תאריכים (YYYY-MM-DD)' },
        ],
        example: '/api/public/entities?type=person',
      },
    ],
  },
  {
    title: 'הוצאות חברי-כנסת',
    endpoints: [
      {
        path: '/api/public/expenses',
        description: 'חיפוש הוצאות חברי-כנסת עם סינון, מיון ועימוד',
        params: [
          { name: 'q', description: 'חיפוש טקסט חופשי' },
          { name: 'from_date / to_date', description: 'טווח תאריכים (YYYY-MM-DD)' },
          { name: 'person_ids', description: 'מזהי אנשים מופרדים בפסיק' },
          { name: 'entity_names', description: 'שמות ישויות מופרדים ב-||' },
          { name: 'category', description: 'סינון לפי קטגוריית הוצאה' },
          { name: 'page / per_page', description: 'עימוד (ברירת מחדל: 50)' },
          { name: 'sort', description: 'date_asc | date_desc | amount_asc | amount_desc' },
        ],
        example: '/api/public/expenses?from_date=2024-01-01&per_page=10',
      },
      {
        path: '/api/public/expenses/categories',
        description: 'רשימת קטגוריות ההוצאה האפשריות',
        example: '/api/public/expenses/categories',
      },
      {
        path: '/api/public/expenses/summary',
        description: 'סיכומי הוצאות יומיים ולפי אדם',
        params: [
          { name: 'from_date / to_date', description: 'טווח תאריכים (YYYY-MM-DD)' },
          { name: 'person_ids', description: 'מזהי אנשים מופרדים בפסיק' },
          { name: 'entity_names', description: 'שמות ישויות מופרדים ב-||' },
        ],
        example: '/api/public/expenses/summary?from_date=2024-01-01',
      },
      {
        path: '/api/public/expenses/:id',
        description: 'רשומת הוצאה יחידה לפי מזהה',
        example: '/api/public/expenses/EXPENSE_ID',
      },
    ],
  },
  {
    title: 'סטטיסטיקות',
    endpoints: [
      {
        path: '/api/public/stats',
        description: 'סטטיסטיקות כלליות — מספר אירועים, מקורות וארגונים',
        example: '/api/public/stats',
      },
    ],
  },
  {
    title: 'תוכן האתר',
    endpoints: [
      {
        path: '/api/public/content',
        description: 'תוכן האתר המנוהל ב-CMS (header, footer, עמוד אודות)',
        example: '/api/public/content',
      },
    ],
  },
  {
    title: 'הורדות',
    endpoints: [
      {
        path: '/api/public/download/source/:id',
        description: 'הורדת כל אירועי יומן ספציפי (CSV או JSON)',
        params: [
          { name: 'format', description: 'csv (ברירת מחדל) | json' },
          { name: 'from_date / to_date', description: 'טווח תאריכים (אופציונלי)' },
        ],
        example: '/api/public/download/source/SOURCE_ID?format=csv',
      },
      {
        path: 'POST /api/public/download/bulk',
        description: 'הורדה מרובה כ-ZIP — קובץ CSV/JSON לכל יומן. גוף הבקשה ב-JSON.',
        params: [
          { name: 'source_ids', description: 'מערך UUIDs של יומנים (בגוף הבקשה, חובה)' },
          { name: 'format', description: 'csv (ברירת מחדל) | json' },
          { name: 'from_date / to_date', description: 'טווח תאריכים (אופציונלי)' },
        ],
        example: 'curl -X POST /api/public/download/bulk -H "Content-Type: application/json" -d \'{"source_ids":["..."],"format":"csv"}\'',
      },
    ],
  },
];

function EndpointCard({ ep }: { ep: EndpointDoc }) {
  // Allow paths to be prefixed with an HTTP verb (e.g. "POST /api/...");
  // default to GET when no prefix is present.
  const verbMatch = ep.path.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/);
  const method = verbMatch?.[1] ?? 'GET';
  const path = verbMatch?.[2] ?? ep.path;
  const methodColor =
    method === 'POST'
      ? 'bg-blue-100 text-blue-700'
      : method === 'DELETE'
        ? 'bg-red-100 text-red-700'
        : method === 'PUT' || method === 'PATCH'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-green-100 text-green-700';
  return (
    <div
      className="bg-gray-50 border border-gray-200 rounded-lg p-4"
      role="listitem"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[11px] font-bold ${methodColor} px-2 py-0.5 rounded shrink-0`}>
          {method}
        </span>
        <code className="text-sm font-mono text-gray-800 min-w-0" style={{ overflowWrap: 'anywhere' }}>
          {path}
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
        <span className="text-[10px] text-gray-500 mt-0.5 shrink-0">דוגמה:</span>
        {ep.example.startsWith('/') ? (
          <a
            href={ep.example}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-primary-700 hover:underline break-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
          >
            {ep.example}
          </a>
        ) : (
          <code className="text-xs font-mono text-gray-800 break-all" dir="ltr">
            {ep.example}
          </code>
        )}
      </div>
    </div>
  );
}

const MCP_TOOLS: { name: string; description: string }[] = [
  { name: 'search_events', description: 'חיפוש Full-Text באירועי יומן (כולל תאריכים, מקורות, ישויות, מיקומים)' },
  { name: 'get_event', description: 'אירוע בודד + כל הישויות שחולצו + הצלבות + אירועים זהים' },
  { name: 'list_entities', description: 'אנשים, ארגונים ומקומות שחולצו מהאירועים, ממוינים לפי תדירות אזכור' },
  { name: 'list_sources', description: 'רשימת היומנים הציבוריים שמופעים במערכת' },
  { name: 'find_meetings_between', description: 'אירועים שמזכירים שני אנשים — לעקיבה מי-נפגש-עם-מי' },
  { name: 'get_stats', description: 'סטטיסטיקות מצרפיות (כמה אירועים, ישויות, הצלבות, טווח תאריכים)' },
];

function McpSection() {
  return (
    <section
      aria-labelledby="mcp-heading"
      className="bg-gradient-to-br from-primary-50 to-blue-50 border border-primary-200 rounded-xl p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-primary-700 shrink-0" aria-hidden="true" />
        <h3 id="mcp-heading" className="text-base sm:text-lg font-semibold text-gray-900">
          MCP — חיבור ישיר ל-Claude / ChatGPT
        </h3>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
          <Lock className="w-3 h-3" aria-hidden="true" />
          דורש הזמנה
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-4 leading-relaxed">
        ה-MCP server של Ocal מאפשר ל-Claude.ai, ChatGPT וכלי AI אחרים לשלוף את הנתונים המעובדים
        ישירות בתוך השיחה — חיפוש אירועים, הצלבות בין יומנים, סטטיסטיקות ועוד.
        בניגוד ל-API הציבורי שלמטה, ה-MCP פתוח רק למשתמשים מוזמנים מראש (closed beta).
      </p>

      {/* Request access */}
      <div className="bg-white/70 border border-primary-200 rounded-lg p-4 mb-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">קבלת הרשאות</h4>
        <p className="text-sm text-gray-700">
          לבקשת גישה, יש לפנות בדוא"ל:{' '}
          <a
            href="mailto:guy@z-g.co.il?subject=בקשת%20גישה%20ל-MCP%20של%20Ocal&body=שלום,%0A%0Aאשמח%20לקבל%20גישה%20ל-MCP%20server.%0A%0Aכתובת%20ה-Gmail%20להתחברות:%20%0Aמטרת%20השימוש:%20%0A%0Aתודה."
            className="text-primary-700 font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
          >
            guy@z-g.co.il
          </a>
        </p>
        <ul className="text-xs text-gray-600 mt-2 space-y-1 mr-4 list-disc">
          <li>יש לציין את כתובת ה-Gmail שתשמש להתחברות (חובה — לפי הכתובת ההזמנה תיווצר)</li>
          <li>בקצרה — לאיזו מטרה הגישה מבוקשת</li>
        </ul>
      </div>

      {/* Connection steps */}
      <div className="bg-white/70 border border-primary-200 rounded-lg p-4 mb-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-1.5">
          <Plug className="w-4 h-4 text-primary-700" aria-hidden="true" />
          לאחר קבלת הזמנה — איך להתחבר מ-Claude.ai
        </h4>
        <ol className="text-sm text-gray-700 space-y-2 mr-5 list-decimal">
          <li>
            ב-Claude.ai לחץ על <strong>Settings</strong> (סמל המסטרל בצד) ←{' '}
            <strong>Connectors</strong>
          </li>
          <li>
            לחץ על הכפתור <strong>Add custom connector</strong>
          </li>
          <li>
            הדבק את ה-URL הבא בשדה:{' '}
            <code className="font-mono bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-primary-700 text-xs" dir="ltr">
              https://ocal.org.il/mcp
            </code>
          </li>
          <li>
            לחץ <strong>Add</strong> — תיפתח אוטומטית חלונית התחברות של Google
          </li>
          <li>
            התחבר עם אותה כתובת Gmail שהזמנתי (חשוב: זו חייבת להיות אותה כתובת בדיוק)
          </li>
          <li>
            לאישור הסיום — בשיחה חדשה לחץ על כפתור ה- <strong>+</strong> ליד תיבת ההודעה, סמן את OCAL,
            ושאל למשל: <em>"באוקאל, מה הסטטיסטיקות של המאגר?"</em>
          </li>
        </ol>
        <p className="text-xs text-gray-500 mt-3">
          ב-ChatGPT / Cursor / MCP Inspector התהליך זהה — הוסף connector בשם OCAL עם אותו URL.
        </p>
      </div>

      {/* Available tools */}
      <div className="bg-white/70 border border-primary-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">הכלים הזמינים</h4>
        <ul className="space-y-1.5 text-sm" role="list">
          {MCP_TOOLS.map((t) => (
            <li key={t.name} className="flex items-start gap-2">
              <code className="font-mono text-xs bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-primary-700 shrink-0 mt-0.5" dir="ltr">
                {t.name}
              </code>
              <span className="text-gray-700 text-xs sm:text-sm">{t.description}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500 mt-3">
          כל קריאה ל-tool מתועדת בצד השרת לצורך מדידת שימוש — הנתונים אינם משותפים עם צד שלישי.
        </p>
      </div>
    </section>
  );
}

function EndpointList() {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-6">
      {/* MCP section — must come first because it's qualitatively different
       *  (authenticated, invite-only) and is the most-asked-for capability. */}
      <McpSection />

      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          נקודות קצה פתוחות (REST API ללא אימות)
        </h3>
        <p className="text-sm text-gray-600">
          כל נקודות הקצה למטה פתוחות לציבור ואינן דורשות אימות.
          בסיס ה-URL:{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-primary-700 text-xs">
            {baseUrl}
          </code>
        </p>
      </div>

      {ENDPOINT_GROUPS.map((group) => (
        <div key={group.title}>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-200 pb-1">
            {group.title}
          </h3>
          <div className="space-y-3" role="list">
            {group.endpoints.map((ep) => (
              <EndpointCard key={ep.path} ep={ep} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ApiDocsSection({ alwaysOpen }: { alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(false);

  // When used as a standalone tab, render without the collapsible wrapper
  if (alwaysOpen) {
    return (
      <section aria-label="תיעוד API">
        <div className="flex items-center gap-2 mb-5">
          <Code2 className="w-5 h-5 text-primary-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-gray-800">ממשק API פתוח</h2>
        </div>
        <EndpointList />
      </section>
    );
  }

  // Collapsible mode (legacy)
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
        <div className="mt-5">
          <EndpointList />
        </div>
      )}
    </section>
  );
}
