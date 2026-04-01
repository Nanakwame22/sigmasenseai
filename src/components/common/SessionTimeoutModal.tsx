import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface SessionTimeoutModalProps {
  remainingTime: number; // ms
  onStayLoggedIn: () => void;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

export default function SessionTimeoutModal({ remainingTime, onStayLoggedIn }: SessionTimeoutModalProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const totalDuration = 2 * 60 * 1000; // 2 minutes warning window
  const progress = Math.max(0, Math.min(1, remainingTime / totalDuration));
  const isUrgent = remainingTime <= 30 * 1000; // last 30 seconds
  const progressRef = useRef<SVGCircleElement>(null);

  // Radial progress circle dimensions
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth/login');
  };

  // Trap focus in modal
  useEffect(() => {
    const stayBtn = document.getElementById('session-stay-btn');
    stayBtn?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-desc"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn">

        {/* Top accent bar */}
        <div className={`h-1.5 w-full transition-all duration-300 ${isUrgent ? 'bg-red-500' : 'bg-amber-400'}`} />

        {/* Content */}
        <div className="px-8 pt-8 pb-6 flex flex-col items-center text-center">

          {/* Countdown circle */}
          <div className="relative w-20 h-20 mb-6">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
              {/* Track */}
              <circle
                cx="36"
                cy="36"
                r={radius}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="5"
              />
              {/* Progress */}
              <circle
                ref={progressRef}
                cx="36"
                cy="36"
                r={radius}
                fill="none"
                stroke={isUrgent ? '#ef4444' : '#f59e0b'}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-100"
              />
            </svg>

            {/* Lock icon in center */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${isUrgent ? 'bg-red-50' : 'bg-amber-50'}`}>
                <i className={`ri-lock-line text-xl ${isUrgent ? 'text-red-500' : 'text-amber-500'}`}></i>
              </div>
            </div>
          </div>

          {/* Title */}
          <h2
            id="session-timeout-title"
            className={`text-xl font-bold mb-2 transition-colors ${isUrgent ? 'text-red-600' : 'text-slate-800'}`}
          >
            Session Expiring Soon
          </h2>

          {/* Description */}
          <p
            id="session-timeout-desc"
            className="text-slate-500 text-sm leading-relaxed mb-6"
          >
            Your session will automatically end in{' '}
            <span className={`font-bold text-base transition-colors ${isUrgent ? 'text-red-600' : 'text-amber-600'}`}>
              {formatTime(remainingTime)}
            </span>{' '}
            due to inactivity.
            <br />
            <span className="text-xs text-slate-400 mt-1 block">
              Automatic logout is required to protect patient data (HIPAA §164.312(a)(2)(iii))
            </span>
          </p>

          {/* HIPAA badge */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 mb-6 w-full justify-center">
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-shield-check-line text-emerald-500 text-base"></i>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Protected by HIPAA Automatic Logoff Policy
            </span>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              id="session-stay-btn"
              onClick={onStayLoggedIn}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer whitespace-nowrap ${
                isUrgent
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200'
                  : 'bg-amber-400 hover:bg-amber-500 text-white shadow-lg shadow-amber-100'
              }`}
            >
              <i className="ri-refresh-line"></i>
              Stay Logged In
            </button>
            <button
              onClick={handleSignOut}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-logout-box-line"></i>
              Sign Out Now
            </button>
          </div>
        </div>

        {/* Progress bar at bottom */}
        <div className="h-1 bg-slate-100 w-full">
          <div
            className={`h-1 transition-all duration-100 ${isUrgent ? 'bg-red-400' : 'bg-amber-300'}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}