# CWS Developer Dashboard — Paste-Ready Texts

הטקסטים בקובץ הזה מסודרים בסדר שבו הם מופיעים בטופס ה-Privacy של Chrome Web Store. ניתן לפתוח את הטופס ולהעתיק שדה-שדה.

---

## 1. URLs (Listing → Privacy)

| Field | Value |
|---|---|
| **Privacy policy URL** | `https://www.z-g.co.il/ocal-privacy` |
| **Homepage URL** | `https://www.z-g.co.il/ocal` |
| **Support URL / email** | `mailto:guy@z-g.co.il` |

⚠️ עמודי ה-`/ocal-privacy` ו-`/ocal` חייבים להיות מתפרסמים ב-z-g.co.il **לפני** ההגשה. ראה `Z-G_SITE_INSTRUCTIONS.md` להוראות יצירה של העמודים.

---

## 2. Single Purpose Description

> The extension highlights names of Israeli public officials on any web page the user is reading, and shows that official's most recent meetings from the public diary database at ocal.org.il.

(מילה אחת על המטרה: lookup. כל שאר היכולות — מטמון, רענון, סימון — הן אמצעי לטובת הצגת מידע על נבחר הציבור שמוזכר בדף.)

---

## 3. Permission Justifications

הצדק כל רשאה לפי המבנה: *מה ה-permission, מה הקוד עושה איתו, איזו תועלת המשתמש מקבל*.

### `scripting`
> Required to inject the content script into the active tab when the user clicks the toolbar icon. The content script scans visible text for known public-official names and adds the on-hover tooltip. We use `chrome.scripting.executeScript` with `files`, never with `code` or remote sources.

### `activeTab`
> Used so the extension only acts on the tab the user explicitly chose by clicking the toolbar icon. The extension does not run on other tabs and has no access to them.

### `storage`
> Used by `chrome.storage.local` to cache (a) the list of known officials fetched from ocal.org.il (1-hour TTL), and (b) per-name meeting results (10-minute TTL). Caching avoids redundant API calls and keeps page interaction snappy. No personal data is stored.

### `host_permissions: https://ocal.org.il/*`
> The extension's service worker queries two public, unauthenticated endpoints on this single domain to retrieve the names list and the meetings list:
>   • `GET https://ocal.org.il/api/public/entities?type=person`
>   • `GET https://ocal.org.il/api/public/events?entity_names=<NAME>&sort=date_desc&per_page=5`
> No other origin is contacted.

---

## 4. Data Usage Declarations

| Category | Collected? | Notes |
|---|---|---|
| **Personally identifiable information** (name, email, ID, phone, etc.) | NO | The extension does not collect or transmit any data identifying the end user. Names sent to the server belong to the *public officials being looked up*, not to the user. |
| **Health information** | NO | — |
| **Financial and payment information** | NO | — |
| **Authentication information** | NO | — |
| **Personal communications** | NO | The extension does not read message content. |
| **Location** | NO | — |
| **Web history** | NO | The extension does not record the URL or title of pages the user visits. |
| **User activity** | NO | No clicks, scrolls, hovers, or input events are logged or transmitted. |
| **Website content** | NO | The extension does **not** transmit page content. It only searches the page locally for matches against a pre-fetched whitelist of public-official names. The names sent to the server in the `entity_names` query parameter are names from that whitelist that happened to match — not arbitrary page text. |

### Free-text justification box (paste exactly):
> The extension queries ocal.org.il (a public diary platform) for two things: (1) a list of known public-official names, and (2) the recent meetings of a name the user is hovering over. The only data leaving the browser is the official's name, which is itself public information. No data about the user, the user's device, or the user's browsing is collected or transmitted.

---

## 5. Three Certification Checkboxes

| # | Statement | Tick |
|---|---|---|
| 1 | I do not sell or transfer user data to third parties, apart from the approved use cases described above | ✅ |
| 2 | I do not use or transfer user data for purposes unrelated to my item's single purpose | ✅ |
| 3 | I do not use or transfer user data to determine creditworthiness or for lending purposes | ✅ |

---

## 6. Distribution

| Field | Value |
|---|---|
| Visibility | `Public` |
| Distribution | `All regions` (or restrict to `Israel` if preferred — content is Hebrew/Israeli) |
| Pricing | `Free` |
| In-app purchases | `No` |

---

## 7. Developer Account

| Field | Value |
|---|---|
| Developer name (public) | `Guy Zomer` |
| Developer email (public) | `guy@z-g.co.il` |
| Trader status | The CWS dashboard requires a "Trader / Non-trader" declaration. As a non-commercial open-source project published by an individual, declare **Non-trader**. |

---

## 8. Pre-submission checklist

- [ ] `extension/dist/` builds without errors (`npm run build:ext`)
- [ ] `npm run zip` produces `ocal-extension-v1.0.0.zip` (~10 KB, 9 files, no source maps)
- [ ] The zip loads via `chrome://extensions → Load unpacked` (after extracting to a temp folder)
- [ ] Privacy page is live at `https://www.z-g.co.il/ocal-privacy` and matches `Z-G_SITE_INSTRUCTIONS.md`
- [ ] Support email `guy@z-g.co.il` is monitored
- [ ] At least one 1280×800 screenshot exists (see `STORE_LISTING.md` → "Screenshot capture plan")
- [ ] Reviewer notes pasted from `REVIEWER_NOTES.md`
