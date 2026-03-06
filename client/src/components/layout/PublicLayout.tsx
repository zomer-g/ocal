import { Outlet } from 'react-router-dom';
import { Header } from './Header';

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <a href="#main-content" className="skip-link">דלג לתוכן הראשי</a>
      <Header />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-primary-900 text-primary-100 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm">
          <p>יומן לעם — פלטפורמה לשקיפות ציבורית</p>
          <p className="text-primary-300 text-xs mt-1">
            הנתונים מבוססים על מידע ממאגר הנתונים הפתוח של ישראל
          </p>
        </div>
      </footer>
    </div>
  );
}
