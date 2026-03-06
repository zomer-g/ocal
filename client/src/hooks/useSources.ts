import { useQuery } from '@tanstack/react-query';
import { getSources } from '@/api/sources';

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: getSources,
    staleTime: 60_000,
  });
}
