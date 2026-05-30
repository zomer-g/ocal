import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  variant?: 'default' | 'hero';
}

export function SearchBar({ value, onChange, variant = 'default' }: SearchBarProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 300);
    return () => clearTimeout(timer);
  }, [local, value, onChange]);

  // Hero variant follows the "לעם" family contract: a single solid-white
  // pill (rounded-full) with the search icon at the start (RTL → right) and
  // the input filling the rest. No separate submit button — Enter sends.
  // Used only on Home; other pages stick with the bordered "default" style.
  if (variant === 'hero') {
    return (
      <div role="search" className="w-full">
        <label htmlFor="hero-search-input" className="sr-only">חיפוש אירועים</label>
        <div className="flex items-center bg-white rounded-full shadow-lg overflow-hidden border border-white/20">
          <Search className="w-5 h-5 text-gray-400 shrink-0 mr-4" aria-hidden="true" />
          <input
            id="hero-search-input"
            type="text"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="חפשו אירוע, נושא או שם..."
            aria-label="חיפוש אירועים"
            className="flex-1 bg-transparent border-0 outline-none text-base text-gray-900 placeholder:text-gray-400 py-3 px-4"
            dir="rtl"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full" role="search">
      <label htmlFor="search-input" className="sr-only">חיפוש אירועים</label>
      <Search className="absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 right-3" aria-hidden="true" />
      <input
        id="search-input"
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="חיפוש באירועים..."
        aria-label="חיפוש אירועים"
        className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        dir="rtl"
      />
    </div>
  );
}
