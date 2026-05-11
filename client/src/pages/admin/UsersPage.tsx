import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Loader2, AlertCircle, ShieldCheck, Shield, Trash2 } from 'lucide-react';
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  type AdminUserRow,
} from '@/api/users';
import { useAuth, type AdminUserRole } from '@/hooks/useAuth';

const ROLE_LABEL: Record<AdminUserRole, string> = {
  admin: 'אדמין',
  content_manager: 'מנהל תוכן',
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [error, setError] = useState<string>('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<AdminUserRole>('content_manager');

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listAdminUsers,
  });

  const createMutation = useMutation({
    mutationFn: () => createAdminUser({ email: newEmail.trim(), name: newName.trim() || undefined, role: newRole }),
    onSuccess: () => {
      setNewEmail('');
      setNewName('');
      setNewRole('content_manager');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateAdminUser>[1] }) =>
      updateAdminUser(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">משתמשי ניהול</h1>
        <p className="text-sm text-gray-600">
          ניהול גישת אדמינים ומנהלי תוכן למערכת. מנהל תוכן יכול לצפות, לערוך ולאשר מסמכים,
          אך לא יכול למחוק אותם או לנהל משתמשים אחרים.
        </p>
      </div>

      {/* Invite form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 inline-flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" /> הזמנת משתמש חדש
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="email@domain.com"
            type="email"
            className="md:col-span-2 text-sm border border-gray-300 rounded px-2 py-1.5"
            dir="ltr"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם (אופציונלי)"
            className="text-sm border border-gray-300 rounded px-2 py-1.5"
            dir="rtl"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as AdminUserRole)}
            className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
            dir="rtl"
          >
            <option value="content_manager">מנהל תוכן</option>
            <option value="admin">אדמין</option>
          </select>
        </div>
        <div className="flex items-center justify-between mt-3">
          {error && (
            <span className="inline-flex items-center gap-1 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (!newEmail.trim()) { setError('יש להזין כתובת אימייל'); return; }
              setError('');
              createMutation.mutate();
            }}
            disabled={createMutation.isPending}
            className="px-3 py-1.5 text-sm bg-primary-700 text-white rounded hover:bg-primary-800 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            הזמן
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          המשתמש המוזמן חייב להיות גם ברשימת <code>ADMIN_EMAILS</code> של השרת כדי שיוכל להיכנס דרך Google.
        </p>
      </div>

      {/* User list */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700 text-xs">
            <tr>
              <th className="text-right px-3 py-2 font-semibold">משתמש</th>
              <th className="text-right px-3 py-2 font-semibold">תפקיד</th>
              <th className="text-right px-3 py-2 font-semibold">פעיל</th>
              <th className="text-right px-3 py-2 font-semibold">כניסה אחרונה</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u: AdminUserRow) => {
              const isSelf = u.id === me?.id;
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{u.name || u.email}</div>
                    {u.name && <div className="text-xs text-gray-500" dir="ltr">{u.email}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) => updateMutation.mutate({ id: u.id, patch: { role: e.target.value as AdminUserRole } })}
                      className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white disabled:opacity-60"
                    >
                      <option value="admin">{ROLE_LABEL.admin}</option>
                      <option value="content_manager">{ROLE_LABEL.content_manager}</option>
                    </select>
                    {u.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5 inline-block mr-1 text-primary-600" />}
                    {u.role === 'content_manager' && <Shield className="w-3.5 h-3.5 inline-block mr-1 text-gray-500" />}
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={u.is_active}
                        disabled={isSelf}
                        onChange={(e) => updateMutation.mutate({ id: u.id, patch: { is_active: e.target.checked } })}
                      />
                      <span className="text-xs">{u.is_active ? 'פעיל' : 'מושבת'}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {u.last_login ? new Date(u.last_login).toLocaleString('he-IL') : '—'}
                  </td>
                  <td className="px-3 py-2 text-end">
                    {!isSelf && u.is_active && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`להשבית את ${u.email}?`)) deleteMutation.mutate(u.id);
                        }}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        aria-label="השבת"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
