import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Menu, X } from 'lucide-react';
import { useSiteContent } from '@/hooks/useContent';

export function Header() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: content } = useSiteContent();
  const siteName = content?.header?.siteName ?? 'יומן לעם';

  // Family contract: nav items are text-only — no per-link icons. The brand
  // icon (Calendar next to "יומן לעם") stays. Aligns with OCOI and OVER.
  const navItems = [
    { path: '/', label: 'חיפוש' },
    { path: '/calendar', label: 'לוח שנה' },
    { path: '/diaries', label: 'יומנים' },
    { path: '/api', label: 'API' },
    { path: '/about', label: 'אודות' },
  ];

  return (
    <header className="bg-primary-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <Calendar className="w-7 h-7 sm:w-8 sm:h-8 text-primary-200 shrink-0" aria-hidden="true" />
            <span className="text-base sm:text-xl font-bold text-white truncate">{siteName}</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1" role="navigation" aria-label="ניווט ראשי">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-primary-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile hamburger — 44×44 minimum touch target (WCAG 2.1 AA) */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-primary-100 hover:bg-white/10 hover:text-white shrink-0"
            aria-expanded={mobileOpen}
            aria-label="תפריט ניווט"
          >
            {mobileOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-primary-600 bg-primary-700">
          <nav className="px-4 py-2 space-y-1" role="navigation" aria-label="ניווט ראשי">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-primary-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
