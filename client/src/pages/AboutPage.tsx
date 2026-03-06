export function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">אודות יומן לעם</h1>

      <div className="prose prose-lg text-gray-700 space-y-4">
        <p>
          יומן לעם הוא פלטפורמה ציבורית המאחדת יומני עבודה של נבחרי ציבור
          וגורמים ממשלתיים בישראל, במטרה לקדם שקיפות ציבורית.
        </p>

        <p>
          הנתונים מגיעים ממאגר הנתונים הפתוח של ישראל ומוצגים בממשק ידידותי
          לחיפוש ולוח שנה.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">מה ניתן לעשות כאן?</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>לחפש אירועים ביומני נבחרי ציבור</li>
          <li>לצפות בלוח שנה משולב של כל היומנים</li>
          <li>לסנן לפי מקור, תאריך, מיקום ומשתתפים</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">נגישות</h2>
        <p>
          אתר זה נבנה בהתאם להנחיות נגישות WCAG 2.1 ברמה AA.
          אם נתקלתם בבעיית נגישות, אנא פנו אלינו.
        </p>
      </div>
    </div>
  );
}
