import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Search, Menu, X, Info, BookOpen } from 'lucide-react';
import { useSiteContent } from '@/hooks/useContent';

export function Header() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: content } = useSiteContent();
  const siteName = content?.header?.siteName ?? 'יומן לעם';

  const navItems = [
    { path: '/', label: 'חיפוש', icon: Search },
    { path: '/calendar', label: 'לוח שנה', icon: Calendar },
    { path: '/diaries', label: 'יומנים', icon: BookOpen },
    { path: '/about', label: 'אודות', icon: Info },
  ];

  return (
    <header className="bg-primary-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <Link to="/" className="flex items-center gap-2">
            <Calendar className="w-7 h-7 sm:w-8 sm:h-8 text-primary-200" />
            <span className="text-lg sm:text-xl font-bold text-white">{siteName}</span>
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
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-primary-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden p-2 rounded-lg text-primary-100 hover:bg-white/10 hover:text-white"
            aria-expanded={mobileOpen}
            aria-label="תפריט ניווט"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-primary-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
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
