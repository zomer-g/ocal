import { useQuery } from '@tanstack/react-query';
import { getAdminSources } from '@/api/admin';
import { Link } from 'react-router-dom';
import { Database, Calendar, Download, Loader2, ArrowLeft } from 'lucide-react';

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-sources'],
    queryFn: getAdminSources,
  });

  const sources = data?.data ?? [];
  const totalEvents = sources.reduce((sum, s) => sum + (s.total_events || 0), 0);
  const activeSources = sources.filter((s) => s.is_enabled).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">לוח בקרה</h1>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              icon={Database}
              label="מקורות"
              value={sources.length}
              sub={`${activeSources} פעילים`}
              color="bg-primary-700"
            />
            <StatCard
              icon={Calendar}
              label="אירועים"
              value={totalEvents}
              sub="סה״כ במערכת"
              color="bg-primary-600"
            />
            <StatCard
              icon={Download}
              label="פורמטים נתמכים"
              value={6}
              sub="CSV, XLS, XLSX, ICS, ICAL, ICA"
              color="bg-primary-500"
            />
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              to="/admin/sync"
              className="bg-white rounded-lg border border-gray-200 p-4 hover:border-primary-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 group-hover:text-primary-600">
                    ייבוא יומנים חדשים
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    חיפוש וייבוא יומנים מ-ODATA
                  </p>
                </div>
                <ArrowLeft className="w-5 h-5 text-gray-300 group-hover:text-primary-500" />
              </div>
            </Link>

            <Link
              to="/admin/sources"
              className="bg-white rounded-lg border border-gray-200 p-4 hover:border-primary-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 group-hover:text-primary-600">
                    ניהול מקורות קיימים
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    עדכון, סנכרון מחדש, או מחיקה
                  </p>
                </div>
                <ArrowLeft className="w-5 h-5 text-gray-300 group-hover:text-primary-500" />
              </div>
            </Link>
          </div>

          {/* Recent sources */}
          {sources.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">מקורות אחרונים</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {sources.slice(0, 5).map((source) => (
                    <div key={source.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: source.color }}
                        />
                        <span className="text-sm text-gray-700">{source.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{source.total_events || 0} אירועים</span>
                        <span className={`font-medium ${
                          source.sync_status === 'completed' ? 'text-green-600' :
                          source.sync_status === 'failed' ? 'text-red-500' : 'text-gray-500'
                        }`}>
                          {source.sync_status === 'completed' ? 'הושלם' :
                           source.sync_status === 'failed' ? 'נכשל' :
                           source.sync_status === 'syncing' ? 'מסנכרן...' : 'ממתין'}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
      <div className="text-xs text-gray-400 mt-2">{sub}</div>
    </div>
  );
}
