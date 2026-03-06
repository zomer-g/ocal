import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Plus,
  Upload,
  Edit2,
  Trash2,
  ExternalLink,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Search,
} from 'lucide-react';
import {
  getPeople,
  createPerson,
  updatePerson,
  deletePerson,
  bulkImportPeople,
  getOrganizations,
  type Person,
  type PersonInput,
} from '@/api/admin';

// ─────────────────────────────────────────────
// CSV parser (lightweight, no dependency)
// ─────────────────────────────────────────────
function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export function PeoplePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const { data: peopleData, isLoading } = useQuery({
    queryKey: ['admin', 'people'],
    queryFn: getPeople,
  });

  const { data: orgsData } = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: getOrganizations,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePerson,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'people'] }),
  });

  const people = peopleData?.data ?? [];
  const orgs = orgsData?.data ?? [];

  const filtered = search
    ? people.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.organization_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : people;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-primary-600" />
          אנשים
          {!isLoading && (
            <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {people.length}
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            ייבוא מרשימה
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            הוסף
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או ארגון..."
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
            {search ? 'לא נמצאו תוצאות' : 'אין אנשים עדיין — הוסף ידנית או ייבא מרשימה'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">שם</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ארגון</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ויקיפדיה</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">הערות</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 w-24">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((person) => (
                  <tr key={person.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{person.name}</td>
                    <td className="px-4 py-3 text-gray-600">{person.organization_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      {person.wikipedia_link ? (
                        <a
                          href={person.wikipedia_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          קישור
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                      {person.notes ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingPerson(person)}
                          className="p-1 text-gray-400 hover:text-primary-600 rounded"
                          title="ערוך"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`למחוק את ${person.name}?`)) {
                              deleteMutation.mutate(person.id);
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

      {/* Add/Edit modal */}
      {(showAddModal || editingPerson) && (
        <PersonModal
          person={editingPerson}
          orgs={orgs}
          onClose={() => { setShowAddModal(false); setEditingPerson(null); }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
            setShowAddModal(false);
            setEditingPerson(null);
          }}
        />
      )}

      {/* Import modal */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
            setShowImportModal(false);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Person Add/Edit modal
// ─────────────────────────────────────────────
function PersonModal({
  person,
  orgs,
  onClose,
  onSaved,
}: {
  person: Person | null;
  orgs: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PersonInput>({
    name: person?.name ?? '',
    wikipedia_link: person?.wikipedia_link ?? '',
    notes: person?.notes ?? '',
    organization_id: person?.organization_id ?? '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: PersonInput) =>
      person ? updatePerson(person.id, data) : createPerson(data),
    onSuccess: onSaved,
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('שם הוא שדה חובה'); return; }
    mutation.mutate({
      name: form.name.trim(),
      wikipedia_link: form.wikipedia_link?.trim() || null,
      notes: form.notes?.trim() || null,
      organization_id: form.organization_id || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {person ? 'עריכת אדם' : 'הוספת אדם'}
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
              placeholder="ישראל ישראלי"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">ארגון</label>
            <select
              value={form.organization_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, organization_id: e.target.value || null }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">— ללא ארגון —</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">קישור ויקיפדיה</label>
            <input
              type="url"
              value={form.wikipedia_link ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, wikipedia_link: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="https://he.wikipedia.org/wiki/..."
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">הערות</label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
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
              {person ? 'שמור' : 'הוסף'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Bulk import modal
// ─────────────────────────────────────────────
function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<Array<Record<string, string>>>([]);
  const [step, setStep] = useState<'input' | 'preview' | 'done'>('input');
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  const importMutation = useMutation({
    mutationFn: (rows: Array<{ name: string; wikipedia_link?: string; notes?: string; organization_name?: string }>) =>
      bulkImportPeople(rows),
    onSuccess: (data) => { setResult(data); setStep('done'); },
  });

  const handleParseCSV = () => {
    const rows = parseCSV(csvText);
    if (rows.length === 0) return;
    setPreview(rows);
    setStep('preview');
  };

  const handleConfirmImport = () => {
    const rows = preview.map((r) => ({
      name: r['name'] ?? r['שם'] ?? '',
      wikipedia_link: r['wikipedia_link'] ?? r['ויקיפדיה'] ?? undefined,
      notes: r['notes'] ?? r['הערות'] ?? undefined,
      organization_name: r['organization_name'] ?? r['ארגון'] ?? undefined,
    })).filter((r) => r.name.trim());
    importMutation.mutate(rows);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">ייבוא רשימת אנשים</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'input' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              הדבק/י תוכן CSV עם עמודות: <code className="bg-gray-100 px-1 rounded">name, organization_name, wikipedia_link, notes</code>
              <br />
              שמות עמודות גם בעברית: <code className="bg-gray-100 px-1 rounded">שם, ארגון, ויקיפדיה, הערות</code>
            </p>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder={'name,organization_name,wikipedia_link\nישראל ישראלי,משרד הביטחון,https://he.wikipedia.org/...'}
              dir="ltr"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                ביטול
              </button>
              <button onClick={handleParseCSV} disabled={!csvText.trim()}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                המשך לתצוגה מקדימה
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              נמצאו <strong>{preview.length}</strong> שורות. בדוק/י לפני הייבוא:
            </p>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs border border-gray-200 rounded">
                <thead className="bg-gray-50">
                  <tr>
                    {Object.keys(preview[0] ?? {}).map((h) => (
                      <th key={h} className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-2 py-1 text-gray-600 max-w-[150px] truncate">{v || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 10 && (
                <p className="text-xs text-gray-400 mt-1 text-center">...ו-{preview.length - 10} שורות נוספות</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setStep('input')}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                חזרה
              </button>
              <button onClick={handleConfirmImport} disabled={importMutation.isPending}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
                {importMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                ייבא {preview.length} אנשים
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">ייבוא הושלם</p>
                <p className="text-sm">נוספו: {result.created} | עודכנו: {result.updated}</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <p className="font-medium mb-1">שגיאות ({result.errors.length}):</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onImported}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                סגור
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
