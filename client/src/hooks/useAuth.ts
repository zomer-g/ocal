import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

export type AdminUserRole = 'admin' | 'content_manager';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  picture_url?: string;
  role: AdminUserRole;
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

  const role: AdminUserRole | null = user?.role ?? null;

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user && !isError,
    role,
    isAdmin: role === 'admin',
    isContentManager: role === 'content_manager',
    logout,
  };
}
