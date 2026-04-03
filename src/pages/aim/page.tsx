import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAIMData } from '../../hooks/useAIMData';
import EnhancedQueryEngine from './components/EnhancedQueryEngine';
import PredictiveAlertsPanel from './components/PredictiveAlertsPanel';
import OverviewSection from './components/OverviewSection';
import RecommendationsSection from './components/RecommendationsSection';
import ImpactForecastsSection from './components/ImpactForecastsSection';
import DecisionSupportSection from './components/DecisionSupportSection';
import ActionCenterSection from './components/ActionCenterSection';
import InsightHistorySection from './components/InsightHistorySection';
import ReportsSection from './components/ReportsSection';

type Section = 'overview' | 'recommendations' | 'forecasts' | 'decision' | 'action' | 'alerts' | 'ask' | 'history' | 'reports';

const AIMPage: React.FC = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const aimStats = useAIMData();
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [isQuickAskOpen, setIsQuickAskOpen] = useState(false);

  const formatLastRefresh = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  const confidenceState =
    aimStats.aiConfidence >= 85 ? 'Decision-ready'
    : aimStats.aiConfidence >= 70 ? 'Operationally usable'
    : aimStats.aiConfidence > 0 ? 'Calibrating'
    : 'Awaiting stronger evidence';

  const impactState =
    aimStats.predictedImpact > 0
      ? 'Modeled from live recommendations and project value'
      : 'Generate recommendations or forecasts to surface modeled impact';

  const leadTimeState =
    aimStats.alertLeadTime > 0
      ? 'Average lead time across predictive alerts'
      : 'Lead time appears once active alerts include future breach windows';

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return <OverviewSection />;
      case 'recommendations':
        return <RecommendationsSection />;
      case 'forecasts':
        return <ImpactForecastsSection />;
      case 'decision':
        return <DecisionSupportSection />;
      case 'action':
        return <ActionCenterSection />;
      case 'alerts':
        return <PredictiveAlertsPanel />;
      case 'ask':
        return <EnhancedQueryEngine />;
      case 'history':
        return <InsightHistorySection />;
      case 'reports':
        return <ReportsSection />;
      default:
        return <OverviewSection />;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const navItems: { id: Section; icon: string; label: string; badge: string | null; pulse: boolean }[] = [
    { id: 'overview', icon: 'ri-dashboard-3-line', label: 'Overview', badge: null, pulse: false },
    {
      id: 'recommendations',
      icon: 'ri-lightbulb-line',
      label: 'Recommendations',
      badge: aimStats.recommendationsCount > 0 ? aimStats.recommendationsCount.toString() : null,
      pulse: aimStats.recommendationsPulse,
    },
    { id: 'forecasts', icon: 'ri-line-chart-line', label: 'Impact Forecasts', badge: null, pulse: false },
    { id: 'decision', icon: 'ri-compass-3-line', label: 'Decision Support', badge: null, pulse: false },
    {
      id: 'action',
      icon: 'ri-task-line',
      label: 'Action Center',
      badge: aimStats.actionCenterCount > 0 ? aimStats.actionCenterCount.toString() : null,
      pulse: aimStats.actionPulse,
    },
    {
      id: 'alerts',
      icon: 'ri-alarm-warning-line',
      label: 'Predictive Alerts',
      badge: aimStats.predictiveAlertsCount > 0 ? aimStats.predictiveAlertsCount.toString() : null,
      pulse: aimStats.alertsPulse,
    },
    { id: 'ask', icon: 'ri-chat-voice-line', label: 'Ask AIM', badge: null, pulse: false },
    { id: 'history', icon: 'ri-history-line', label: 'Insight History', badge: null, pulse: false },
    { id: 'reports', icon: 'ri-file-chart-line', label: 'Reports', badge: null, pulse: false },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left Sidebar Navigation - Premium Design */}
      <div className="w-64 bg-gradient-to-b from-brand-900 via-brand-800 to-brand-900 border-r border-brand-700/50 shadow-elevation-5 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-brand-700/50">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-ai-400 to-ai-500 rounded-premium-lg flex items-center justify-center shadow-glow-md">
              <i className="ri-brain-line text-2xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">AIM</h2>
              <p className="text-xs text-brand-300 font-medium">Intelligence Engine</p>
            </div>
          </div>

          {/* Data Sources Status */}
          <div className="bg-brand-800/50 rounded-premium p-4 border border-brand-700/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-brand-300 uppercase tracking-wide">Data Sources</span>
              {aimStats.loading ? (
                <div className="w-12 h-4 bg-brand-700/50 rounded animate-pulse"></div>
              ) : (
                <span className="text-sm font-bold text-ai-400">{aimStats.dataSourcesCount} Active</span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs mb-3">
              <span className="text-brand-400">Last Refresh</span>
              {aimStats.loading ? (
                <div className="w-16 h-3 bg-brand-700/50 rounded animate-pulse"></div>
              ) : (
                <span className="text-brand-200 font-medium tabular-nums">
                  {formatLastRefresh(aimStats.lastRefreshTime)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-ai-400 rounded-full animate-pulse shadow-glow-sm"></div>
              <span className="text-xs text-ai-400 font-medium">Live Monitoring</span>
            </div>
          </div>
        </div>

        {/* Navigation Menu - Scrollable */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-premium transition-all duration-250 group ${
                  activeSection === item.id
                    ? 'bg-gradient-to-r from-ai-500 to-ai-600 text-white shadow-glow-md'
                    : 'text-brand-300 hover:bg-brand-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <i className={`${item.icon} text-lg ${
                    activeSection === item.id ? 'text-white' : 'text-brand-400 group-hover:text-ai-400'
                  }`}></i>
                  <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                </div>
                {item.badge && !aimStats.loading && (
                  <span
                    className={`relative px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-300 ${
                      activeSection === item.id
                        ? 'bg-white/20 text-white'
                        : 'bg-ai-500/20 text-ai-400'
                    } ${item.pulse ? 'scale-125 ring-2 ring-ai-400/60 ring-offset-1 ring-offset-brand-900' : 'scale-100'}`}
                  >
                    {item.badge}
                    {item.pulse && (
                      <span className="absolute inset-0 rounded-full bg-ai-400/30 animate-ping"></span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-brand-700/50 space-y-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-premium text-brand-300 hover:bg-brand-800/50 hover:text-white transition-all duration-200 group"
          >
            <i className="ri-home-4-line text-lg text-brand-400 group-hover:text-ai-400"></i>
            <span className="text-sm font-medium">Dashboard</span>
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-premium text-brand-300 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group"
          >
            <i className="ri-logout-box-line text-lg text-brand-400 group-hover:text-red-400"></i>
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-zone-primary">
        <div className="p-8">
          <div className="mb-8 rounded-[28px] border border-ai-200/40 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.14),_transparent_35%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(17,24,39,0.9))] px-8 py-7 text-white shadow-elevation-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 flex items-center gap-3">
                  <span className="rounded-full border border-ai-300/30 bg-ai-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ai-200">
                    AIM Workspace
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse"></span>
                    Live intelligence loop
                  </span>
                </div>
                <h1 className="text-4xl font-bold tracking-tight text-white">Actionable Intelligence Model</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-100">
                  SigmaSense&apos;s decision studio for monitoring risk, modeling outcomes, and converting AI guidance into tracked operational work.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[520px]">
                <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Recommendations</div>
                  <div className="mt-2 text-3xl font-bold">{aimStats.recommendationsCount}</div>
                  <div className="mt-1 text-xs text-brand-200">Open intelligence opportunities</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Tracked Actions</div>
                  <div className="mt-2 text-3xl font-bold">{aimStats.actionCenterCount}</div>
                  <div className="mt-1 text-xs text-brand-200">Execution items flowing through AIM</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Predictive Alerts</div>
                  <div className="mt-2 text-3xl font-bold">{aimStats.predictiveAlertsCount}</div>
                  <div className="mt-1 text-xs text-brand-200">Signals awaiting review or action</div>
                </div>
              </div>
            </div>
          </div>
          {renderSection()}
        </div>
      </div>

      {/* Right Sidebar - Quick Ask AIM */}
      <div className="w-96 bg-white border-l border-border shadow-elevation-4 flex flex-col">
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-brand-900">Quick Ask</h3>
              <button
                onClick={() => setIsQuickAskOpen(!isQuickAskOpen)}
                className="w-9 h-9 flex items-center justify-center hover:bg-background rounded-premium transition-colors cursor-pointer"
              >
                <i className={`ri-${isQuickAskOpen ? 'subtract' : 'add'}-line text-brand-600 text-lg`}></i>
              </button>
            </div>
            <p className="text-sm text-brand-600">Natural language queries powered by AI</p>
          </div>
          
          <div className="flex-1 overflow-hidden">
            {isQuickAskOpen ? (
              <EnhancedQueryEngine compact />
            ) : (
              <div className="p-6 space-y-6">
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-br from-ai-100 to-ai-200 rounded-premium-lg flex items-center justify-center mx-auto mb-4 shadow-elevation-2">
                    <i className="ri-chat-3-line text-3xl text-ai-600"></i>
                  </div>
                  <p className="text-sm text-brand-600 mb-4 font-medium">Start asking questions about your operations</p>
                  <button
                    onClick={() => setIsQuickAskOpen(true)}
                    className="btn-ai-highlight"
                  >
                    Open Quick Ask
                  </button>
                </div>

                {/* Quick Stats */}
                <div className="space-y-4">
                  <h4 className="text-label text-brand-600">Intelligence Metrics</h4>
                  {aimStats.loading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="p-4 bg-background rounded-premium">
                          <div className="w-16 h-6 bg-brand-200 rounded animate-pulse mb-2"></div>
                          <div className="w-24 h-3 bg-brand-200 rounded animate-pulse"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-4 bg-gradient-to-br from-ai-50 to-ai-100/50 rounded-premium border border-ai-200/30 elevation-low">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-kpi-medium text-ai-600 mb-1">
                              {aimStats.aiConfidence > 0 ? `${aimStats.aiConfidence}%` : 'Calibrating'}
                            </div>
                            <div className="text-xs text-brand-600 font-medium">AI Confidence Score</div>
                          </div>
                          <span className="rounded-full bg-ai-600/10 px-2.5 py-1 text-[11px] font-semibold text-ai-700">
                            {confidenceState}
                          </span>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-brand-600">
                          Confidence blends recommendation evidence, model accuracy, and live signal quality.
                        </p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-sapphire-50 to-sapphire-100/50 rounded-premium border border-sapphire-200/30 elevation-low">
                        <div className="text-kpi-medium text-sapphire-600 mb-1">
                          {aimStats.predictedImpact > 0 ? formatCurrency(aimStats.predictedImpact) : 'Building'}
                        </div>
                        <div className="text-xs text-brand-600 font-medium">Predicted Impact</div>
                        <p className="mt-3 text-xs leading-5 text-brand-600">
                          {impactState}
                        </p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-premium border border-emerald-200/30 elevation-low">
                        <div className="text-kpi-medium text-emerald-600 mb-1">
                          {aimStats.alertLeadTime > 0 ? `${aimStats.alertLeadTime} days` : 'Standby'}
                        </div>
                        <div className="text-xs text-brand-600 font-medium">Alert Lead Time</div>
                        <p className="mt-3 text-xs leading-5 text-brand-600">
                          {leadTimeState}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIMPage;
