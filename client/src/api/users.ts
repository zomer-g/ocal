import { api } from './client';
import type { AdminUserRole } from '@/hooks/useAuth';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  role: AdminUserRole;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const { data } = await api.get('/admin/users');
  return data.data;
}

export async function createAdminUser(input: {
  email: string;
  name?: string;
  role: AdminUserRole;
}): Promise<AdminUserRow> {
  const { data } = await api.post('/admin/users', input);
  return data;
}

export async function updateAdminUser(
  id: string,
  patch: { name?: string | null; role?: AdminUserRole; is_active?: boolean },
): Promise<AdminUserRow> {
  const { data } = await api.patch(`/admin/users/${id}`, patch);
  return data;
}

export async function deleteAdminUser(id: string): Promise<void> {
  await api.delete(`/admin/users/${id}`);
}
