import { logger } from '../utils/logger.js';

/**
 * Field mapping: maps target fields to source column names.
 */
export interface FieldMapping {
  title: string;
  start_date: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  location?: string;
  participants?: string;
  organizer?: string;
  notes?: string;
}

export interface MappingResult {
  mapping: FieldMapping;
  method: 'llm' | 'heuristic' | 'manual';
  confidence: number;
  unmappedFields: string[];
}

/**
 * Heuristic patterns for field detection.
 * Each target field has an array of regex patterns to match against column names.
 * Patterns are checked in order; first match wins.
 */
const HEURISTIC_PATTERNS: Record<keyof FieldMapping, RegExp[]> = {
  title: [
    /^נושא$/i,
    /נושא/i,
    /^title$/i,
    /^subject$/i,
    /כותרת/i,
    /תיאור/i,
    /^description$/i,
    /שם.?אירוע/i,           // "שם אירוע/פגישה", "שם אירוע"
    /שם.?פגישה/i,           // "שם הפגישה", "שם פגישה"
    /^שם$/i,                // "שם" by itself
    /אירוע.?פגישה/i,        // "אירוע/פגישה"
    /פירוט/i,               // "פירוט"
    /סוג.?אירוע/i,          // "סוג אירוע"
    /תוכן/i,               // "תוכן"
    /^event$/i,
    /^summary$/i,
  ],
  start_date: [
    /^תאריך\s*התחלה$/i,
    /תאריך.?התחלה/i,
    /^start.*date$/i,
    /^start$/i,
    /תאריך.?פגישה/i,
    /^תאריך$/i,
    /^date$/i,
    /יום.?בשבוע/i,          // "יום בשבוע" — often contains Excel serial dates
    /^יום$/i,               // "יום"
    /מתאריך/i,              // "מתאריך"
    /תאריך.?אירוע/i,        // "תאריך אירוע"
  ],
  start_time: [
    /^שעת\s*התחלה$/i,
    /שעת.?התחלה/i,
    /^start.*time$/i,
    /^שעה$/i,
    /^time$/i,
    /משעה/i,                // "משעה"
    /שעה.?התחלה/i,          // "שעה התחלה"
  ],
  end_date: [
    /^תאריך\s*סיום$/i,
    /תאריך.?סיום/i,
    /^end.*date$/i,
    /^end$/i,
    /עד.?תאריך/i,           // "עד תאריך"
  ],
  end_time: [
    /^שעת\s*סיום$/i,
    /שעת.?סיום/i,
    /^end.*time$/i,
    /עד.?שעה/i,             // "עד שעה"
    /שעה.?סיום/i,           // "שעה סיום"
  ],
  location: [
    /^מיקום$/i,
    /מיקום/i,
    /^where$/i,
    /^location$/i,
    /מקום/i,
    /חדר/i,
    /^room$/i,
    /משאבי.?פגישה/i,        // "משאבי פגישה" — often contains venue/room info
    /משאבי.?אירוע/i,        // "משאבי אירוע"
    /אולם/i,               // "אולם"
    /כתובת/i,              // "כתובת"
    /^venue$/i,
  ],
  participants: [
    /^מוזמנים$/i,
    /מוזמנים/i,
    /משתתפ/i,
    /^attendee/i,
    /^participant/i,
    /נוכחים/i,
    /^all\s*attendee/i,
    /נפגש.?עם/i,            // "נפגש עם"
    /עם.?מי/i,              // "עם מי"
  ],
  organizer: [
    /מארגן/i,
    /^organiz/i,
    /יוזם/i,
    /^organized\s*by$/i,
    /אחראי/i,              // "אחראי"
    /בעל.?האירוע/i,         // "בעל האירוע"
  ],
  notes: [
    /הערות/i,
    /^notes$/i,
    /סיווג/i,
    /^comments$/i,
    /הערה/i,               // "הערה" (singular)
    /^remarks$/i,
  ],
};

/**
 * Try to map fields using heuristic pattern matching.
 */
export function tryHeuristicMapping(fields: string[]): MappingResult {
  const mapping: Partial<FieldMapping> = {};
  const mapped = new Set<string>();
  let matchCount = 0;

  // Clean field names (trim whitespace)
  const cleanFields = fields.map(f => f.trim());

  for (const [targetField, patterns] of Object.entries(HEURISTIC_PATTERNS)) {
    for (const cleanField of cleanFields) {
      if (mapped.has(cleanField)) continue;

      for (const pattern of patterns) {
        if (pattern.test(cleanField)) {
          (mapping as Record<string, string>)[targetField] = cleanField;
          mapped.add(cleanField);
          matchCount++;
          break;
        }
      }

      if ((mapping as Record<string, string>)[targetField]) break;
    }
  }

  const requiredFields = ['title', 'start_date'];
  const hasRequired = requiredFields.every(f => (mapping as Record<string, string>)[f]);
  const totalPossibleFields = Object.keys(HEURISTIC_PATTERNS).length;
  const confidence = hasRequired
    ? Math.min(1.0, (matchCount / totalPossibleFields) * 1.2) // boost if required fields found
    : matchCount / totalPossibleFields * 0.5;

  const unmappedFields = cleanFields.filter(f => !mapped.has(f));

  logger.info(
    { matchCount, totalPossibleFields, confidence, mapping, unmappedFields },
    'Heuristic field mapping result'
  );

  return {
    mapping: mapping as FieldMapping,
    method: 'heuristic',
    confidence,
    unmappedFields,
  };
}

