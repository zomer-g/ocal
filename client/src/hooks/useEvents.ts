import { useQuery } from '@tanstack/react-query';
import { searchEvents, type EventSearchParams } from '@/api/events';

export function useEvents(params: EventSearchParams) {
  return useQuery({
    queryKey: ['events', params],
    queryFn: () => searchEvents(params),
    placeholderData: (prev) => prev,
  });
}
