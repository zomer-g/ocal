import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  X,
  Loader2,
  AlertTriangle,
  Search,
} from 'lucide-react';
import {
  getOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  type Organization,
  type OrganizationInput,
} from '@/api/admin';

export function OrgsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: orgsData, isLoading } = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: getOrganizations,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOrganization,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] }),
  });

  const orgs = orgsData?.data ?? [];

  const filtered = search
    ? orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary-600" />
          ארגונות
          {!isLoading && (
            <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {orgs.length}
            </span>
          )}
        </h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          הוסף ארגון
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם..."
          className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {search ? 'לא נמצאו תוצאות' : 'אין ארגונות עדיין — הוסף ידנית'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">שם</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">אתר</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">תיאור</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 w-24">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
                    <td className="px-4 py-3">
                      {org.website ? (
                        <a
                          href={org.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          אתר
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[250px] truncate">
                      {org.description ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingOrg(org)}
                          className="p-1 text-gray-400 hover:text-primary-600 rounded"
                          title="ערוך"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`למחוק את "${org.name}"?`)) {
                              deleteMutation.mutate(org.id);
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="מחק"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {(showAddModal || editingOrg) && (
        <OrgModal
          org={editingOrg}
          onClose={() => { setShowAddModal(false); setEditingOrg(null); }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
            setShowAddModal(false);
            setEditingOrg(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Organization Add/Edit modal
// ─────────────────────────────────────────────
function OrgModal({
  org,
  onClose,
  onSaved,
}: {
  org: Organization | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<OrganizationInput>({
    name: org?.name ?? '',
    website: org?.website ?? '',
    description: org?.description ?? '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: OrganizationInput) =>
      org ? updateOrganization(org.id, data) : createOrganization(data),
    onSuccess: onSaved,
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('שם הוא שדה חובה'); return; }
    mutation.mutate({
      name: form.name.trim(),
      website: form.website?.trim() || null,
      description: form.description?.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {org ? 'עריכת ארגון' : 'הוספת ארגון'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">שם *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="משרד הביטחון"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">אתר</label>
            <input
              type="url"
              value={form.website ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="https://www.mod.gov.il"
              dir="ltr"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">תיאור</label>
            <textarea
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              ביטול
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1.5">
              {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {org ? 'שמור' : 'הוסף'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
