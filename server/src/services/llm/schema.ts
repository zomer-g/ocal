/**
 * Shared JSON schema for the diary-event extraction output. Used as:
 *  - Anthropic tool `input_schema` (with forced tool_choice).
 *  - OpenAI `response_format.json_schema` (strict mode).
 *
 * Both providers therefore commit to a typed object instead of free-form text,
 * eliminating the "model emitted prose explaining it can't read the file"
 * failure mode that surfaced as 0 events with no actionable error.
 */

export const EVENTS_TOOL_NAME = 'submit_events';

export const EVENTS_TOOL_DESCRIPTION =
  'Submit the structured list of diary events extracted from the PDF.';

export const EVENTS_SCHEMA = {
  type: 'object',
  required: ['events'],
  additionalProperties: false,
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'start_time'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Event title (Hebrew).' },
          start_time: {
            type: 'string',
            description:
              'ISO 8601 datetime with Asia/Jerusalem offset, e.g. "2024-03-15T09:30:00+02:00". If only a date is given, use 00:00.',
          },
          end_time: { type: 'string', description: 'ISO 8601 end time, if explicitly stated.' },
          location: { type: 'string' },
          participants: { type: 'string', description: 'Comma-separated participant names.' },
          notes: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          source_page: { type: 'integer', minimum: 1, description: 'Original PDF page number.' },
        },
      },
    },
  },
} as const;

// OpenAI's strict mode requires every property to be in `required`. We supply
// a separate schema for the OpenAI path that satisfies that constraint while
// keeping the data layer permissive (optional fields are typed as ["string","null"]).
export const EVENTS_SCHEMA_OPENAI_STRICT = {
  type: 'object',
  required: ['events'],
  additionalProperties: false,
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'title',
          'start_time',
          'end_time',
          'location',
          'participants',
          'notes',
          'confidence',
          'source_page',
        ],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          participants: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
          confidence: { type: ['number', 'null'] },
          source_page: { type: ['integer', 'null'] },
        },
      },
    },
  },
} as const;
