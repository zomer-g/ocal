import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  picture_url?: string;
}

async function fetchMe(): Promise<AdminUser | null> {
  const { data } = await api.get('/admin/auth/me');
  return data.user ?? null;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const logout = async () => {
    await api.post('/admin/auth/logout');
    queryClient.setQueryData(['admin', 'me'], null);
    window.location.href = '/';
  };

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user && !isError,
    logout,
  };
}
