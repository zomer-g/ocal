/**
 * Shared extraction prompt for both Claude and GPT-4o paths. Output schema
 * is identical across providers so the route layer doesn't need to branch
 * on which one ran.
 */

export const PDF_EXTRACTION_SYSTEM = `אתה עוזר חילוץ נתונים שמטרתו לחלץ אירועי יומן מתוך קובץ PDF סרוק של יומן רשמי בעברית (לדוגמה יומן ראש הממשלה או שר אחר). הקובץ עשוי להיות סרוק ולא דיגיטלי, ולכן ייתכנו טעויות OCR קלות בעברית — תקן אותן בשיקול דעת.

לכל אירוע יומן בודד שאתה מזהה בקובץ, החזר אובייקט JSON עם השדות הבאים:
- title: כותרת האירוע (חובה, מחרוזת לא ריקה)
- start_time: זמן התחלה בפורמט ISO 8601. אם בקובץ מצוין רק תאריך ללא שעה, החזר 00:00 בזמן ישראל. ראה כללי שנה למטה לפני שאתה ממלא שדה זה.
- end_time: זמן סיום ב-ISO 8601 (אופציונלי, רק אם מופיע במפורש)
- location: מקום (אופציונלי)
- participants: משתתפים מופרדים בפסיקים (אופציונלי)
- notes: הערות חופשיות שלא נכנסו לשדות אחרים (אופציונלי)
- confidence: דרגת ביטחון 0..1 (אופציונלי)
- source_page: מספר העמוד ב-PDF שבו האירוע מופיע (חובה אם ידוע)

כללי פלט:
1. החזר רק JSON תקין, ללא markdown, ללא הסברים, ללא טקסט נוסף.
2. הפורמט: { "events": [ { ... }, { ... } ] }.
3. אם אין אירועים, החזר { "events": [] }.
4. אל תמציא נתונים שלא מופיעים בקובץ. אם שדה לא ברור — השמט אותו לחלוטין במקום לנחש.
5. שמור על הסדר הכרונולוגי של האירועים.
6. תאריכים בעברית/לועזית — נרמל לזמן ישראל (Asia/Jerusalem) ולפורמט ISO 8601 עם offset, לדוגמה "2024-03-15T09:30:00+02:00".

כללי שנה (חשובים מאוד — קרא בעיון):
7. השנה של אירוע מותרת רק ממקור מפורש: (א) טקסט בעמוד שאתה רואה כעת, (ב) שם הקובץ או רמז שנה שמופיעים בהודעת המשתמש, או (ג) עמוד שער של ה-PDF המקורי שמצוטט בהודעת המשתמש.
8. אסור להסיק שנה מ"שנה נוכחית", מ"השנה האחרונה שאתה זוכר", או מתאריך הידע שלך. בפרט, אם העמוד מציג רק יום וחודש (לדוגמה "5.3" או "ב' באדר") ושם הקובץ אינו מציין שנה — השנה אינה ידועה.
9. כשהשנה אינה ידועה לפי כלל 7: אל תכלול את שדה start_time כלל באובייקט (השמט אותו לחלוטין). השאר את שאר השדות (title, location, participants, source_page) כדי שעורך אנושי יוכל לתקן את התאריך אחר כך. הוסף ל-notes הערה קצרה כגון "שנה לא ידועה — יום/חודש בעמוד: 5.3".
10. אסור להמציא TZ offset או שעה כדי "להשלים" את ה-ISO. אם רק היום/חודש ברורים, פשוט השמט את start_time כפי שתואר בכלל 9.`;

/**
 * Build the user-message text for one extraction call.
 *
 * The original PDF often carries the year only on the cover sheet. When we
 * extract a single inner page, that context is lost — and an LLM forced to
 * emit a full ISO timestamp will hallucinate a year (typically the current
 * one). Surfacing the filename here gives the model a legitimate source for
 * the year, complementing the strict "do not invent year" rules in the
 * system prompt.
 */
export function buildExtractionUserPrompt(opts: { filename?: string; page?: number } = {}): string {
  const lines: string[] = [];

  if (opts.filename) {
    lines.push(`שם הקובץ המקורי שהועלה: ${opts.filename}`);
    lines.push(
      `אם שם הקובץ מציין שנה (לדוגמה "יומן 2024" או "diary_2024_q1") — השתמש בה כשנה ברירת מחדל לכל האירועים, אלא אם תאריך מפורש בעמוד סותר אותה. אם שם הקובץ אינו מציין שנה — אל תמציא שנה: עקוב אחרי כללי השנה במערכת והשמט את שדה start_time באירועים שהיום/חודש ברור בהם אבל השנה לא.`,
    );
  } else {
    lines.push(
      `שם הקובץ אינו מסופק. השתמש רק בטקסט שמופיע בעמוד עצמו לקביעת שנה. אם הוא מציג רק יום וחודש — השמט את start_time לפי כלל השנה.`,
    );
  }

  if (opts.page) {
    lines.push(
      `העמוד שאתה רואה הוא עמוד מספר ${opts.page} מה-PDF המקורי. חלץ אירועים מעמוד זה בלבד; השתמש ב-${opts.page} בשדה source_page.`,
    );
  }

  lines.push(`חלץ את כל אירועי היומן מהקובץ המצורף לפי הסכמה שתיארתי. החזר JSON בלבד.`);

  return lines.join('\n\n');
}

/**
 * @deprecated Prefer buildExtractionUserPrompt(); kept temporarily for any
 * out-of-tree imports. Will be removed once no callers reference it.
 */
export const PDF_EXTRACTION_USER = buildExtractionUserPrompt();
