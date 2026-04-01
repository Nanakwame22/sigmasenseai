import { useAuth } from '../../contexts/AuthContext';

export default function ConnectionError() {
  const { connectionError, retryConnection } = useAuth();

  if (!connectionError) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="ri-wifi-off-line text-3xl text-red-600"></i>
        </div>
        
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Connection Error
        </h2>
        
        <p className="text-slate-600 mb-6">
          {connectionError}
        </p>

        <div className="space-y-3">
          <button
            onClick={retryConnection}
            className="w-full px-6 py-3 bg-gradient-to-r from-teal-600 to-indigo-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
          >
            <i className="ri-refresh-line"></i>
            Retry Connection
          </button>

          <button
            onClick={() => window.location.reload()}
            className="w-full px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-all duration-300"
          >
            Refresh Page
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <p className="text-sm text-slate-500 mb-2">
            Troubleshooting tips:
          </p>
          <ul className="text-xs text-slate-600 space-y-1 text-left">
            <li className="flex items-start gap-2">
              <i className="ri-checkbox-circle-line text-teal-600 mt-0.5"></i>
              <span>Check your internet connection</span>
            </li>
            <li className="flex items-start gap-2">
              <i className="ri-checkbox-circle-line text-teal-600 mt-0.5"></i>
              <span>Verify Supabase service status</span>
            </li>
            <li className="flex items-start gap-2">
              <i className="ri-checkbox-circle-line text-teal-600 mt-0.5"></i>
              <span>Clear browser cache and cookies</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
