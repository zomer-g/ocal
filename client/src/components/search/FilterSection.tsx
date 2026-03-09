import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';

interface FilterSectionProps {
  title: string;
  icon?: ReactNode;
  defaultExpanded?: boolean;
  /** Per-section search */
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Bulk actions */
  selectedCount?: number;
  onClearAll?: () => void;
  onSelectAll?: () => void;
  /** Loading shimmer */
  isLoading?: boolean;
  children: ReactNode;
}

export function FilterSection({
  title,
  icon,
  defaultExpanded = false,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  selectedCount,
  onClearAll,
  onSelectAll,
  isLoading,
  children,
}: FilterSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="py-2.5">
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-right group"
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
        {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
        <span className="text-xs font-semibold text-gray-600 group-hover:text-gray-800 transition-colors">
          {title}
        </span>
        {!!selectedCount && selectedCount > 0 && (
          <span className="bg-primary-100 text-primary-700 text-[10px] font-medium rounded-full px-1.5 min-w-[18px] text-center">
            {selectedCount}
          </span>
        )}
        {/* Spacer */}
        <span className="flex-1" />
        {/* Inline bulk actions — stop propagation so they don't toggle collapse */}
        {expanded && (onSelectAll || onClearAll) && (
          <span className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {onSelectAll && (
              <span
                role="button"
                tabIndex={0}
                onClick={onSelectAll}
                className="text-[10px] text-gray-400 hover:text-primary-600 cursor-pointer transition-colors"
              >
                בחר הכל
              </span>
            )}
            {onSelectAll && onClearAll && <span className="text-gray-300 text-[10px]">|</span>}
            {onClearAll && (
              <span
                role="button"
                tabIndex={0}
                onClick={onClearAll}
                className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
              >
                נקה
              </span>
            )}
          </span>
        )}
      </button>

      {/* Collapsible content */}
      <div
        className="transition-all duration-200 ease-in-out overflow-hidden"
        style={{ maxHeight: expanded ? '600px' : '0', opacity: expanded ? 1 : 0 }}
      >
        <div className="pt-2 space-y-2">
          {/* Search input */}
          {onSearchChange && (
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder ?? 'חיפוש...'}
                className="w-full text-xs pr-7 pl-7 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-400 bg-gray-50 transition-colors"
              />
              {searchValue && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Content with loading overlay */}
          <div
            className="max-h-52 overflow-y-auto overflow-x-hidden space-y-0.5 transition-opacity duration-150"
            style={{ opacity: isLoading ? 0.5 : 1 }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
