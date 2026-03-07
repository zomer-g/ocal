import { Routes, Route, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { RequireAuth } from '@/components/admin/RequireAuth';
import { SearchPage } from '@/pages/SearchPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { AboutPage } from '@/pages/AboutPage';
import { LoginPage } from '@/pages/admin/LoginPage';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { SyncPage } from '@/pages/admin/SyncPage';
import { SourcesPage } from '@/pages/admin/SourcesPage';
import { ContentPage } from '@/pages/admin/ContentPage';
import { EntitiesPage } from '@/pages/admin/EntitiesPage';

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<SearchPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Route>

      {/* Admin login — no auth required */}
      <Route path="/admin/login" element={<LoginPage />} />

      {/* Admin routes — protected by Google SSO */}
      <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="sync" element={<SyncPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="entities" element={<EntitiesPage />} />
        <Route path="content" element={<ContentPage />} />
        {/* Redirects from old routes */}
        <Route path="people" element={<Navigate to="/admin/entities" replace />} />
        <Route path="organizations" element={<Navigate to="/admin/entities" replace />} />
      </Route>
    </Routes>
  );
}
