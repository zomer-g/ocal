import { useQuery } from '@tanstack/react-query';
import { getCalendarEvents, type CalendarParams } from '@/api/calendar';

export function useCalendar(params: CalendarParams) {
  return useQuery({
    queryKey: ['calendar', params],
    queryFn: () => getCalendarEvents(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}
