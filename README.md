# Ocal — Public Officials' Diary Search

> An open platform for searching and browsing work diaries of Israeli public officials, sourced from [odata.org.il](https://www.odata.org.il).

**Live:** [ocal.org.il](https://ocal.org.il)

---

<div dir="rtl">

## יומן לעם

פלטפורמה ציבורית לחיפוש ועיון ביומני עבודה של נבחרי ציבור וגורמים ממשלתיים בישראל.
הנתונים מגיעים ממאגר הנתונים הממשלתי הפתוח [odata.org.il](https://www.odata.org.il) (CKAN), ומוצגים בממשק ידידותי הכולל חיפוש חופשי, סינון מתקדם ולוח שנה.

### יכולות עיקריות

- **חיפוש חופשי** — חיפוש טקסט מלא (FTS) על פני כל האירועים, עם תמיכה בחיפוש בוליאני (AND / OR)
- **סינון מתקדם** — לפי תאריך, מקור, ישויות (אנשים/ארגונים), מיקום ומשתתפים
- **לוח שנה** — תצוגות חודש, שבוע ויום עם שכבות לכל יומן
- **הצלבת יומנים** — זיהוי פגישות שמופיעות ביומנים של שני הצדדים (אומת / לא אומת)
- **זיהוי ישויות** — חילוץ אוטומטי של אנשים וארגונים מתיאורי אירועים
- **איתור אירועים דומים** — קיבוץ אירועים זהים מיומנים שונים באותו יום
- **סנכרון אוטומטי** — ייבוא תקופתי של נתונים חדשים מ-CKAN
- **ממשק ניהול** — ניהול מקורות, ישויות, סנכרון וייצוא נתונים

</div>

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript, Tailwind CSS, Zustand, TanStack Query, React Router, Vite |
| **Backend** | Node.js, Express, TypeScript, Knex.js, PostgreSQL, BullMQ, Redis |
| **AI** | OpenAI / DeepSeek (optional — for smart field mapping and entity extraction) |
| **Deployment** | Render (web + worker + managed PostgreSQL + Redis) |

---

## Project Structure

```
ocal/
  client/           # React frontend (Vite)
    src/
      api/           # API client functions
      components/    # UI components (search, calendar, admin)
      hooks/         # React Query hooks
      pages/         # Route pages
      stores/        # Zustand state stores
  server/           # Express backend
    src/
      config/        # Environment, database, auth, Redis config
      db/            # Knex migrations
      jobs/          # BullMQ worker for background sync
      middleware/    # Auth, rate limiting, validation
      models/        # Data models and query builders
      routes/        # Public & admin API routes
      services/      # Core logic (sync, pipeline, entity extraction, matching)
      utils/         # Logger, pagination helpers
  shared/           # Shared TypeScript types
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **Docker** (for PostgreSQL and Redis)

### Setup

```bash
# Clone
git clone https://github.com/zomer-g/ocal.git
cd ocal

# Start PostgreSQL and Redis
docker compose up -d

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings (see .env.example for documentation)

# Run database migrations
npm run migrate

# Start development servers (API + frontend)
npm run dev
```

The frontend will be available at `http://localhost:5173` and the API at `http://localhost:3001`.

### Environment Variables

See [`.env.example`](.env.example) for all available configuration options. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string (for BullMQ) |
| `JWT_SECRET` | Yes | Secret for JWT signing (min 16 chars) |
| `GOOGLE_CLIENT_ID` | For admin | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For admin | Google OAuth client secret |
| `ADMIN_EMAILS` | For admin | Comma-separated list of admin email addresses |
| `OPENAI_API_KEY` | Optional | For AI-powered field mapping |
| `DEEPSEEK_API_KEY` | Optional | Alternative LLM for field mapping |

---

## License

[MIT](LICENSE)
