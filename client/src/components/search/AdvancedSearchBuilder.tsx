import { Plus, X } from 'lucide-react';
import { useFilterStore } from '@/stores/filterStore';

export function AdvancedSearchBuilder() {
  const {
    q,
    setQuery,
    extraConditions,
    addExtraCondition,
    updateExtraCondition,
    removeExtraCondition,
    setAdvancedMode,
  } = useFilterStore();

  function closeAdvanced() {
    setAdvancedMode(false);
    // Clear extra conditions but keep main query
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-4 text-white">
      {/* First row — main query */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-primary-100 w-14 shrink-0 text-center">חיפוש</span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="מילת חיפוש ראשית..."
          className="flex-1 bg-white/90 text-gray-900 placeholder:text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          autoFocus
          dir="rtl"
        />
      </div>

      {/* Extra condition rows */}
      {extraConditions.map((cond) => (
        <div key={cond.id} className="flex items-center gap-2 mb-2">
          {/* AND/OR toggle */}
          <button
            type="button"
            onClick={() =>
              updateExtraCondition(cond.id, 'operator', cond.operator === 'AND' ? 'OR' : 'AND')
            }
            className="w-14 shrink-0 text-xs font-bold py-1.5 rounded-lg border border-white/30 hover:bg-white/20 transition-colors text-center"
            title="לחץ להחלפה בין AND ל-OR"
          >
            {cond.operator === 'AND' ? 'וגם' : 'או'}
          </button>
          <input
            type="text"
            value={cond.term}
            onChange={(e) => updateExtraCondition(cond.id, 'term', e.target.value)}
            placeholder="תנאי נוסף..."
            className="flex-1 bg-white/90 text-gray-900 placeholder:text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            dir="rtl"
          />
          <button
            type="button"
            onClick={() => removeExtraCondition(cond.id)}
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            aria-label="הסר תנאי"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      {/* Footer buttons */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/20">
        <button
          type="button"
          onClick={addExtraCondition}
          className="flex items-center gap-1.5 text-sm text-primary-100 hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          הוסף תנאי
        </button>
        <button
          type="button"
          onClick={closeAdvanced}
          className="flex items-center gap-1.5 text-xs text-primary-200 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          סגור חיפוש מתקדם
        </button>
      </div>
    </div>
  );
}
