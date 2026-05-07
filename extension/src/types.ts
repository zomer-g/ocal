export interface PersonEntity {
  entity_name: string;
  entity_type: 'person' | 'organization' | 'place';
  entity_id: string | null;
  event_count: number;
}

export interface EventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  source_name: string;
  source_color: string | null;
}

export type Message =
  | { type: 'getPeople' }
  | { type: 'getEvents'; name: string };

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };
