import { Suspense, useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import AskSigmaModal from '../feature/AskSigmaModal';
import NotificationDropdown from '../feature/NotificationDropdown';
import PageLoader from '../common/PageLoader';
import SessionTimeoutModal from '../common/SessionTimeoutModal';
import { useSessionTimeout } from '../../hooks/useSessionTimeout';

interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  is_read: boolean;
  created_at: string;
}

const menuItems = [
  {
    label: 'HEALTHCARE — CPI',
    icon: 'ri-heart-pulse-line',
    submenu: [
      { label: 'CPI Command Center', path: '/dashboard/cpi', icon: 'ri-heart-pulse-line' },
      { label: 'Clinical Intelligence', path: '/dashboard/cpi/clinical-intelligence', icon: 'ri-brain-line' },
      { label: 'Healthcare Workflows', path: '/dashboard/cpi/workflows', icon: 'ri-git-branch-line' },
      { label: 'Health Integrations', path: '/dashboard/cpi/integrations', icon: 'ri-links-line' },
    ],
  },
  {
    label: 'PERFORMANCE OVERVIEW',
    icon: 'ri-dashboard-line',
    submenu: [
      { label: 'Dashboard', path: '/dashboard', icon: 'ri-dashboard-line' },
      { label: 'Metrics', path: '/dashboard/metrics', icon: 'ri-line-chart-line' },
      { label: 'KPI Scorecards', path: '/dashboard/kpi-scorecards', icon: 'ri-bar-chart-box-line' },
      { label: 'KPI Manager', path: '/dashboard/kpi-aggregation', icon: 'ri-database-2-line' },
      { label: 'Benchmarking', path: '/dashboard/benchmarking', icon: 'ri-scales-line' },
    ],
  },
  {
    label: 'ANALYTICS & INSIGHTS',
    icon: 'ri-lightbulb-line',
    submenu: [
      { label: 'AIM — Intelligence Engine', path: '/dashboard/aim', icon: 'ri-robot-line' },
      { label: 'AI Insights', path: '/dashboard/ai-insights', icon: 'ri-pulse-line' },
      { label: 'Advanced Forecasting', path: '/dashboard/advanced-forecasting', icon: 'ri-line-chart-line' },
      { label: 'Anomaly Detection', path: '/dashboard/anomaly-detection', icon: 'ri-alert-line' },
      { label: 'Root Cause Analysis', path: '/dashboard/root-cause', icon: 'ri-search-line' },
      { label: 'What-If Analysis', path: '/dashboard/what-if', icon: 'ri-question-line' },
      { label: 'Simulations', path: '/dashboard/simulations', icon: 'ri-play-circle-line' },
      { label: 'Clustering', path: '/dashboard/clustering', icon: 'ri-bubble-chart-line' },
      { label: 'Classification', path: '/dashboard/classification', icon: 'ri-node-tree' },
      { label: 'Hypothesis Testing', path: '/dashboard/hypothesis-testing', icon: 'ri-flask-line' },
    ],
  },
  {
    label: 'IMPROVEMENT PROJECTS',
    icon: 'ri-tools-line',
    submenu: [
      { label: 'DMAIC Projects', path: '/dashboard/dmaic', icon: 'ri-flow-chart' },
      { label: 'Kaizen', path: '/dashboard/kaizen', icon: 'ri-lightbulb-flash-line' },
      { label: 'Action Tracker', path: '/dashboard/action-tracker', icon: 'ri-task-line' },
      { label: 'Project Templates', path: '/dashboard/project-templates', icon: 'ri-file-copy-line' },
      { label: 'Knowledge Library', path: '/dashboard/knowledge-library', icon: 'ri-book-line' },
      { label: 'SOP Builder', path: '/dashboard/sop-builder', icon: 'ri-file-text-line' },
    ],
  },
  {
    label: 'DATA & AUTOMATIONS',
    icon: 'ri-database-line',
    submenu: [
      { label: 'Data Integration', path: '/dashboard/data-integration', icon: 'ri-links-line' },
      { label: 'ETL Pipelines', path: '/dashboard/etl-pipelines', icon: 'ri-git-branch-line' },
      { label: 'Data Quality', path: '/dashboard/data-quality', icon: 'ri-shield-check-line' },
      { label: 'Data Cleaning', path: '/dashboard/data-cleaning', icon: 'ri-eraser-line' },
      { label: 'Data Mapping', path: '/dashboard/data-mapping', icon: 'ri-map-pin-line' },
      { label: 'Automation Rules', path: '/dashboard/automation-rules', icon: 'ri-settings-3-line' },
      { label: 'API & Webhooks', path: '/dashboard/api-webhooks', icon: 'ri-code-s-slash-line' },
    ],
  },
  {
    label: 'ORGANIZATION',
    icon: 'ri-building-line',
    submenu: [
      { label: 'Organization Settings', path: '/dashboard/organization', icon: 'ri-building-line' },
      { label: 'Team Management', path: '/dashboard/team', icon: 'ri-team-line' },
      { label: 'Alerts', path: '/dashboard/alerts', icon: 'ri-notification-line' },
      { label: 'Audit Log', path: '/dashboard/audit-log', icon: 'ri-file-list-line' },
    ],
  },
];

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, organization, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openSubmenu, setOpenSubmenu] = useState<Record<string, boolean>>({
    'HEALTHCARE — CPI': true,
    'PERFORMANCE OVERVIEW': false,
    'ANALYTICS & INSIGHTS': false,
    'IMPROVEMENT PROJECTS': false,
    'DATA & AUTOMATIONS': false,
    'ORGANIZATION': false,
  });
  const [showAskSigma, setShowAskSigma] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // HIPAA: Session timeout — warn at 13 min, logout at 15 min
  const { showWarning, remainingTime, stayLoggedIn } = useSessionTimeout({
    timeoutDuration: 15 * 60 * 1000,
    warningDuration: 2 * 60 * 1000,
    onTimeout: () => navigate('/auth/login'),
  });

  const handleLogout = async () => {
    await signOut();
    navigate('/auth/login');
  };

  const toggleSubmenu = (label: string) => {
    setOpenSubmenu(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const currentItem = menuItems
    .flatMap((s) => s.submenu || [])
    .find((item) => item.path === location.pathname);
  const isAIM = location.pathname === '/dashboard/aim' || location.pathname.startsWith('/aim');

  return (
    <div className="flex h-screen bg-[#F0F4F8]">
      {/* ── Dark Premium Sidebar ── */}
      <aside
        className={`bg-gradient-to-b from-brand-900 via-brand-900 to-[#0B1D2E] shadow-elevation-5 transition-all duration-300 flex flex-col relative overflow-hidden ${
          sidebarOpen ? 'w-64' : 'w-[72px]'
        }`}
      >
        {/* Decorative glows */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-ai-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-20 left-0 w-32 h-32 bg-sapphire-500/5 rounded-full blur-2xl pointer-events-none"></div>

        {/* Logo Header */}
        <div className={`flex items-center border-b border-white/8 shrink-0 ${sidebarOpen ? 'px-5 py-4 justify-between' : 'px-0 py-4 justify-center'}`}>
          {sidebarOpen && (
            <Link to="/" className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-gradient-to-br from-ai-400 to-sapphire-500 rounded-lg flex items-center justify-center shadow-glow-sm shrink-0">
                <i className="ri-line-chart-line text-white text-base"></i>
              </div>
              <div className="min-w-0">
                <span className="text-base font-bold text-white tracking-tight leading-none">SigmaSense</span>
                <span className="block text-xs text-ai-400 font-semibold tracking-widest uppercase leading-none mt-0.5">AI Platform</span>
              </div>
            </Link>
          )}
          {!sidebarOpen && (
            <Link to="/" className="w-8 h-8 bg-gradient-to-br from-ai-400 to-sapphire-500 rounded-lg flex items-center justify-center shadow-glow-sm">
              <i className="ri-line-chart-line text-white text-base"></i>
            </Link>
          )}
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-white/40 hover:text-white/80 transition-colors p-1 rounded-lg hover:bg-white/8 cursor-pointer shrink-0"
            >
              <i className="ri-menu-fold-line text-lg"></i>
            </button>
          )}
        </div>

        {/* Collapsed toggle */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="mx-auto mt-3 text-white/40 hover:text-white/80 transition-colors p-2 rounded-lg hover:bg-white/8 cursor-pointer"
          >
            <i className="ri-menu-unfold-line text-lg"></i>
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-hide">
          {menuItems.map((section) => (
            <div key={section.label} className="mb-1">
              {/* Section Header */}
              <button
                onClick={() => toggleSubmenu(section.label)}
                className={`w-full flex items-center px-2.5 py-2 rounded-lg transition-all cursor-pointer group ${
                  sidebarOpen ? 'justify-between' : 'justify-center'
                } hover:bg-white/6`}
              >
                {sidebarOpen ? (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <i className={`${section.icon} text-white/35 text-sm shrink-0`}></i>
                      <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest truncate">{section.label}</span>
                    </div>
                    <i className={`ri-arrow-${openSubmenu[section.label] ? 'down' : 'right'}-s-line text-xs text-white/25 transition-transform shrink-0`}></i>
                  </>
                ) : (
                  <i className={`${section.icon} text-white/35 text-base`}></i>
                )}
              </button>

              {/* Submenu Items */}
              {openSubmenu[section.label] && (
                <div className={`${sidebarOpen ? 'mt-0.5 space-y-0.5' : 'hidden'}`}>
                  {section.submenu?.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.label}
                        to={item.path}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer group ${
                          isActive
                            ? 'bg-white/12 text-white font-semibold shadow-inner'
                            : 'text-white/55 hover:text-white hover:bg-white/7'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 w-0.5 h-5 bg-ai-400 rounded-r-full" style={{ marginLeft: '0px' }}></span>
                        )}
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-ai-500/30' : 'bg-white/5 group-hover:bg-white/10'
                        }`}>
                          <i className={`${item.icon} text-xs ${isActive ? 'text-ai-300' : 'text-white/50 group-hover:text-white/80'}`}></i>
                        </div>
                        <span className="truncate">{item.label}</span>
                        {isActive && <div className="ml-auto w-1.5 h-1.5 bg-ai-400 rounded-full shrink-0"></div>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-3 border-t border-white/8 shrink-0">
          <div className={`flex items-center gap-3 p-2.5 rounded-xl bg-white/6 hover:bg-white/10 transition-colors ${!sidebarOpen && 'justify-center'}`}>
            <div className="w-8 h-8 bg-gradient-to-br from-sapphire-400 to-ai-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-glow-sm shrink-0">
              {user?.email?.[0].toUpperCase() || 'U'}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/90 truncate leading-snug">
                  {user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-[10px] text-white/40 truncate leading-snug">{user?.email || 'user@example.com'}</p>
              </div>
            )}
            {sidebarOpen && (
              <button
                onClick={handleLogout}
                className="text-white/30 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10 cursor-pointer shrink-0"
                title="Sign Out"
              >
                <i className="ri-logout-box-line text-base"></i>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar — frosted glass */}
        <header className="bg-white/80 backdrop-blur-md border-b border-white/60 px-6 flex items-center justify-between h-14 shrink-0 shadow-sm relative z-10">
          {/* Gradient bottom border accent */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-ai-400/30 to-transparent"></div>

          <div className="flex items-center gap-3">
            {currentItem && (
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isAIM
                  ? 'bg-gradient-to-br from-ai-500 to-ai-600 shadow-glow-sm'
                  : 'bg-gradient-to-br from-sapphire-500 to-sapphire-600'
              }`}>
                <i className={`${currentItem.icon} text-white text-xs`}></i>
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold text-brand-900 leading-tight tracking-tight">
                {currentItem?.label || 'Dashboard'}
              </h1>
              {isAIM && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-ai-400 rounded-full animate-pulse"></span>
                  <span className="text-[10px] text-ai-600 font-semibold uppercase tracking-wide">Live Intelligence</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Ask Sigma */}
            <button
              onClick={() => setShowAskSigma(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-ai-500 to-ai-600 text-white text-sm font-bold rounded-xl hover:from-ai-600 hover:to-ai-700 transition-all shadow-glow-sm hover:shadow-glow-md hover:-translate-y-0.5 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-brain-line text-base"></i>
              <span>Ask Sigma</span>
            </button>

            {/* Notifications */}
            <NotificationDropdown />

            {/* User Avatar */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-8 h-8 bg-gradient-to-br from-sapphire-500 to-sapphire-600 rounded-lg flex items-center justify-center text-white font-bold shadow-elevation-2 hover:shadow-elevation-3 transition-smooth cursor-pointer text-sm"
              >
                {user?.email?.[0].toUpperCase() || 'U'}
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-elevation-4 border border-border py-2 z-50">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-semibold text-brand-900 truncate">
                      {user?.email?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-xs text-brand-400 truncate">{user?.email}</p>
                  </div>
                  <Link
                    to="/dashboard/organization"
                    className="flex items-center px-4 py-2.5 text-sm text-brand-700 hover:bg-background transition-colors cursor-pointer"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <i className="ri-settings-line mr-3 text-lg"></i>
                    Organization Settings
                  </Link>
                  <Link
                    to="/dashboard/team"
                    className="flex items-center px-4 py-2.5 text-sm text-brand-700 hover:bg-background transition-colors cursor-pointer"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <i className="ri-team-line mr-3 text-lg"></i>
                    Team Management
                  </Link>
                  <div className="border-t border-border my-2"></div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <i className="ri-logout-box-line mr-3 text-lg"></i>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#F0F4F8]">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Ask Sigma Modal */}
      {showAskSigma && <AskSigmaModal isOpen={showAskSigma} onClose={() => setShowAskSigma(false)} />}

      {/* HIPAA: Session Timeout Warning Modal */}
      {showWarning && (
        <SessionTimeoutModal
          remainingTime={remainingTime}
          onStayLoggedIn={stayLoggedIn}
        />
      )}
    </div>
  );
}
