import { useCalendarStore } from '@/stores/calendarStore';
import { Eye, EyeOff, Layers } from 'lucide-react';
import type { DiarySource } from '@/api/sources';

interface LayerPanelProps {
  sources: DiarySource[];
  viewSourceCounts?: Record<string, number>;
}

export function LayerPanel({ sources, viewSourceCounts }: LayerPanelProps) {
  const { enabledSourceIds, toggleSource, setAllSources } = useCalendarStore();
  const allEnabled = sources.length > 0 && sources.every((s) => enabledSourceIds.has(s.id));
  const noneEnabled = sources.length > 0 && sources.every((s) => !enabledSourceIds.has(s.id));

  const handleToggleAll = () => {
    if (allEnabled) {
      setAllSources([], false);
    } else {
      setAllSources(sources.map((s) => s.id), true);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">שכבות</span>
        </div>
        <button
          onClick={handleToggleAll}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          title={allEnabled ? 'הסתר הכל' : 'הצג הכל'}
        >
          {allEnabled ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Source list */}
      <div className="p-2 space-y-0.5 max-h-[400px] overflow-y-auto">
        {sources.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-3">
            אין מקורות זמינים
          </div>
        ) : (
          sources.map((source) => {
            const isEnabled = enabledSourceIds.has(source.id);
            const viewCount = viewSourceCounts?.[source.id] ?? 0;
            const hasEventsInView = !viewSourceCounts || viewCount > 0;
            return (
              <label
                key={source.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                  isEnabled
                    ? hasEventsInView ? 'hover:bg-gray-50' : 'opacity-40 hover:opacity-60'
                    : 'opacity-30 hover:opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => toggleSource(source.id)}
                  className="sr-only"
                />
                {/* Custom checkbox with source color */}
                <div
                  className={`w-3.5 h-3.5 rounded-sm border-2 shrink-0 transition-colors flex items-center justify-center ${
                    isEnabled ? '' : 'bg-white'
                  }`}
                  style={{
                    borderColor: source.color,
                    backgroundColor: isEnabled ? source.color : undefined,
                  }}
                >
                  {isEnabled && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm truncate ${isEnabled ? (hasEventsInView ? 'text-gray-700' : 'text-gray-400') : 'text-gray-400'}`}>
                  {source.name}
                </span>
                <span className="mr-auto shrink-0">
                  {viewSourceCounts && viewCount > 0 ? (
                    <span className="text-[10px] font-medium text-white rounded-full px-1.5 py-0.5" style={{ backgroundColor: source.color }}>
                      {viewCount}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300">
                      {source.total_events}
                    </span>
                  )}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
