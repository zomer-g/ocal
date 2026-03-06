import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SearchPage } from '@/pages/SearchPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { AboutPage } from '@/pages/AboutPage';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { SyncPage } from '@/pages/admin/SyncPage';
import { SourcesPage } from '@/pages/admin/SourcesPage';

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<SearchPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="sync" element={<SyncPage />} />
        <Route path="sources" element={<SourcesPage />} />
      </Route>
    </Routes>
  );
}
