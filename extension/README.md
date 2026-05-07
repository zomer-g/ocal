# Ocal Browser Extension

תוסף Chrome (Manifest V3) שמסמן בדף כל שם שמופיע ב-DB של [ocal.org.il](https://ocal.org.il), ובריחוף עכבר מציג את **5 הפגישות האחרונות** של אותו אדם.

## איך זה עובד

1. הפעלה ידנית — לחיצה על אייקון התוסף בסרגל הכלים מזריקה content script לטאב הנוכחי וסורקת אותו.
2. רשימת השמות מגיעה מ-`https://ocal.org.il/api/public/entities?type=person` (top 200, נשמרת ב-cache לשעה).
3. כל שם שתואם מקבל קו תחתון מקווקו עדין.
4. ריחוף → קריאה ל-`/api/public/events?entity_names=<NAME>&sort=date_desc&per_page=5`.
5. שם שמחזיר 0 פגישות מאבד את הסימון מכל הדף עד טעינה מחדש.

## פיתוח

```bash
# מהשורש של ה-monorepo
npm install
npm run build:ext
```

זה יוצר `extension/dist/` עם כל הקבצים הדרושים. ב-Chrome:

1. ניווט ל-`chrome://extensions`.
2. הפעלת **Developer mode** (פינה ימנית למעלה).
3. **Load unpacked** → לבחור את התיקייה `extension/dist`.
4. נעוץ את האייקון לסרגל הכלים, ונסה על דף שמזכיר נבחרי ציבור (למשל כתבה ב-ynet).

### Watch mode

```bash
cd extension
npm run dev
```

הקבצים נבנים מחדש אוטומטית. ב-Chrome יש ללחוץ "Reload" על התוסף בעמוד `chrome://extensions` כדי לקלוט את השינוי.

## מבנה

```
extension/
├── public/
│   ├── manifest.json       Manifest V3
│   └── icons/{16,32,48,128}.png
└── src/
    ├── background.ts       Service worker — fetch + cache
    ├── content.ts          סריקת DOM + סימון שמות + delegated hover
    ├── tooltip.ts          רינדור Shadow-DOM tooltip
    ├── tooltip.css         סגנונות tooltip
    └── types.ts            ממשקי TypeScript משותפים
```

## Caching

- `chrome.storage.local["ocal:people:v1"]` — רשימת שמות, TTL שעה.
- `chrome.storage.local["ocal:events:<lower(name)>"]` — אירועים לפי שם, TTL 10 דקות.

## הערות

- האייקונים הנוכחיים הם placeholder כחול אחיד (נוצרים ע"י `node generate-icons.mjs`). להחליף לעיצוב אמיתי לפני פרסום.
- אין כרגע פרסום ב-Chrome Web Store. לפרסום נדרש privacy policy, screenshots, justifications לכל permission, וכו' — ראה skill `chrome-extension`.
- אין deep-link לאירוע ספציפי באתר Ocal (אין route ל-`/event/:id` ב-`client/src/App.tsx`), לכן ה-tooltip לא מקשר לאירועים בודדים.
