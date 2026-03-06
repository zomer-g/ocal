import { useSiteContent } from '@/hooks/useContent';

const DEFAULTS = {
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

export function AboutPage() {
  const { data: content } = useSiteContent();
  const about = content?.about;

  const title = about?.title ?? DEFAULTS.title;
  const paragraphs = about?.paragraphs ?? DEFAULTS.paragraphs;
  const features = about?.features ?? DEFAULTS.features;
  const accessibilityNote = about?.accessibilityNote ?? DEFAULTS.accessibilityNote;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">{title}</h1>

      <div className="prose prose-lg text-gray-700 space-y-4">
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}

        {features.length > 0 && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mt-8">מה ניתן לעשות כאן?</h2>
            <ul className="list-disc list-inside space-y-2">
              {features.map((feat, i) => (
                <li key={i}>{feat}</li>
              ))}
            </ul>
          </>
        )}

        {accessibilityNote && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mt-8">נגישות</h2>
            <p>{accessibilityNote}</p>
          </>
        )}
      </div>
    </div>
  );
}
