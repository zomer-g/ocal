import { useState, useEffect } from 'react';
import { useAdminContent, useUpdateContent } from '@/hooks/useContent';
import type { HeaderContent, FooterContent, AboutContent } from '@/api/content';
import { Loader2, Save, CheckCircle, AlertCircle, FileText, Layout, Columns } from 'lucide-react';

type Tab = 'header' | 'footer' | 'about';

const TABS: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: 'header', label: 'כותרת עליונה', icon: Layout },
  { key: 'footer', label: 'כותרת תחתונה', icon: Columns },
  { key: 'about', label: 'עמוד אודות', icon: FileText },
];

// ─── Shared save status ───────────────────────────────────────────────────────

function SaveStatus({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  return (
    <span className={`flex items-center gap-1.5 text-sm ${
      status === 'saving' ? 'text-gray-500' :
      status === 'saved'  ? 'text-green-600' :
      'text-red-600'
    }`}>
      {status === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
      {status === 'saved'  && <CheckCircle className="w-4 h-4" />}
      {status === 'error'  && <AlertCircle className="w-4 h-4" />}
      {status === 'saving' ? 'שומר...' : status === 'saved' ? 'נשמר בהצלחה' : 'שגיאה בשמירה'}
    </span>
  );
}

// ─── Header editor ────────────────────────────────────────────────────────────

const HEADER_DEFAULTS: HeaderContent = { siteName: 'יומן לעם' };

function HeaderEditor({ initial }: { initial?: HeaderContent }) {
  const [form, setForm] = useState<HeaderContent>({ ...HEADER_DEFAULTS, ...initial });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { mutateAsync } = useUpdateContent();

  useEffect(() => { if (initial) setForm({ ...HEADER_DEFAULTS, ...initial }); }, [initial]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await mutateAsync({ key: 'header', value: form });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">שם האתר</label>
        <input
          type="text"
          value={form.siteName}
          onChange={(e) => setForm({ ...form, siteName: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="יומן לעם"
          dir="rtl"
        />
        <p className="text-xs text-gray-400 mt-1">מוצג בכותרת האתר ובלשונית הדפדפן</p>
      </div>

      <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="flex items-center gap-2 px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          שמור
        </button>
        <SaveStatus status={saveStatus} />
      </div>
    </div>
  );
}

// ─── Footer editor ────────────────────────────────────────────────────────────

function FooterEditor({ initial }: { initial?: FooterContent }) {
  const defaults: FooterContent = {
    tagline: 'יומן לעם — פלטפורמה לשקיפות ציבורית',
    subtext: 'הנתונים מבוססים על מידע ממאגר הנתונים הפתוח של ישראל',
  };
  const [form, setForm] = useState<FooterContent>({ ...defaults, ...initial });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { mutateAsync } = useUpdateContent();

  useEffect(() => { if (initial) setForm({ ...defaults, ...initial }); }, [initial]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await mutateAsync({ key: 'footer', value: form });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">טקסט ראשי</label>
        <input
          type="text"
          value={form.tagline}
          onChange={(e) => setForm({ ...form, tagline: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          dir="rtl"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">טקסט משני</label>
        <input
          type="text"
          value={form.subtext}
          onChange={(e) => setForm({ ...form, subtext: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          dir="rtl"
        />
        <p className="text-xs text-gray-400 mt-1">מוצג מתחת לטקסט הראשי בגוון בהיר יותר</p>
      </div>

      <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="flex items-center gap-2 px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          שמור
        </button>
        <SaveStatus status={saveStatus} />
      </div>
    </div>
  );
}

// ─── About editor ─────────────────────────────────────────────────────────────

function AboutEditor({ initial }: { initial?: AboutContent }) {
  const defaults: AboutContent = {
    title: 'אודות יומן לעם',
    paragraphs: [
      'יומן לעם הוא פלטפורמה ציבורית המאחדת יומני עבודה של נבחרי ציבור וגורמים ממשלתיים בישראל, במטרה לקדם שקיפות ציבורית.',
      'הנתונים מגיעים ממאגר הנתונים הפתוח של ישראל ומוצגים בממשק ידידותי לחיפוש ולוח שנה.',
    ],
    features: [
      'לחפש אירועים ביומני נבחרי ציבור',
      'לצפות בלוח שנה משולב של כל היומנים',
      'לסנן לפי מקור, תאריך, מיקום ומשתתפים',
    ],
    accessibilityNote: 'אתר זה נבנה בהתאם להנחיות נגישות WCAG 2.1 ברמה AA. אם נתקלתם בבעיית נגישות, אנא פנו אלינו.',
  };
  const [form, setForm] = useState<AboutContent>({ ...defaults, ...initial });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { mutateAsync } = useUpdateContent();

  useEffect(() => { if (initial) setForm({ ...defaults, ...initial }); }, [initial]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await mutateAsync({ key: 'about', value: form });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    }
  };

  // ── Paragraph helpers
  const updateParagraph = (i: number, val: string) => {
    const next = [...form.paragraphs];
    next[i] = val;
    setForm({ ...form, paragraphs: next });
  };
  const addParagraph = () => setForm({ ...form, paragraphs: [...form.paragraphs, ''] });
  const removeParagraph = (i: number) =>
    setForm({ ...form, paragraphs: form.paragraphs.filter((_, idx) => idx !== i) });

  // ── Feature helpers
  const updateFeature = (i: number, val: string) => {
    const next = [...form.features];
    next[i] = val;
    setForm({ ...form, features: next });
  };
  const addFeature = () => setForm({ ...form, features: [...form.features, ''] });
  const removeFeature = (i: number) =>
    setForm({ ...form, features: form.features.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">כותרת העמוד</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          dir="rtl"
        />
      </div>

      {/* Paragraphs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">פסקאות תוכן</label>
          <button
            onClick={addParagraph}
            className="text-xs text-primary-700 hover:text-primary-800 font-medium"
          >
            + הוסף פסקה
          </button>
        </div>
        <div className="space-y-3">
          {form.paragraphs.map((para, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                value={para}
                onChange={(e) => updateParagraph(i, e.target.value)}
                rows={3}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
                dir="rtl"
                placeholder={`פסקה ${i + 1}`}
              />
              {form.paragraphs.length > 1 && (
                <button
                  onClick={() => removeParagraph(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors self-start mt-1"
                  aria-label="מחק פסקה"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Features list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">רשימת יכולות (מה ניתן לעשות?)</label>
          <button
            onClick={addFeature}
            className="text-xs text-primary-700 hover:text-primary-800 font-medium"
          >
            + הוסף פריט
          </button>
        </div>
        <div className="space-y-2">
          {form.features.map((feat, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-gray-400 text-sm shrink-0">•</span>
              <input
                type="text"
                value={feat}
                onChange={(e) => updateFeature(i, e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                dir="rtl"
                placeholder={`יכולת ${i + 1}`}
              />
              {form.features.length > 1 && (
                <button
                  onClick={() => removeFeature(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="מחק פריט"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Accessibility note */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">הצהרת נגישות</label>
        <textarea
          value={form.accessibilityNote}
          onChange={(e) => setForm({ ...form, accessibilityNote: e.target.value })}
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
          dir="rtl"
        />
      </div>

      <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="flex items-center gap-2 px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          שמור
        </button>
        <SaveStatus status={saveStatus} />
      </div>
    </div>
  );
}

// ─── Main ContentPage ─────────────────────────────────────────────────────────

export function ContentPage() {
  const [activeTab, setActiveTab] = useState<Tab>('header');
  const { data: content, isLoading } = useAdminContent();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">עריכת תוכן האתר</h1>
        <p className="text-sm text-gray-500 mt-1">שינויים יכנסו לתוקף מיד לאחר השמירה</p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6 gap-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-700 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {activeTab === 'header' && <HeaderEditor initial={content?.header} />}
        {activeTab === 'footer' && <FooterEditor initial={content?.footer} />}
        {activeTab === 'about'  && <AboutEditor  initial={content?.about}  />}
      </div>
    </div>
  );
}
