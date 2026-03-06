import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Calendar, Database, Download, RefreshCw, Settings, Menu, X, LogOut, PenSquare } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const NAV_ITEMS = [
  { path: '/admin', label: 'סקירה', icon: Settings, exact: true },
  { path: '/admin/sync', label: 'ייבוא', icon: Download, exact: false },
  { path: '/admin/sources', label: 'מקורות', icon: Database, exact: false },
  { path: '/admin/content', label: 'תוכן', icon: PenSquare, exact: false },
];

export function AdminLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-gray-900 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link to="/" className="flex items-center gap-2">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-primary-300" />
                <span className="text-base sm:text-lg font-bold">יומן לעם</span>
              </Link>
              <span className="text-[10px] sm:text-xs bg-yellow-500 text-gray-900 px-1.5 sm:px-2 py-0.5 rounded font-semibold">
                ניהול
              </span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden sm:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.exact
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-white/15 text-white'
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
              <div className="w-px h-6 bg-gray-700 mx-2" />
              <Link
                to="/calendar"
                className="text-gray-300 hover:text-white text-sm flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                לאתר
              </Link>
              <div className="w-px h-6 bg-gray-700 mx-2" />
              {user && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{user.name || user.email}</span>
                  <button
                    onClick={logout}
                    className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="התנתק"
                    title="התנתק"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </nav>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="sm:hidden p-1.5 rounded text-gray-300 hover:text-white hover:bg-white/10"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-gray-700 bg-gray-800">
            <nav className="px-4 py-2 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.exact
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-white/15 text-white'
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
              <div className="border-t border-gray-700 pt-2 mt-2">
                <Link
                  to="/calendar"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 text-gray-300 hover:text-white text-sm rounded-md hover:bg-white/10"
                >
                  <RefreshCw className="w-4 h-4" />
                  חזרה לאתר
                </Link>
                {user && (
                  <button
                    onClick={logout}
                    className="flex items-center gap-2 px-3 py-2.5 text-gray-300 hover:text-white text-sm rounded-md hover:bg-white/10 w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    התנתק ({user.name || user.email})
                  </button>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}
