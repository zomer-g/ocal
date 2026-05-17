# Ocal MCP Server — בדיקה וחיבור

מסמך זה מסביר איך לוודא שה-MCP server של Ocal עובד, ואיך משתמש מוזמן מחבר את עצמו ל-Claude/ChatGPT.

## מה זה?

`https://ocal.org.il/mcp` הוא שרת MCP (Model Context Protocol) שמאפשר ל-Claude, ChatGPT וכלי AI אחרים לשלוף ישירות את הדאטה המעובד של Ocal — חיפוש אירועים, ישויות שחולצו (NER), הצלבות בין יומנים, וסטטיסטיקות.

הגישה היא **closed beta** — רק משתמשים שמופיעים בטבלת `api_users` יכולים להתחבר. ההזדהות היא דרך Google OAuth + PKCE לפי MCP Authorization Spec של יוני 2025.

## כלים זמינים

| Tool | מה הוא עושה |
|---|---|
| `search_events` | חיפוש FTS בעברית/אנגלית על כל האירועים, עם פילטרים לתאריך, מקור, ישות, מיקום |
| `get_event` | אירוע בודד + כל ה-entities + cross-refs + similar events |
| `list_entities` | רשימת אנשים/ארגונים/מקומות לפי תדירות אזכור |
| `list_sources` | רשימת היומנים הציבוריים שמופעים במערכת |
| `find_meetings_between` | אירועים ששני אנשים מופיעים בהם — מי נפגש עם מי |
| `get_stats` | סטטיסטיקות מצרפיות על המאגר |

## למנהל המערכת — איך מזמינים משתמש

1. להיכנס ל-`/admin/mcp-users` (admin בלבד)
2. למלא email + שם + tier (`beta` כברירת מחדל) + קוואטה חודשית אופציונלית
3. ללחוץ "הזמן" — המשתמש מתווסף ל-`api_users` עם `is_active=true`

> **חשוב**: כתובת ה-email חייבת להתאים לחשבון Google שהמשתמש ישתמש בו לחיבור.

## למשתמש — איך מחברים את Claude.ai

1. Settings → **Connectors** → **Add custom connector**
2. URL: `https://ocal.org.il/mcp`
3. Claude יזהה אוטומטית את שרת ה-OAuth דרך `.well-known/oauth-protected-resource`
4. תיפתח חלונית התחברות עם Google — להתחבר עם הכתובת שהוזמנה
5. אחרי האישור, ה-connector יופיע ברשימה ושלושת ה-tools יהיו זמינים בשיחה

## בדיקה ידנית של ה-MCP — שלב אחר שלב

### 0. הרצת מיגרציות

```powershell
npm --prefix server run migrate
```

צריך לראות את 5 המיגרציות (`029_create_api_users` עד `033_create_mcp_usage_daily`) רצות.

### 1. בדיקת OAuth metadata

```powershell
curl https://ocal.org.il/mcp/.well-known/oauth-protected-resource
curl https://ocal.org.il/mcp/.well-known/oauth-authorization-server
```

צריך לקבל JSON עם `authorization_servers`, `token_endpoint`, וכו'. אם לא — השרת לא רץ או ה-route לא מחובר.

### 2. בדיקה ש-MCP דורש auth

```powershell
curl -i -X POST https://ocal.org.il/mcp -H "Content-Type: application/json" -d '{}'
```

צריך לחזור **401 Unauthorized** + header `WWW-Authenticate: Bearer ... resource_metadata="..."`. זה ה-trigger ש-Claude.ai משתמש בו לזיהוי שיש OAuth.

### 3. בדיקה עם MCP Inspector

הכלי הרשמי לבדיקת שרתי MCP:

```powershell
npx @modelcontextprotocol/inspector
```

יפתח דפדפן בלוקאלהוסט. שם:
1. Transport: **SSE / Streamable HTTP**
2. URL: `https://ocal.org.il/mcp` (או `http://localhost:3001/mcp` בלוקאלי)
3. **Connect** — יתחיל OAuth flow אוטומטית, יפתח חלון Google
4. להתחבר עם email שהזמנת ב-`/admin/mcp-users`
5. אחרי האישור: בטאב **Tools** צריכים להופיע 6 כלים
6. ללחוץ על `search_events` → להריץ עם `{"query": "ראש הממשלה", "limit": 5}` → לקבל JSON עם 5 אירועים

