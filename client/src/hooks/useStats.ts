import { useQuery } from '@tanstack/react-query';
import { getStats } from '@/api/sources';

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
    staleTime: 60_000,
  });
}
