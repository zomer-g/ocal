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

  const isHero = variant === 'hero';

  return (
    <div className="relative" role="search">
      <label htmlFor={isHero ? 'hero-search-input' : 'search-input'} className="sr-only">חיפוש אירועים</label>
      <Search className={`absolute top-1/2 -translate-y-1/2 ${
        isHero ? 'w-6 h-6 text-gray-400 right-4' : 'w-5 h-5 text-gray-400 right-3'
      }`} aria-hidden="true" />
      <input
        id={isHero ? 'hero-search-input' : 'search-input'}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={isHero ? 'חפשו אירוע, נושא או שם...' : 'חיפוש באירועים...'}
        aria-label="חיפוש אירועים"
        className={isHero
          ? 'w-full pr-12 pl-4 py-4 rounded-xl text-lg text-gray-900 shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:ring-offset-primary-700'
          : 'w-full pr-10 pl-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
        }
        dir="rtl"
      />
    </div>
  );
}