### 4. בדיקה שה-usage מתועד

אחרי שהרצת tool דרך ה-Inspector:

```sql
SELECT tool_name, result_count, latency_ms, status, created_at
FROM mcp_usage_events
WHERE api_user_id = (SELECT id FROM api_users WHERE email = 'YOUR_EMAIL')
ORDER BY created_at DESC
LIMIT 10;
```

צריך לראות שורה לכל קריאה ל-tool. אם ריק — ה-logger לא מתועד (לבדוק logs של השרת).

### 5. בדיקת אגרגציה

ה-aggregator רץ פעם ביום אוטומטית, אבל אפשר להריץ ידנית מ-Node REPL:

```javascript
import('./server/src/services/mcpUsageAggregator.js').then(m => m.runMcpUsageAggregation()).then(console.log);
```

אחר כך:

```sql
SELECT * FROM mcp_usage_daily ORDER BY day DESC LIMIT 5;
```

### 6. בדיקה שמשתמש לא מורשה נחסם

נסה להתחבר ב-Inspector עם חשבון Google שלא נמצא ב-`api_users` — צריך לקבל דף שגיאה: "אין הרשאה ל-MCP… הכתובת לא מוזמנת".

### 7. בדיקת חיבור אמיתי דרך Claude.ai

זה ה-end-to-end:

1. ב-Claude.ai → Settings → Connectors → Add connector → `https://ocal.org.il/mcp`
2. לאשר את ה-Google login
3. בשיחה רגילה לשאול: "מצא לי באוקאל פגישות של נתניהו עם גלנט בחודש מאי"
4. Claude יקרא ל-`search_events` או `find_meetings_between` אוטומטית ויחזיר תוצאות

### 8. בדיקה בדשבורד admin

לפתוח `/admin/mcp-users` — ליד המשתמש שלך אמורות להופיע מספר קריאות 30 יום ונפח. ללחוץ על השורה כדי לראות פירוט יומי + 50 קריאות אחרונות.

## פתרון בעיות

| תופעה | סיבה אפשרית |
|---|---|
| 401 גם עם token | ה-token פג תוקף (1 שעה). Claude אמור לרענן עם refresh_token אוטומטית; אם לא — להתנתק ולהתחבר מחדש |
| "אין הרשאה" אחרי Google login | ה-email לא ב-`api_users` או `is_active=false` |
| Tools לא רצים, "DB error" | ה-DB לא רץ, או חסרות מיגרציות 029-033 |
| Inspector לא מצליח להתחבר | בדוק שיש `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` ב-env, ושה-redirect URI `https://YOUR_DOMAIN/mcp/oauth/google/callback` רשום ב-Google Cloud Console |
| `usage_events` ריק | ה-INSERT הוא fire-and-forget — לבדוק `logger.error` ב-server logs |

## ארכיטקטורה — איפה מה

```
server/src/mcp/
├── config.ts                  ◄── קבועים + helpers (audience, base URL)
├── routes.ts                  ◄── Express Router שמקבץ הכל ב-/mcp
├── server.ts                  ◄── יוצר McpServer לכל בקשה
├── toolContext.ts             ◄── עוטף tool callbacks ב-usage logging
├── oauth/
│   ├── metadata.ts            ◄── .well-known/oauth-*
│   ├── register.ts            ◄── /oauth/register (DCR)
│   ├── authorize.ts           ◄── /oauth/authorize + Google callback
│   └── token.ts               ◄── /oauth/token (PKCE + refresh)
├── middleware/
│   ├── requireMcpAuth.ts      ◄── Bearer JWT verification
│   └── usageLogger.ts         ◄── INSERT mcp_usage_events
└── tools/
    ├── searchEvents.ts
    ├── getEvent.ts
    ├── listEntities.ts
    ├── listSources.ts
    ├── findMeetingsBetween.ts
    └── getStats.ts

server/src/services/mcpUsageAggregator.ts  ◄── סיכום יומי + retention
server/src/routes/admin/mcpUsers.ts        ◄── CRUD להזמנות
server/src/routes/admin/mcpUsage.ts        ◄── דשבורד stats
client/src/pages/admin/McpUsersPage.tsx    ◄── UI ניהול
```
