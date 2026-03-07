import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Tags,
  Search,
  Loader2,
  Pencil,
  Trash2,
  Merge,
  Check,
  X,
  Plus,
  Upload,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Users,
  Building2,
  MapPin,
  Edit2,
} from 'lucide-react';
import {
  getGlobalEntities,
  deleteEntityByName,
  globalBulkRenameEntity,
  globalMergeEntities,
  getPeople,
  getOrganizations,
  createPerson,
  updatePerson,
  deletePerson,
  bulkImportPeople,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  type GlobalEntity,
  type Person,
  type PersonInput,
  type Organization,
  type OrganizationInput,
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

type TabType = '' | 'person' | 'organization' | 'place';
type SubView = 'extracted' | 'registry-people' | 'registry-orgs';

export function EntitiesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('');
  const [subView, setSubView] = useState<SubView>('extracted');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Tags className="w-6 h-6 text-primary-600" />
          ישויות
        </h1>
      </div>

      {/* Sub-view toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setSubView('extracted')}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            subView === 'extracted'
              ? 'bg-white text-gray-900 shadow-sm font-medium'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Tags className="w-4 h-4" />
          ישויות שחולצו
        </button>
        <button
          onClick={() => setSubView('registry-people')}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            subView === 'registry-people'
              ? 'bg-white text-gray-900 shadow-sm font-medium'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          מרשם אנשים
        </button>
        <button
          onClick={() => setSubView('registry-orgs')}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            subView === 'registry-orgs'
              ? 'bg-white text-gray-900 shadow-sm font-medium'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          מרשם ארגונות
        </button>
      </div>

      {subView === 'extracted' && (
        <ExtractedEntitiesView activeTab={activeTab} onTabChange={setActiveTab} />
      )}
      {subView === 'registry-people' && <PeopleRegistryView />}
      {subView === 'registry-orgs' && <OrgsRegistryView />}
    </div>
  );
}

// ─────────────────────────────────────────────
// Extracted entities view
// ─────────────────────────────────────────────
function ExtractedEntitiesView({
  activeTab,
  onTabChange,
}: {
  activeTab: TabType;
  onTabChange: (t: TabType) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingEntity, setEditingEntity] = useState<GlobalEntity | null>(null);
  const [editName, setEditName] = useState('');
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [mergeName, setMergeName] = useState('');
  const LIMIT = 100;

  // Debounce search
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    const timeout = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-global-entities', activeTab, debouncedSearch, page],
    queryFn: () => getGlobalEntities({
      type: activeTab || undefined,
      search: debouncedSearch || undefined,
      page,
      limit: LIMIT,
    }),
    staleTime: 30 * 1000,
  });

  const entities = data?.data ?? [];
  const total = data?.total ?? 0;
  const stats = data?.stats;
  const totalPages = Math.ceil(total / LIMIT);

  const deleteMut = useMutation({
    mutationFn: ({ name, type }: { name: string; type: string }) => deleteEntityByName(name, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-global-entities'] });
      queryClient.invalidateQueries({ queryKey: ['public-entities'] });
      queryClient.invalidateQueries({ queryKey: ['entities'] });
    },
  });

  const renameMut = useMutation({
    mutationFn: ({ oldName, newName, type }: { oldName: string; newName: string; type?: string }) =>
      globalBulkRenameEntity(oldName, newName, type),
    onSuccess: () => {
      setEditingEntity(null);
      queryClient.invalidateQueries({ queryKey: ['admin-global-entities'] });
      queryClient.invalidateQueries({ queryKey: ['public-entities'] });
      queryClient.invalidateQueries({ queryKey: ['entities'] });
    },
  });

  const mergeMut = useMutation({
    mutationFn: ({ names, target }: { names: Array<{ name: string; type: string }>; target: string }) =>
      globalMergeEntities(names, target),
    onSuccess: () => {
      setMergeMode(false);
      setMergeSelection(new Set());
      setMergeName('');
      queryClient.invalidateQueries({ queryKey: ['admin-global-entities'] });
      queryClient.invalidateQueries({ queryKey: ['public-entities'] });
      queryClient.invalidateQueries({ queryKey: ['entities'] });
    },
  });

  const startEdit = (entity: GlobalEntity) => {
    setEditingEntity(entity);
    setEditName(entity.entity_name);
  };

  const toggleMergeSelect = (key: string) => {
    setMergeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const TYPE_TABS: Array<{ value: TabType; label: string; icon: typeof Users }> = [
    { value: '', label: 'הכל', icon: Tags },
    { value: 'person', label: 'אנשים', icon: Users },
    { value: 'organization', label: 'ארגונים', icon: Building2 },
    { value: 'place', label: 'מקומות', icon: MapPin },
  ];

  const TYPE_EMOJI: Record<string, string> = {
    person: '👤',
    organization: '🏢',
    place: '📍',
  };

  return (
    <>
      {/* Stats bar */}
      {stats && stats.total_unique > 0 && (
        <div className="flex flex-wrap gap-3 text-sm text-gray-600 bg-white rounded-lg border border-gray-200 px-4 py-2.5">
          <span className="font-medium text-gray-800">סה"כ: {stats.total_unique}</span>
          <span>👤 {stats.person} אנשים</span>
          <span>🏢 {stats.organization} ארגונים</span>
          <span>📍 {stats.place} מקומות</span>
        </div>
      )}

      {/* Type filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {TYPE_TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { onTabChange(value); setPage(1); }}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                activeTab === value
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {value === '' && stats ? ` (${stats.total_unique})` : ''}
              {value === 'person' && stats ? ` (${stats.person})` : ''}
              {value === 'organization' && stats ? ` (${stats.organization})` : ''}
              {value === 'place' && stats ? ` (${stats.place})` : ''}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setMergeMode(!mergeMode); setMergeSelection(new Set()); }}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors flex items-center gap-1 ${
            mergeMode ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-500 hover:bg-gray-100'
          }`}
        >
          <Merge className="w-3.5 h-3.5" />
          {mergeMode ? 'ביטול מיזוג' : 'מיזוג'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="חיפוש ישויות..."
          className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Merge bar */}
      {mergeMode && mergeSelection.size >= 2 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <span className="text-sm text-amber-700 font-medium">{mergeSelection.size} נבחרו</span>
          <input
            type="text"
            value={mergeName}
            onChange={(e) => setMergeName(e.target.value)}
            placeholder="שם יעד למיזוג"
            className="flex-1 border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            onClick={() => {
              const sourceNames = Array.from(mergeSelection).map((key) => {
                const [type, ...nameParts] = key.split(':');
                return { name: nameParts.join(':'), type };
              });
              mergeMut.mutate({ names: sourceNames, target: mergeName });
            }}
            disabled={!mergeName.trim() || mergeMut.isPending}
            className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {mergeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
            מזג
          </button>
        </div>
      )}

      {/* Entity table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : entities.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {debouncedSearch
              ? 'לא נמצאו ישויות התואמות את החיפוש'
              : 'אין ישויות שחולצו — עבור לעמוד מקורות והפעל כריית ישויות'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {mergeMode && <th className="px-2 py-3 w-8" />}
                  <th className="px-4 py-3 text-right font-medium text-gray-600">שם</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">סוג</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">אירועים</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 hidden sm:table-cell">מקורות</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 hidden md:table-cell">שיטה</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 w-28">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entities.map((entity) => {
                  const key = `${entity.entity_type}:${entity.entity_name}`;
                  const isEditing = editingEntity?.entity_name === entity.entity_name
                    && editingEntity?.entity_type === entity.entity_type;
                  return (
                    <tr key={key} className={`hover:bg-gray-50 ${mergeSelection.has(key) ? 'bg-amber-50' : ''}`}>
                      {mergeMode && (
                        <td className="px-2 py-3">
                          <input
                            type="checkbox"
                            checked={mergeSelection.has(key)}
                            onChange={() => toggleMergeSelect(key)}
                            className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[250px]">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 border border-primary-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && editName.trim()) {
                                  renameMut.mutate({
                                    oldName: entity.entity_name,
                                    newName: editName,
                                    type: entity.entity_type,
                                  });
                                }
                                if (e.key === 'Escape') setEditingEntity(null);
                              }}
                            />
                            <button
                              onClick={() => renameMut.mutate({
                                oldName: entity.entity_name,
                                newName: editName,
                                type: entity.entity_type,
                              })}
                              disabled={renameMut.isPending || !editName.trim()}
                              className="p-1 text-green-600 hover:text-green-800"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingEntity(null)} className="p-1 text-gray-400 hover:text-gray-600">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 ${entity.entity_id ? 'text-green-700' : 'text-gray-800'}`}>
                            <span className="text-[10px]">{entity.entity_id ? '●' : '○'}</span>
                            <span className="break-words min-w-0">{entity.entity_name}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          {TYPE_EMOJI[entity.entity_type]}
                          <span className="hidden sm:inline text-xs">
                            {entity.entity_type === 'person' ? 'אדם' :
                             entity.entity_type === 'organization' ? 'ארגון' : 'מקום'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{entity.event_count}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{entity.source_count}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex gap-1">
                          {entity.methods?.split(',').map((m) => (
                            <span key={m} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              m === 'owner' ? 'bg-blue-100 text-blue-700' :
                              m === 'ai_ner' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {m === 'owner' ? 'בעלים' : m === 'ai_ner' ? 'AI' : 'משתתף'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {!isEditing && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEdit(entity)}
                              className="p-1 text-gray-400 hover:text-primary-600 rounded"
                              title="שנה שם"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`למחוק את כל ${entity.event_count} הופעות של "${entity.entity_name}"?`)) {
                                  deleteMut.mutate({ name: entity.entity_name, type: entity.entity_type });
                                }
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 rounded"
                              title="מחק"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>עמוד {page}/{totalPages} — סה"כ {total} ישויות</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40"
            >
              הקודם
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40"
            >
              הבא
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// People registry view (from PeoplePage)
// ─────────────────────────────────────────────
function PeopleRegistryView() {
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
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          אנשים ברשם — משמשים כ"בעל היומן" בייבוא
          {!isLoading && <span className="mr-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">{people.length}</span>}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            ייבוא
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
            {search ? 'לא נמצאו תוצאות' : 'אין אנשים ברשם — הוסף ידנית או ייבא מרשימה'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">שם</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ארגון</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 hidden sm:table-cell">ויקיפדיה</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 hidden md:table-cell">הערות</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 w-24">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((person) => (
                  <tr key={person.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{person.name}</td>
                    <td className="px-4 py-3 text-gray-600">{person.organization_name ?? '—'}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
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
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate hidden md:table-cell">
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
    </>
  );
}

// ─────────────────────────────────────────────
// Organizations registry view (from OrgsPage)
// ─────────────────────────────────────────────
function OrgsRegistryView() {
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
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          ארגונות ברשם — משמשים בייבוא ובזיהוי ישויות
          {!isLoading && <span className="mr-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">{orgs.length}</span>}
        </p>
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
            {search ? 'לא נמצאו תוצאות' : 'אין ארגונות ברשם — הוסף ידנית'}
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
    </>
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
