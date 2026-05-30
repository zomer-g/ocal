import { useState } from 'react';
import { Code2, Sparkles, Mail, Plug, Copy, Check } from 'lucide-react';
import { ApiDocsSection } from '@/components/diaries/ApiDocsSection';

const MCP_URL = 'https://ocal.org.il/mcp';
const CONTACT_EMAIL = 'guy@z-g.co.il';
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('בקשת גישה ל-MCP של Ocal')}&body=${encodeURIComponent(
  'שלום,\n\nאשמח לקבל גישה ל-MCP server של Ocal.\n\nכתובת ה-Gmail להתחברות: \nמטרת השימוש: \n\nתודה.',
)}`;

const MCP_TOOLS: { name: string; description: string }[] = [
  { name: 'search_events', description: 'חיפוש Full-Text באירועי יומן (תאריכים, מקורות, ישויות, מיקומים)' },
  { name: 'get_event', description: 'אירוע בודד + כל הישויות שחולצו + הצלבות + אירועים זהים' },
  { name: 'list_entities', description: 'אנשים, ארגונים ומקומות שחולצו מהאירועים, ממוינים לפי תדירות אזכור' },
  { name: 'list_sources', description: 'רשימת היומנים הציבוריים שמופעים במערכת' },
  { name: 'find_meetings_between', description: 'אירועים שמזכירים שני אנשים — לעקיבה מי-נפגש-עם-מי' },
  { name: 'get_stats', description: 'סטטיסטיקות מצרפיות (אירועים, ישויות, הצלבות, טווח תאריכים)' },
];

function McpUrlField() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — surface a hint via the button label
      setCopied(false);
    }
  }

  return (
    <div className="flex items-stretch gap-2 mt-2">
      <code
        className="flex-1 bg-stone-800 text-white font-mono rounded-md px-4 py-2 text-sm sm:text-base flex items-center"
        dir="ltr"
      >
        {MCP_URL}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-stone-800 text-white rounded-md text-sm font-medium hover:bg-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 transition-colors"
        aria-label={copied ? 'הועתק' : 'העתק את כתובת ה-MCP'}
      >
        {copied
          ? <Check className="w-4 h-4" aria-hidden="true" />
          : <Copy className="w-4 h-4" aria-hidden="true" />}
        {copied ? 'הועתק' : 'העתק'}
      </button>
    </div>
  );
}

function McpBlock() {
  return (
    <section
      aria-labelledby="mcp-heading"
      className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6"
    >
      {/* Header: title + closed-beta badge */}
      <div className="flex items-center flex-wrap gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-amber-700 shrink-0" aria-hidden="true" />
        <h2 id="mcp-heading" className="text-lg sm:text-xl font-bold text-gray-900">
          MCP — חיבור ישיר ל-Claude / ChatGPT
        </h2>
        <span className="bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5 text-xs font-medium">
          ביתא סגורה
        </span>
      </div>

      {/* One-paragraph description */}
      <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-5">
        ה-MCP server של יומן לעם מאפשר ל-Claude.ai, ChatGPT, Cursor וכלי AI נוספים לשלוף את הנתונים
        המעובדים של יומן לעם ישירות בתוך השיחה — חיפוש אירועים, הצלבות בין יומנים, רשימות ישויות
        וסטטיסטיקות. בניגוד ל-REST API שלמטה שפתוח לציבור, ה-MCP מוגן ופתוח רק למשתמשים מוזמנים מראש.
      </p>

      {/* URL + copy */}
      <div className="mb-5">
        <p className="text-xs sm:text-sm text-gray-600 mb-1">כתובת ה-MCP server</p>
        <McpUrlField />
      </div>

      {/* Two sub-cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Access */}
        <div className="bg-white border border-amber-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2 inline-flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-amber-700" aria-hidden="true" />
            איך מקבלים גישה?
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed">
            לפנות בדוא"ל ל-
            <a
              href={MAILTO}
              className="text-amber-800 font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
            >
              {CONTACT_EMAIL}
            </a>{' '}
            עם:
          </p>
          <ul className="text-sm text-gray-700 mt-2 space-y-1 mr-5 list-disc">
            <li>כתובת ה-Gmail שתשמש להתחברות (חובה — לפי הכתובת תיווצר ההזמנה)</li>
            <li>בקצרה, מטרת השימוש</li>
          </ul>
          <p className="text-xs text-gray-500 mt-3">
            תקבל אישור במייל ברגע שהחשבון יופעל — בדרך-כלל תוך יום-יומיים.
          </p>
        </div>

        {/* Connect */}
        <div className="bg-white border border-amber-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2 inline-flex items-center gap-1.5">
            <Plug className="w-4 h-4 text-amber-700" aria-hidden="true" />
            איך מתחברים מ-Claude.ai
          </h3>
          <ol className="text-sm text-gray-700 space-y-2 mr-5 list-decimal">
            <li>
              ב-Claude.ai פתח <strong>Settings</strong> ← <strong>Connectors</strong>
            </li>
            <li>
              לחץ <strong>Add custom connector</strong>
            </li>
            <li>
              הדבק את הכתובת שלמעלה ולחץ <strong>Add</strong>
            </li>
            <li>
              תיפתח חלונית Google — התחבר עם אותה כתובת Gmail שהזמנת
            </li>
            <li>
              בשיחה חדשה: לחץ <strong>+</strong> ← סמן את <strong>OCAL</strong> ← שאל למשל
              <em> "באוקאל, מה הסטטיסטיקות?"</em>
            </li>
          </ol>
          <p className="text-xs text-gray-500 mt-3">
            ChatGPT / Cursor / MCP Inspector — תהליך זהה, אותו URL.
          </p>
        </div>
      </div>

      {/* Tools list */}
      <details className="mt-5 group">
        <summary className="text-sm font-medium text-amber-900 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded px-1">
          הכלים הזמינים ב-MCP (6)
        </summary>
        <ul className="mt-3 space-y-2 text-sm" role="list">
          {MCP_TOOLS.map((t) => (
            <li key={t.name} className="flex items-start gap-2">
              <code
                className="font-mono text-xs bg-white border border-amber-200 px-1.5 py-0.5 rounded text-amber-900 shrink-0 mt-0.5"
                dir="ltr"
              >
                {t.name}
              </code>
              <span className="text-gray-700 text-xs sm:text-sm">{t.description}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function ApiPage() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="bg-gradient-to-b from-primary-800 to-primary-700 text-white py-10 sm:py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Code2 className="w-7 h-7 sm:w-8 sm:h-8 text-primary-200" aria-hidden="true" />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">API ציבורי</h1>
          </div>
          <p className="text-primary-100 text-sm sm:text-base">
            כל נקודות הקצה פתוחות לציבור, ללא צורך באימות — לקריאה, סינון והורדה של נתונים
          </p>
        </div>
      </section>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <McpBlock />
        <ApiDocsSection alwaysOpen />
      </div>
    </div>
  );
}
