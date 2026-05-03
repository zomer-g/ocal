/**
 * About page — static content per project description.
 *
 * Structure mirrors the canonical Hebrew text. Headings use <h2>; lists
 * use <ul>; external links open in a new tab with rel=noopener noreferrer.
 * Links are styled with the primary palette and underline on hover so RTL
 * readers can scan them easily.
 */

const linkClass =
  'text-primary-700 hover:text-primary-900 hover:underline font-medium';

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
    >
      {children}
    </a>
  );
}

export function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">אודות יומן לעם</h1>

      <div className="prose prose-lg text-gray-700 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 mt-8">מהו הפרויקט?</h2>
        <p>
          "יומן לעם" הוא פרויקט שמטרתו לרכז, להציג ולהנגיש לציבור את יומני הפגישות
          של נבחרי ציבור ועובדי מדינה בכירים בישראל. אנו מאמינים כי שקיפות היא אבן
          יסוד בדמוקרטיה, וגישה נוחה למידע על פעילותם של נציגינו היא זכות בסיסית של
          כל אזרח.
        </p>
        <p>
          הפלטפורמה מציגה יומנים המבוססים בעיקרם על בקשות חופש מידע, שפורסמו באתר{' '}
          <ExternalLink href="https://www.odata.org.il">"מידע לעם"</ExternalLink>,
          מעבדת אותם, ומציגה אותם בממשק אחיד, נוח לחיפוש ולניתוח.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">למי מיועד האתר?</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>אזרחים המעוניינים לעקוב אחר פעילות נבחרי הציבור.</li>
          <li>עיתונאים וגופי תקשורת המחפשים מידע לתחקירים.</li>
          <li>חוקרים וארגוני חברה אזרחית המנתחים מדיניות ציבורית.</li>
          <li>כל מי שמאמין בחשיבותה של שקיפות במגזר הציבורי.</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">מה ניתן לעשות כאן?</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>לצפות בלוח שנה מאוחד של כל היומנים.</li>
          <li>לסנן ולהציג יומנים ספציפיים ("שכבות").</li>
          <li>לחפש פגישות לפי נושא, משתתפים, מקום ותאריך.</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          מי עומד מאחורי הפרויקט?
        </h2>
        <p>
          את הפרויקט מוביל <strong>עו"ד גיא זומר</strong>, מייסד עמותת התמנון, עמותת
          הצלחה והתנועה לחופש המידע. הפרויקט הוא חלק ממשפחת מיזמים אקטיביסטיים בממשק
          שבין דאטה, משפט וטכנולוגיה — לעיון בכלל המיזמים:{' '}
          <ExternalLink href="https://www.z-g.co.il/projects">
            https://www.z-g.co.il/projects
          </ExternalLink>
          .
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          משפחת המיזמים "לעם"
        </h2>
        <p>
          "יומן לעם" הוא חלק ממשפחת מיזמים שמטרתם הנגשת מידע ציבורי ושקיפות שלטונית
          בישראל:
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <ExternalLink href="https://www.odata.org.il">
              <strong>מידע לעם</strong>
            </ExternalLink>{' '}
            — פלטפורמת המידע הפתוח שמהווה תשתית הנתונים של המשפחה. בה מתפרסמים מסמכי
            חופש המידע שמהם נבנה גם "יומן לעם".
          </li>
          <li>
            <ExternalLink href="https://www.ocoi.org.il">
              <strong>ניגוד עניינים לעם</strong>
            </ExternalLink>{' '}
            — מרכז ומנגיש את הסדרי ניגוד העניינים של בעלי תפקידים ציבוריים, השלמה
            טבעית למעקב אחר היומנים שלהם.
          </li>
          <li>
            <ExternalLink href="https://www.over.org.il">
              <strong>גרסאות לעם</strong>
            </ExternalLink>{' '}
            — מעקב גרסאות אחרי מאגרי{' '}
            <ExternalLink href="http://data.gov.il">data.gov.il</ExternalLink>,
            לזיהוי שינויים שקטים בנתונים שמתפרסמים לציבור.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">מדיניות פרטיות</h2>
        <p>
          השימוש באתר עשוי לכלול איסוף מידע אודות משתמשים, וכן שימוש ועיבוד של
          חומרים ומסמכים שהועלו למערכת לצורך הפעלת השירות ושיפורו.
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>מידע שנאסף</strong>: מידע טכני על השימוש באתר וכן מסמכים ותוכן
            שהמשתמש מעלה למערכת.
          </li>
          <li>
            <strong>שימוש במידע</strong>: להפעלת השירות, שיפורו, ניתוח פעילות המערכת
            ועיבוד מסמכים לצורך חיפוש וסיווג.
          </li>
          <li>
            <strong>אבטחת מידע</strong>: ננקטים אמצעים סבירים להגנה על המידע, אולם
            לא ניתן להבטיח הגנה מוחלטת מפני אירועי אבטחה.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">קוד מקור</h2>
        <p>
          <ExternalLink href="https://github.com/zomer-g/ocal">
            https://github.com/zomer-g/ocal
          </ExternalLink>
          .
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">נגישות</h2>
        <p>
          אתר זה נבנה בהתאם להנחיות נגישות WCAG 2.1 ברמה AA. אם נתקלתם בבעיית
          נגישות, אנא פנו אלינו.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">יצירת קשר</h2>
        <p>
          לדליפות מידע, בעיות נגישות, הארות, הערות, ושלל צרות —{' '}
          <a
            href="mailto:zomer@octopus.org.il"
            className={linkClass}
          >
            zomer@octopus.org.il
          </a>
          .
        </p>
      </div>
    </div>
  );
}
