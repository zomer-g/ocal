import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Calendar, LogIn } from 'lucide-react';

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();

  // Already logged in — go to dashboard
  if (isAuthenticated && !isLoading) {
    return <Navigate to="/admin" replace />;
  }

  const handleLogin = () => {
    window.location.href = '/api/admin/auth/google';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: '#F6F6F6' }}>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Calendar className="w-8 h-8 text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">יומן לעם</h1>
        </div>

        <p className="text-gray-500 text-sm mb-8">
          כניסה לממשק הניהול
        </p>

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-primary-700 hover:bg-primary-800 text-white rounded-lg font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          <LogIn className="w-5 h-5" />
          התחבר עם Google
        </button>

        <p className="text-xs text-gray-400 mt-6">
          הגישה מוגבלת למנהלים מורשים בלבד
        </p>
      </div>
    </div>
  );
}
