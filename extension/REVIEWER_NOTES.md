# Notes for Chrome Web Store Reviewers

Paste this text (or a trimmed version) into the **Notes for reviewers** field of the CWS Developer Dashboard at submission time.

---

## What this extension does

Ocal highlights names of Israeli public officials on any web page the user is reading, and shows their most recent meetings (sourced from the public Israeli government open-data portal odata.org.il, served via ocal.org.il) in a tooltip on hover.

Ocal is a non-commercial public-interest project. The data it surfaces is already public — the extension just makes it accessible in context, while the user reads other content.

## Build & run instructions

The extension ships as a standard Manifest V3 zip. No build step is required to load the submitted artifact — extract the zip and use **Load unpacked**.

If reviewing the source on GitHub:
```
git clone https://github.com/zomer-g/ocal.git
cd ocal
npm install
npm run build:ext
# extension is now at extension/dist/ — load unpacked from there
```

## Architecture & data flow

```
[user clicks toolbar icon]
        ↓
[chrome.action.onClicked]  ── service worker (background.js)
        ↓
chrome.scripting.executeScript(files: ["content.js"])
        ↓
content.js: TreeWalker over text nodes of current page
        ↓
matches against names list (cached from earlier API call)
        ↓
wraps matches in <span class="ocal-mark">

[user hovers over a marked name]
        ↓
content.js sends {type:"getEvents", name} → service worker
        ↓
service worker fetches https://ocal.org.il/api/public/events?...
        ↓
service worker returns events to content script
        ↓
content.js renders tooltip in a closed Shadow DOM
```

Both API endpoints are public, unauthenticated, served by a domain we control (ocal.org.il is the project's own public site). No login is required for any feature.

## Key source files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest. Permissions: `scripting`, `activeTab`, `storage`. Host: `https://ocal.org.il/*` only. |
| `background.js` (compiled from `src/background.ts`) | Service worker. Handles toolbar click, message routing, fetch + cache. |
| `content.js` (compiled from `src/content.ts`) | Injected on demand. DOM walker, name matching, hover delegation. |
| `_locales/he/messages.json`, `_locales/en/messages.json` | i18n strings for name and description. |

## Where data leaves the browser

The extension makes exactly **two** types of HTTPS requests, both to `ocal.org.il`:

1. `GET https://ocal.org.il/api/public/entities?type=person` — fetches the list of known public-official names. Sent on first scan after install / cache expiry (1h). No request body, no cookies.

2. `GET https://ocal.org.il/api/public/events?entity_names=<NAME>&sort=date_desc&per_page=5` — fetches recent meetings for a specific official. Sent on first hover for a name (cached per-name for 10 min). The `<NAME>` parameter is a single official's name (e.g. "יריב לוין") — public information; no user data.

Code locations:
- `src/background.ts` → `getPeopleCached()` — the entities call
- `src/background.ts` → `getEventsCached(name)` — the events call

These are the **only** outbound network calls. The service worker has no other `fetch` invocations.

## Test URLs (publicly accessible, no login)

These pages name sitting Israeli ministers and will produce visible marks + tooltips after clicking the toolbar icon:

1. `https://www.ynet.co.il/news/category/184` — political news front; pages reference current cabinet members.
2. `https://www.gov.il/he/departments/ministries` — government ministries list, mentions ministers.
3. Any current article on `https://www.themarker.com/` mentioning the Justice Minister or Finance Minister.

If no marks appear: the page may not name any of the top-200 most-mentioned officials currently in the ocal.org.il database.

## Steps to verify

1. Install the unpacked extension (Load unpacked → `dist/`).
2. Open one of the test URLs above.
3. Click the Ocal icon in the toolbar.
4. Within ~1 second, names of public officials should gain a dotted blue underline.
5. Hover over any marked name. A tooltip should appear listing up to 5 recent meetings (date, title, source).
6. Open DevTools → Network. Filter by `ocal.org.il`. Confirm only the two endpoints listed above are called, and only when triggered by user action (click + hover).
7. Open DevTools → Application → Storage → Extension storage (`chrome.storage.local`). Verify keys:
   - `ocal:people:v1` — the names list cache
   - `ocal:events:<lowercase-name>` — per-name meeting cache (one entry per name hovered)
8. Click the icon a second time on the same tab — no duplicate marking, no extra network calls if cache is fresh.

## Permissions used (re-stated for self-contained reading)

| Permission | Why |
|---|---|
| `scripting` | Inject `content.js` into the active tab when user clicks icon. `executeScript({files:[...]})` only — never `code:`. |
| `activeTab` | Limit script injection to the user-chosen tab. No other tab is touched. |
| `storage` | `chrome.storage.local` for caching the names list (1h TTL) and per-name meetings (10m TTL). |
| `host_permissions: https://ocal.org.il/*` | Service worker fetches the two public endpoints listed above. No other origin. |

## No remote code execution

- No `eval(`, no `new Function(`, no `<script src="https://…">` anywhere in the codebase.
- `chrome.scripting.executeScript` is called with `files: ["content.js"]` only — never with `code` or `func` referencing remote sources.
- All JS that runs in the extension is bundled into `background.js` and `content.js` at build time via esbuild from local TypeScript sources.

## Source

GitHub: `https://github.com/zomer-g/ocal` (public)

Source for the extension specifically: `extension/` subdirectory.

## Contact

Developer: Guy Zomer  
Email: `guy@z-g.co.il`  
Site: `https://www.z-g.co.il`

If anything in this submission is unclear, please email rather than reject — happy to walk through any concern.