/** LLM provider configuration */
interface LLMConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

function getLLMConfig(openaiKey?: string, deepseekKey?: string): LLMConfig | null {
  if (deepseekKey) {
    return {
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: deepseekKey,
    };
  }
  if (openaiKey) {
    return {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: openaiKey,
    };
  }
  return null;
}

const LLM_PROMPT = `You are mapping columns from an Israeli public official's calendar/diary (יומן) dataset to a standardized schema.

IMPORTANT data patterns to recognize:
- Excel serial date numbers (e.g. 45270, 45882) represent dates — the column containing them is a date column
- Decimal fractions (e.g. 0.4375, 0.625, 0.708) represent times as fractions of a day — the column containing them is a time column
- Hebrew column names may use creative or non-standard naming (e.g. "שם אירוע/פגישה" = title, "יום בשבוע" with serial numbers = start_date, "משאבי פגישה" with venues = location)

Given these column names: {{FIELDS}}

And these sample records (first 3): {{SAMPLES}}

Map each column to ONE of these target fields:
- title (required): The event subject/title/name
- start_date (required): The event date (look for date strings, serial numbers, or day columns)
- start_time: The event start time (time strings or decimal fractions)
- end_date: The event end date (if separate from start_date)
- end_time: The event end time
- location: The event location/venue/room/resources
- participants: The event participants/attendees/invitees
- organizer: The event organizer
- notes: Notes, comments, or classification

Return ONLY a valid JSON object mapping target field names to source column names.
Only include mappings you are confident about. Do NOT include unmapped fields.
Example: {"title":"נושא","start_date":"תאריך","start_time":"שעת התחלה","location":"מיקום"}`;

/**
 * Try LLM-based field mapping (supports DeepSeek + OpenAI).
 * Falls back to heuristic if LLM fails.
 */
export async function tryLLMMapping(
  fields: string[],
  sampleRecords: Record<string, unknown>[],
  openaiKey?: string,
  deepseekKey?: string,
): Promise<MappingResult> {
  const llmConfig = getLLMConfig(openaiKey, deepseekKey);
  if (!llmConfig) {
    logger.warn('No LLM API key configured, using heuristic only');
    return tryHeuristicMapping(fields);
  }

  try {
    const { default: axios } = await import('axios');

    const prompt = LLM_PROMPT
      .replace('{{FIELDS}}', JSON.stringify(fields))
      .replace('{{SAMPLES}}', JSON.stringify(sampleRecords.slice(0, 3)));

    logger.info({ provider: llmConfig.baseUrl, model: llmConfig.model }, 'Calling LLM for field mapping');

    const response = await axios.post(
      `${llmConfig.baseUrl}/chat/completions`,
      {
        model: llmConfig.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 500,
      },
      {
        headers: { Authorization: `Bearer ${llmConfig.apiKey}` },
        timeout: 20000,
      }
    );

    const content = response.data.choices[0]?.message?.content;
    if (!content) throw new Error('Empty LLM response');

    const llmMapping = JSON.parse(content) as Record<string, string>;

    // Validate: all mapped values must exist in source fields
    const cleanFields = fields.map(f => f.trim());
    const validatedMapping: Partial<FieldMapping> = {};
    const mapped = new Set<string>();

    for (const [key, value] of Object.entries(llmMapping)) {
      const trimmedValue = typeof value === 'string' ? value.trim() : '';
      if (trimmedValue && cleanFields.includes(trimmedValue) && !mapped.has(trimmedValue)) {
        (validatedMapping as Record<string, string>)[key] = trimmedValue;
        mapped.add(trimmedValue);
      }
    }

    const hasRequired = validatedMapping.title && validatedMapping.start_date;
    const matchCount = Object.keys(validatedMapping).length;
    const confidence = hasRequired ? Math.min(0.95, 0.7 + matchCount * 0.05) : 0.3;
    const unmappedFields = cleanFields.filter(f => !mapped.has(f));

    logger.info(
      { method: 'llm', provider: llmConfig.model, confidence, mapping: validatedMapping, unmappedFields },
      'LLM field mapping result'
    );

    return {
      mapping: validatedMapping as FieldMapping,
      method: 'llm',
      confidence,
      unmappedFields,
    };
  } catch (err) {
    logger.warn({ err }, 'LLM field mapping failed, falling back to heuristic');
    return tryHeuristicMapping(fields);
  }
}

/**
 * Main entry point: map fields with LLM + heuristic fallback.
 * Uses heuristic first (fast + free). If confidence < 0.8 and LLM key is available,
 * tries LLM. Returns the best result.
 */
export async function mapFields(
  fields: string[],
  sampleRecords: Record<string, unknown>[],
  openaiKey?: string,
  deepseekKey?: string,
): Promise<MappingResult> {
  // Try heuristic first
  const heuristicResult = tryHeuristicMapping(fields);

  // If heuristic is confident enough, use it
  if (heuristicResult.confidence >= 0.8) {
    return heuristicResult;
  }

  // Try LLM if available (DeepSeek preferred over OpenAI)
  if (deepseekKey || openaiKey) {
    const llmResult = await tryLLMMapping(fields, sampleRecords, openaiKey, deepseekKey);
    // Use LLM result if it's better than heuristic
    if (llmResult.confidence > heuristicResult.confidence) {
      return llmResult;
    }
  }

  // Return heuristic result as fallback
  return heuristicResult;
}
