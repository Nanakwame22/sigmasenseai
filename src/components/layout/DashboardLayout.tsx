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

const navigationSections = [
  {
    title: 'Performance Overview',
    icon: 'ri-dashboard-line',
    items: [
      { name: 'Dashboard', path: '/dashboard', icon: 'ri-dashboard-line' },
      { name: 'Metrics', path: '/dashboard/metrics', icon: 'ri-line-chart-line' },
      { name: 'KPI Scorecards', path: '/dashboard/kpi-scorecards', icon: 'ri-file-list-3-line' },
      { name: 'KPI Manager', path: '/dashboard/kpi-aggregation', icon: 'ri-database-2-line' },
      { name: 'Benchmarking', path: '/dashboard/benchmarking', icon: 'ri-bar-chart-grouped-line' },
    ],
  },
  {
    title: 'Analytics & Insights',
    icon: 'ri-brain-line',
    items: [
      { name: 'AIM Intelligence', path: '/aim', icon: 'ri-brain-line' },
      { name: 'Advanced Forecasting', path: '/dashboard/advanced-forecasting', icon: 'ri-line-chart-line' },
      { name: 'Anomaly Detection', path: '/dashboard/anomaly-detection', icon: 'ri-alert-line' },
      { name: 'Root Cause Analysis', path: '/dashboard/root-cause', icon: 'ri-search-eye-line' },
      { name: 'What-If Scenarios', path: '/dashboard/what-if', icon: 'ri-lightbulb-line' },
      { name: 'Simulations', path: '/dashboard/simulations', icon: 'ri-play-circle-line' },
      { name: 'Hypothesis Testing', path: '/dashboard/hypothesis-testing', icon: 'ri-flask-line' },
      { name: 'Classification', path: '/dashboard/classification', icon: 'ri-node-tree' },
      { name: 'Clustering', path: '/dashboard/clustering', icon: 'ri-bubble-chart-line' },
    ],
  },
  {
    title: 'Improvement Projects',
    icon: 'ri-rocket-line',
    items: [
      { name: 'DMAIC Projects', path: '/dashboard/dmaic', icon: 'ri-flow-chart' },
      { name: 'Kaizen Board', path: '/dashboard/kaizen', icon: 'ri-lightbulb-flash-line' },
      { name: 'Action Tracker', path: '/dashboard/action-tracker', icon: 'ri-task-line' },
      { name: 'Project Templates', path: '/dashboard/project-templates', icon: 'ri-file-copy-line' },
      { name: 'SOP Builder', path: '/dashboard/sop-builder', icon: 'ri-book-2-line' },
      { name: 'Knowledge Library', path: '/dashboard/knowledge-library', icon: 'ri-book-open-line' },
    ],
  },
  {
    title: 'Data & Automations',
    icon: 'ri-database-line',
    items: [
      { name: 'Data Integration', path: '/dashboard/data-integration', icon: 'ri-links-line' },
      { name: 'ETL Pipelines', path: '/dashboard/etl-pipelines', icon: 'ri-git-branch-line' },
      { name: 'Data Quality', path: '/dashboard/data-quality', icon: 'ri-shield-check-line' },
      { name: 'Data Cleaning', path: '/dashboard/data-cleaning', icon: 'ri-eraser-line' },
      { name: 'Data Mapping', path: '/dashboard/data-mapping', icon: 'ri-map-pin-line' },
      { name: 'Automation Rules', path: '/dashboard/automation-rules', icon: 'ri-robot-line' },
      { name: 'API & Webhooks', path: '/dashboard/api-webhooks', icon: 'ri-code-s-slash-line' },
    ],
  },
  {
    title: 'Organization',
    icon: 'ri-settings-3-line',
    items: [
      { name: 'Organization Settings', path: '/dashboard/organization', icon: 'ri-building-line' },
      { name: 'Team Management', path: '/dashboard/team', icon: 'ri-team-line' },
      { name: 'Alerts', path: '/dashboard/alerts', icon: 'ri-notification-3-line' },
      { name: 'Audit Log', path: '/dashboard/audit-log', icon: 'ri-file-list-line' },
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
    setOpenSubmenu(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  const menuItems = [
    {
      label: 'HEALTHCARE — CPI',
      icon: 'ri-heart-pulse-line',
      submenu: [
        { label: 'CPI Command Center', path: '/dashboard/cpi', icon: 'ri-heart-pulse-line' },
        { label: 'Clinical Intelligence', path: '/dashboard/cpi', icon: 'ri-brain-line' },
        { label: 'Healthcare Workflows', path: '/dashboard/cpi', icon: 'ri-git-branch-line' },
        { label: 'Health Integrations', path: '/dashboard/cpi', icon: 'ri-links-line' },
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

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Premium Design */}
      <aside
        className={`bg-white border-r border-border shadow-elevation-3 transition-all duration-300 flex flex-col ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Logo Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          {sidebarOpen && (
            <Link to="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-sapphire-500 to-sapphire-600 rounded-premium flex items-center justify-center shadow-elevation-2">
                <i className="ri-line-chart-line text-white text-xl"></i>
              </div>
              <span className="text-xl font-bold text-brand-900 tracking-tight">
                SigmaSense
              </span>
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-brand-600 hover:text-brand-900 transition-colors hover:bg-background rounded-premium p-2 cursor-pointer"
          >
            <i className={`ri-${sidebarOpen ? 'menu-fold' : 'menu-unfold'}-line text-xl`}></i>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {menuItems.map((section, sectionIndex) => (
            <div key={section.label} className="mb-6">
              {/* Section Header */}
              <button
                onClick={() => toggleSubmenu(section.label)}
                className={`w-full flex items-center justify-between px-3 py-2 text-label text-brand-600 hover:text-brand-900 transition-all rounded-premium hover:bg-background cursor-pointer ${
                  !sidebarOpen && 'justify-center'
                }`}
              >
                {sidebarOpen && (
                  <>
                    <div className="flex items-center space-x-2">
                      <i className={`${section.icon} text-sm`}></i>
                      <span className="whitespace-nowrap truncate">{section.label}</span>
                    </div>
                    <i className={`ri-arrow-${openSubmenu[section.label] ? 'down' : 'right'}-s-line text-sm transition-transform`}></i>
                  </>
                )}
                {!sidebarOpen && <i className={`${section.icon} text-lg`}></i>}
              </button>

              {/* Submenu Items */}
              {openSubmenu[section.label] && (
                <div className={`${sidebarOpen ? 'mt-2 space-y-1' : 'hidden'}`}>
                  {section.submenu?.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center px-3 py-2.5 text-sm rounded-premium transition-smooth ${
                        location.pathname === item.path
                          ? 'bg-gradient-to-r from-sapphire-50 to-ai-50 text-sapphire-700 font-semibold border-l-3 border-sapphire-600 shadow-elevation-1'
                          : 'text-brand-700 hover:bg-background hover:text-brand-900'
                      } ${!sidebarOpen && 'justify-center'} cursor-pointer`}
                    >
                      <i className={`${item.icon} ${sidebarOpen ? 'mr-3' : ''} text-lg`}></i>
                      {sidebarOpen && <span>{item.label}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-border">
          <div className={`flex items-center ${sidebarOpen ? 'space-x-3' : 'justify-center'}`}>
            <div className="w-10 h-10 bg-gradient-to-br from-sapphire-500 to-sapphire-600 rounded-full flex items-center justify-center text-white font-semibold shadow-elevation-2">
              {user?.email?.[0].toUpperCase() || 'U'}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand-900 truncate">
                  {user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-brand-600 truncate">{user?.email || 'user@example.com'}</p>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button
              onClick={handleLogout}
              className="mt-3 w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-premium transition-colors cursor-pointer font-medium"
            >
              <i className="ri-logout-box-line"></i>
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-border px-8 flex items-center justify-between shadow-elevation-1 h-16 shrink-0">
          {(() => {
            const currentItem = menuItems
              .flatMap((section) => section.submenu || [])
              .find((item) => item.path === location.pathname);
            const isAIM = location.pathname === '/dashboard/aim';
            return (
              <div className="flex items-center gap-3">
                {currentItem && (
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isAIM ? 'bg-gradient-to-br from-ai-500 to-ai-600 shadow-glow-sm' : 'bg-brand-100'}`}>
                    <i className={`${currentItem.icon} text-sm ${isAIM ? 'text-white' : 'text-brand-600'}`}></i>
                  </div>
                )}
                <h1 className="text-base font-bold text-brand-900 tracking-tight">
                  {currentItem?.label || 'Dashboard'}
                </h1>
                {isAIM && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 bg-ai-50 border border-ai-200 rounded-full">
                    <span className="w-1.5 h-1.5 bg-ai-400 rounded-full animate-pulse"></span>
                    <span className="text-xs text-ai-600 font-medium">Live</span>
                  </span>
                )}
              </div>
            );
          })()}

          <div className="flex items-center gap-3">
            {/* Ask Sigma Button */}
            <button
              onClick={() => setShowAskSigma(true)}
              className="btn-ai-highlight flex items-center space-x-2"
            >
              <i className="ri-brain-line text-lg"></i>
              <span className="font-semibold">Ask Sigma</span>
            </button>

            {/* Notifications */}
            <NotificationDropdown />

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-9 h-9 bg-gradient-to-br from-sapphire-500 to-sapphire-600 rounded-full flex items-center justify-center text-white font-semibold shadow-elevation-2 hover:shadow-elevation-3 transition-smooth cursor-pointer text-sm"
              >
                {user?.email?.[0].toUpperCase() || 'U'}
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-premium-lg shadow-elevation-4 border border-border py-2 z-50">
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
        <main className="flex-1 overflow-y-auto p-8 bg-background">
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
