import { api } from './client';
import type { DiaryEvent } from './events';
import type { CalendarView } from '@/stores/calendarStore';

export interface CalendarParams {
  date: string;
  view: CalendarView;
  source_ids?: string;
}

export interface CalendarResponse {
  events: DiaryEvent[];
  date_range: { from: string; to: string };
  event_counts: Record<string, number>;
}

export async function getCalendarEvents(params: CalendarParams): Promise<CalendarResponse> {
  const { data } = await api.get('/public/calendar', { params });
  return data;
}
