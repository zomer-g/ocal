# Chrome Web Store — Store Listing

טקסטים מוכנים להדבקה לטופס ה-Store Listing ב-Chrome Web Store Developer Dashboard. מילוי שתי שפות: עברית (default) ואנגלית.

הסגנון תואם את [www.z-g.co.il/legal-tools](https://www.z-g.co.il/legal-tools) — פורמלי, ענייני, ללא הייפ שיווקי.

---

## עברית (he) — default locale

### Name (75 chars max)
`Ocal — חיפוש פגישות של נבחרי ציבור`

### Summary (132 chars max)
`סימון אוטומטי של שמות נבחרי ציבור בכל דף, עם תצוגת 5 הפגישות האחרונות שלהם מתוך מאגר היומנים הציבוריים של ocal.org.il.`

### Detailed Description (16,000 chars max)
```
Ocal — חיפוש פגישות של נבחרי ציבור

תוסף חינמי לדפדפן Chrome המאפשר לזהות בכל דף שמות של נבחרי ציבור ובכירי ממשל
ישראליים, ולהציג בריחוף עכבר את חמש הפגישות האחרונות שלהם מתוך מאגר היומנים
הפתוח של ocal.org.il.

הנתונים מקורם ב-odata.org.il (פורטל הנתונים הממשלתי הפתוח), נשאבים ומוצגים
על ידי הפלטפורמה הציבורית ocal.org.il.

מה התוסף עושה:
• סורק את הדף הנוכחי בלחיצה על האייקון בסרגל הכלים
• מסמן בקו תחתון מקווקו עדין כל שם של נבחר ציבור שמופיע במאגר
• בריחוף עכבר על שם — מציג חלונית עם 5 הפגישות האחרונות שלו (תאריך, כותרת, מקור)
• עובד על כל דף — חדשות, מסמכים, מיילים, רשתות חברתיות

פרטיות ושקיפות:
• התוסף לא קורא את תוכן הדף שלך באופן כללי, אלא רק מחפש בו התאמות
  לרשימת שמות מוכרת מראש שנשלפת מ-ocal.org.il
• היחיד מידע שנשלח לשרת הוא שמות שכבר זוהו על הדף (ולא הטקסט עצמו, לא ה-URL,
  לא היסטוריית הגלישה)
• אין שיתוף נתונים עם צדדים שלישיים מעבר ל-ocal.org.il עצמה
• כל המטמון נשמר מקומית בדפדפן (chrome.storage.local) ונמחק עם מחיקת התוסף
• קוד המקור פתוח לעיון: https://github.com/zomer-g/ocal

מגבלות והבהרות:
• התוסף מזהה רק שמות שמופיעים כיום במאגר ocal.org.il (top-200 הנבחרים
  המופיעים ביותר). שמות נדירים יותר עשויים שלא להיות מסומנים
• הפגישות המוצגות הן הרשומות ביומנים הרשמיים שפורסמו בפורטל הממשלתי
  הפתוח — לא כל פגישה רשומה ביומן
• שם שמופיע במאגר אך אין לו פגישות זמינות יוסר מהסימון אחרי הריחוף הראשון

יצירת קשר ותמיכה:
guy@z-g.co.il
https://www.z-g.co.il
```

### Category
`Productivity` (תפוקה ויעילות)

### Language
`Hebrew`

---

## English (en)

### Name
`Ocal — Israeli Public Officials Lookup`

### Summary
`Highlights names of Israeli public officials on any page and shows their last 5 meetings from the public diary database at ocal.org.il.`

### Detailed Description
```
Ocal — Israeli Public Officials Lookup

A free Chrome extension that identifies names of Israeli public officials and
senior government figures on any web page, and displays their five most recent
meetings on hover, sourced from the public diary database at ocal.org.il.

The underlying data comes from odata.org.il (the Israeli government's open
data portal), aggregated and served by the public ocal.org.il platform.

What this extension does:
• Scans the current page when you click the toolbar icon
• Marks every public-official name that appears in the database with a
  subtle dotted underline
• On hover — shows a tooltip with that person's 5 most recent meetings
  (date, title, source diary)
• Works on any page — news sites, documents, email, social media

Privacy & transparency:
• The extension does not read your page content broadly. It only searches
  for matches against a known list of names fetched from ocal.org.il
• The only data sent to the server is names already identified on the page
  (not the page text, not the URL, not your browsing history)
• No data is shared with third parties beyond ocal.org.il itself
• All caching is stored locally in the browser (chrome.storage.local) and
  is removed when the extension is uninstalled
• Source code is open: https://github.com/zomer-g/ocal

Limitations & disclaimers:
• The extension recognizes only names currently in the ocal.org.il
  database (top 200 most-mentioned officials). Less frequent names may
  not be marked
• The displayed meetings are records from the official diaries published
  on the government open-data portal — not every meeting is logged in a
  diary
• A name in the database that has no available meetings will be unmarked
  after the first hover

Contact & support:
guy@z-g.co.il
https://www.z-g.co.il
```

### Category
`Productivity`

---

## Visual Assets

| Asset | Size | Source | Status |
|---|---|---|---|
| Store icon | 128×128 PNG | `public/icons/128.png` | ✓ generated |
| Screenshot 1 | 1280×800 PNG | TBD — capture on a ynet article | ⏳ pending capture |
| Screenshot 2 | 1280×800 PNG | TBD — capture tooltip open | ⏳ pending capture |
| Small promo tile | 440×280 PNG | optional | — skip for first submission |
| Marquee tile | 1400×560 PNG | only for featured | — skip |

### Screenshot capture plan
1. Open `https://www.ynet.co.il` and find an article that names a sitting minister (e.g., "יריב לוין", "בצלאל סמוטריץ").
2. Click the Ocal toolbar icon.
3. Wait for marks to appear (dotted underline).
4. Hover over a marked name. Screenshot at 1280×800 with the tooltip open.
5. Repeat on a second article (different official) for screenshot #2.
