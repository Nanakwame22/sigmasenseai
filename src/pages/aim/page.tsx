import React, { useEffect, useState } from 'react';
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
import OperationalTrustPanel from '../../components/common/OperationalTrustPanel';

type Section =
  | 'overview'
  | 'recommendations'
  | 'forecasts'
  | 'decision'
  | 'action'
  | 'alerts'
  | 'ask'
  | 'history'
  | 'reports';

type BriefingLens = 'executive' | 'operations' | 'quality';

const AIMPage: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, userRole } = useAuth();
  const aimStats = useAIMData();
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [isQuickAskOpen, setIsQuickAskOpen] = useState(false);
  const [isRailMinimized, setIsRailMinimized] = useState(true);
  const [briefingLens, setBriefingLens] = useState<BriefingLens>('operations');

  useEffect(() => {
    const saved = localStorage.getItem('aim_quick_ask_minimized');
    if (saved === 'false') {
      setIsRailMinimized(false);
    } else if (saved === 'true') {
      setIsRailMinimized(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('aim_quick_ask_minimized', String(isRailMinimized));
  }, [isRailMinimized]);

  useEffect(() => {
    const defaultLens: BriefingLens =
      userRole === 'admin' || userRole === 'org_leader'
        ? 'executive'
        : userRole === 'process_owner'
          ? 'operations'
          : 'quality';
    setBriefingLens(defaultLens);
  }, [userRole]);

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
    aimStats.aiConfidence >= 85
      ? 'Decision-ready'
      : aimStats.aiConfidence >= 70
        ? 'Operationally usable'
        : aimStats.aiConfidence > 0
          ? 'Calibrating'
          : 'Awaiting stronger evidence';

  const impactState =
    aimStats.predictedImpact > 0
      ? 'Modeled from live recommendations and project value'
      : 'Generate recommendations or forecasts to surface modeled impact';

  const leadTimeState =
    aimStats.alertLeadTime > 0
      ? 'Average lead time across predictive alerts'
      : 'Lead time appears once active alerts include future breach windows';

  const readinessTone =
    aimStats.decisionReadiness === 'Action-ready'
      ? 'emerald'
      : aimStats.decisionReadiness === 'Needs review'
        ? 'amber'
        : aimStats.decisionReadiness === 'Directional'
          ? 'teal'
          : 'slate';

  const readinessNote =
    aimStats.decisionReadiness === 'Action-ready'
      ? 'AIM has enough current evidence to support operational follow-through.'
      : aimStats.decisionReadiness === 'Needs review'
        ? 'Signals are meaningful, but a human review should confirm the next move.'
        : aimStats.decisionReadiness === 'Directional'
          ? 'AIM can frame the situation, but the signal mix is still building toward a stronger recommendation.'
          : 'AIM is connected, but more live evidence is needed before decision-grade guidance is available.';

  const briefingByLens: Record<
    BriefingLens,
    {
      label: string;
      audience: string;
      headline: string;
      summary: string;
      nextMove: string;
      chips: string[];
    }
  > = {
    executive: {
      label: 'Executive',
      audience: 'Board, COO, service-line leadership',
      headline: 'Focus on exposure, readiness, and where intervention is worth executive attention.',
      summary:
        aimStats.predictiveAlertsCount > 0
          ? `${aimStats.predictiveAlertsCount} live signals are under AIM review. Confidence is currently ${confidenceState.toLowerCase()}, so leadership should use AIM to prioritize where escalation or sponsorship is needed most.`
          : 'AIM is monitoring the operation without a concentrated escalation signal right now. Use the workspace to confirm whether exposure is stable or still building.',
      nextMove:
        aimStats.decisionReadiness === 'Action-ready'
          ? 'Review the top recommendation and confirm executive sponsorship, staffing support, or budget clearance.'
          : 'Use Decision Support and Predictive Alerts to confirm where leadership attention will unblock the most value.',
      chips: ['Executive risk view', 'Escalation readiness', 'Value at stake'],
    },
    operations: {
      label: 'Operations',
      audience: 'Process owners and operating managers',
      headline: 'Focus on what is changing, what is actionable, and what needs a local operator review.',
      summary:
        aimStats.actionCenterCount > 0
          ? `${aimStats.actionCenterCount} tracked work items are already connected to AIM. Use this lens to decide what should move into execution, what needs verification, and where signal pressure is still directional.`
          : 'AIM is monitoring signals and surfacing watch conditions, but execution work is still thin. This lens helps operators decide what should be watched, reviewed, or converted into tracked work.',
      nextMove:
        aimStats.recommendationsCount > 0
          ? 'Validate the strongest recommendation against local capacity, then push the best next move into tracked execution.'
          : 'Review the recommendation readiness and predictive alerts sections to see which signals are closest to becoming action-ready.',
      chips: ['Operator queue', 'Execution posture', 'Next best move'],
    },
    quality: {
      label: 'Quality',
      audience: 'Quality, safety, and compliance leaders',
      headline: 'Focus on evidence strength, risk concentration, and where more validation is needed before action.',
      summary:
        aimStats.evidenceCoverage >= 60
          ? `AIM currently has ${aimStats.evidenceSignals}/5 live evidence classes feeding the workspace. Use this lens to test whether the signal is strong enough for intervention or still needs corroboration.`
          : 'AIM is connected, but the evidence stack is still developing. This lens helps quality leaders distinguish directional guidance from stronger recommendation-grade evidence.',
      nextMove:
        aimStats.aiConfidence >= 70
          ? 'Inspect the supporting evidence and close the loop by validating whether completed work produced the expected outcome.'
          : 'Stay in monitor-and-review mode until confidence improves or fresh corroborating data arrives.',
      chips: ['Evidence coverage', 'Validation posture', 'Outcome proof'],
    },
  };

  const activeBriefing = briefingByLens[briefingLens];

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

  const navItems: { id: Section; icon: string; label: string; badge: string | null; badgeLabel?: string | null; pulse: boolean }[] = [
    { id: 'overview', icon: 'ri-dashboard-3-line', label: 'Overview', badge: null, badgeLabel: null, pulse: false },
    {
      id: 'recommendations',
      icon: 'ri-lightbulb-line',
      label: 'Recommendations',
      badge: aimStats.recommendationsCount > 0 ? aimStats.recommendationsCount.toString() : null,
      badgeLabel: null,
      pulse: aimStats.recommendationsPulse,
    },
    { id: 'forecasts', icon: 'ri-line-chart-line', label: 'Impact Forecasts', badge: null, badgeLabel: null, pulse: false },
    { id: 'decision', icon: 'ri-compass-3-line', label: 'Decision Support', badge: null, badgeLabel: null, pulse: false },
    {
      id: 'action',
      icon: 'ri-task-line',
      label: 'Action Center',
      badge: null,
      badgeLabel: null,
      pulse: aimStats.actionPulse,
    },
    {
      id: 'alerts',
      icon: 'ri-alarm-warning-line',
      label: 'Predictive Alerts',
      badge: aimStats.predictiveAlertsNewCount > 0 ? aimStats.predictiveAlertsNewCount.toString() : null,
      badgeLabel: aimStats.predictiveAlertsNewCount > 0 ? 'New' : null,
      pulse: aimStats.alertsPulse,
    },
    { id: 'ask', icon: 'ri-chat-voice-line', label: 'Ask AIM', badge: null, badgeLabel: null, pulse: false },
    { id: 'history', icon: 'ri-history-line', label: 'Insight History', badge: null, badgeLabel: null, pulse: false },
    { id: 'reports', icon: 'ri-file-chart-line', label: 'Reports', badge: null, badgeLabel: null, pulse: false },
  ];

  const isFocusSection = activeSection === 'ask';
  const workspaceGridClass = isFocusSection
    ? 'max-w-[1400px]'
    : isRailMinimized
      ? 'max-w-[1700px] lg:grid-cols-[minmax(0,1fr)_104px]'
      : 'max-w-[1700px] lg:grid-cols-[minmax(0,1fr)_360px]';

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.08),_transparent_18%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.08),_transparent_16%),linear-gradient(180deg,_#f7fbfc,_#edf5f7_40%,_#f8fafc)]">
      <div className="w-[292px] bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.16),_transparent_24%),linear-gradient(180deg,_#0f172a,_#112235_55%,_#0f172a)] border-r border-white/8 shadow-[0_25px_80px_rgba(15,23,42,0.28)] flex flex-col">
        <div className="p-6 border-b border-white/8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-ai-300 via-ai-400 to-cyan-500 rounded-[18px] flex items-center justify-center shadow-[0_18px_40px_rgba(45,212,191,0.28)]">
              <i className="ri-brain-line text-2xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">AIM</h2>
              <p className="text-xs text-brand-200 font-medium">Actionable Intelligence Model</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-white/5 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-brand-200 uppercase tracking-[0.18em]">Data Sources</span>
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

        <div className="flex-1 overflow-y-auto py-4 px-3">
          <nav className="space-y-1.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-[18px] transition-all duration-250 group ${
                  activeSection === item.id
                    ? 'bg-[linear-gradient(135deg,_rgba(45,212,191,0.22),_rgba(14,165,233,0.24))] text-white shadow-[0_14px_30px_rgba(45,212,191,0.18)] ring-1 ring-white/10'
                    : 'text-brand-300 hover:bg-white/6 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <i
                    className={`${item.icon} text-lg ${
                      activeSection === item.id ? 'text-white' : 'text-brand-400 group-hover:text-ai-400'
                    }`}
                  ></i>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium whitespace-nowrap tracking-[0.01em]">{item.label}</span>
                    {item.badgeLabel && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          activeSection === item.id
                            ? 'border-white/20 bg-white/10 text-white/90'
                            : 'border-ai-400/20 bg-ai-500/10 text-ai-300'
                        }`}
                      >
                        {item.badgeLabel}
                      </span>
                    )}
                  </div>
                </div>
                {item.badge && !aimStats.loading && (
                  <span
                    className={`relative px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-300 ${
                      activeSection === item.id ? 'bg-white/20 text-white' : 'bg-ai-500/20 text-ai-400'
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

        <div className="p-3 border-t border-white/8 space-y-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-[18px] text-brand-300 hover:bg-white/6 hover:text-white transition-all duration-200 group"
          >
            <i className="ri-home-4-line text-lg text-brand-400 group-hover:text-ai-400"></i>
            <span className="text-sm font-medium">Dashboard</span>
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-[18px] text-brand-300 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group"
          >
            <i className="ri-logout-box-line text-lg text-brand-400 group-hover:text-red-400"></i>
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className={`mx-auto grid gap-8 p-8 lg:p-10 ${workspaceGridClass}`}>
          <div className="min-w-0">
            <div className="mb-8 rounded-[36px] border border-ai-200/30 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_20%),linear-gradient(135deg,_rgba(15,23,42,0.985),_rgba(17,24,39,0.94))] px-8 py-8 text-white shadow-[0_34px_90px_rgba(15,23,42,0.22)]">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] xl:items-start">
                <div className="min-w-0">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="rounded-full border border-ai-300/30 bg-ai-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ai-200">
                      AIM Workspace
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse"></span>
                      Live intelligence loop
                    </span>
                  </div>
                  <h1 className="max-w-xl text-[2.2rem] font-bold tracking-[-0.03em] leading-[0.94] text-white lg:text-[2.55rem]">Actionable Intelligence Model</h1>
                  <p className="mt-3 max-w-xl text-[13px] leading-5 text-brand-100 md:text-sm">
                    SigmaSense&apos;s decision studio for monitoring risk, modeling outcomes, and converting AI guidance into tracked operational work.
                  </p>
                  <div className="mt-5 rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.16)] backdrop-blur-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-xl">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">Role-Based Briefing</div>
                        <h2 className="mt-2.5 max-w-lg text-base font-semibold tracking-[-0.02em] leading-6 text-white">{activeBriefing.headline}</h2>
                        <p className="mt-2.5 text-[13px] leading-5 text-brand-100">{activeBriefing.summary}</p>
                        <p className="mt-2.5 text-[13px] leading-5 text-ai-100">
                          <span className="font-semibold text-white">Next move:</span> {activeBriefing.nextMove}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {activeBriefing.chips.map((chip) => (
                            <span key={chip} className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] font-medium text-brand-100">
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:max-w-[238px] lg:justify-end">
                        {(
                          [
                            { id: 'executive', label: 'Executive' },
                            { id: 'operations', label: 'Operations' },
                            { id: 'quality', label: 'Quality' },
                          ] as const
                        ).map((lens) => (
                          <button
                            key={lens.id}
                            onClick={() => setBriefingLens(lens.id)}
                            className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                              briefingLens === lens.id
                                ? 'border-ai-300/40 bg-ai-400/15 text-white'
                                : 'border-white/10 bg-white/5 text-brand-200 hover:bg-white/10'
                            }`}
                          >
                            {lens.label}
                          </button>
                        ))}
                        <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 text-left">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300">Audience</div>
                          <div className="mt-1.5 text-[12px] leading-5 font-medium text-white">{activeBriefing.audience}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-brand-100">Role-aware briefings</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-brand-100">Decision-grade AI guidance</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-brand-100">Closed-loop actions</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Recommendations</div>
                      <div className="mt-2 text-[2rem] font-bold leading-none">{aimStats.recommendationsCount}</div>
                      <div className="mt-1 text-xs text-brand-200">Open intelligence opportunities</div>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Tracked Work</div>
                      <div className="mt-2 text-[2rem] font-bold leading-none">{aimStats.actionCenterCount}</div>
                      <div className="mt-1 text-xs text-brand-200">Linked execution work AIM is monitoring</div>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Predictive Alerts</div>
                      <div className="mt-2 text-[2rem] font-bold leading-none">{aimStats.predictiveAlertsCount}</div>
                      <div className="mt-1 text-xs text-brand-200">Signals awaiting review or action</div>
                    </div>
                  </div>

                  <OperationalTrustPanel
                    title="AIM is grounded in live operational evidence"
                    subtitle="Confidence and impact here are derived from connected sources, current recommendations, forecasts, and action-state data rather than static briefing content."
                    chips={[
                      { label: 'Last Refresh', value: formatLastRefresh(aimStats.lastRefreshTime), tone: 'teal' },
                      { label: 'Sources', value: `${aimStats.dataSourcesCount} active`, tone: 'emerald' },
                      { label: 'Decision Readiness', value: aimStats.decisionReadiness, tone: readinessTone as any },
                      { label: 'Evidence Coverage', value: `${aimStats.evidenceSignals}/5 live signals`, tone: aimStats.evidenceCoverage >= 80 ? 'emerald' : aimStats.evidenceCoverage >= 60 ? 'teal' : 'amber' },
                      { label: 'Confidence', value: confidenceState, tone: aimStats.aiConfidence >= 70 ? 'emerald' : 'amber' },
                    ]}
                    note={`${readinessNote} Evidence for AIM comes from live recommendations, metric refreshes, predictive alerts, and tracked actions. When confidence is lower, use the supporting evidence chips and Decision Support to verify whether a recommendation is decision-ready or still directional.`}
                    className="border-white/10 bg-white/95"
                  />
                </div>
              </div>
            </div>

            {renderSection()}
          </div>

          {!isFocusSection && (
            <aside className="hidden lg:block">
              <div className="sticky top-8 space-y-5">
                {isRailMinimized ? (
                  <div className="flex justify-end">
                    <div className="w-[88px] rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.98))] p-3 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                      <div className="flex flex-col items-center gap-3">
                        <button
                          onClick={() => {
                            setIsRailMinimized(false);
                            setIsQuickAskOpen(true);
                          }}
                          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-[0_14px_30px_rgba(20,184,166,0.22)] transition hover:translate-y-[-1px] cursor-pointer"
                          title="Open Quick Ask"
                        >
                          <i className="ri-chat-voice-line text-xl"></i>
                        </button>
                        <button
                          onClick={() => setIsRailMinimized(false)}
                          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-100 cursor-pointer"
                          title="Expand rail"
                        >
                          <i className="ri-layout-right-2-line text-lg"></i>
                        </button>
                        <div className="pt-2 text-center">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 [writing-mode:vertical-rl] rotate-180">
                            AIM Dock
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.98))] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Mission Control</div>
                        <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Quick Ask</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">Use AIM as a live operational copilot without leaving the current briefing.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsQuickAskOpen(!isQuickAskOpen)}
                          className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-2xl transition-colors cursor-pointer"
                          title={isQuickAskOpen ? 'Close Quick Ask' : 'Open Quick Ask'}
                        >
                          <i className={`ri-${isQuickAskOpen ? 'subtract' : 'add'}-line text-slate-600 text-lg`}></i>
                        </button>
                        <button
                          onClick={() => setIsRailMinimized(true)}
                          className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-2xl transition-colors cursor-pointer"
                          title="Minimize rail"
                        >
                          <i className="ri-side-bar-line text-slate-600 text-lg"></i>
                        </button>
                      </div>
                    </div>

                    <div className="mt-5">
                      {isQuickAskOpen ? (
                        <EnhancedQueryEngine compact />
                      ) : (
                        <div className="space-y-4">
                          <div className="rounded-[24px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.12),_transparent_35%),linear-gradient(180deg,_#ffffff,_#f8fafc)] px-5 py-8 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-ai-100 to-ai-200 shadow-[0_14px_34px_rgba(45,212,191,0.14)]">
                              <i className="ri-chat-3-line text-3xl text-ai-600"></i>
                            </div>
                            <p className="mt-4 text-sm font-medium text-slate-700">Ask AIM about risk, throughput, performance, or action priorities.</p>
                            <button
                              onClick={() => setIsQuickAskOpen(true)}
                              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(20,184,166,0.22)] transition hover:translate-y-[-1px]"
                            >
                              <i className="ri-chat-voice-line"></i>
                              Launch Quick Ask
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Intelligence Metrics</div>
                            {aimStats.loading ? (
                              <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                  <div key={i} className="rounded-[24px] border border-slate-200 bg-white p-5">
                                    <div className="mb-2 h-7 w-20 animate-pulse rounded bg-slate-200"></div>
                                    <div className="h-3 w-32 animate-pulse rounded bg-slate-200"></div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <>
                                <div className="rounded-[24px] border border-ai-200/40 bg-gradient-to-br from-ai-50 to-white p-5 shadow-[0_10px_28px_rgba(45,212,191,0.08)]">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-3xl font-bold text-ai-600 mb-1">
                                        {aimStats.aiConfidence > 0 ? `${aimStats.aiConfidence}%` : 'Calibrating'}
                                      </div>
                                      <div className="text-xs text-slate-600 font-medium">AI Confidence Score</div>
                                    </div>
                                    <span className="rounded-full bg-ai-600/10 px-2.5 py-1 text-[11px] font-semibold text-ai-700">
                                      {confidenceState}
                                    </span>
                                  </div>
                                  <p className="mt-3 text-xs leading-5 text-slate-600">
                                    Confidence blends recommendation evidence, model accuracy, and live signal quality.
                                  </p>
                                </div>
                                <div className="rounded-[24px] border border-sky-200/40 bg-gradient-to-br from-sky-50 to-white p-5 shadow-[0_10px_28px_rgba(14,165,233,0.08)]">
                                  <div className="text-3xl font-bold text-sapphire-600 mb-1">
                                    {aimStats.predictedImpact > 0 ? formatCurrency(aimStats.predictedImpact) : 'Building'}
                                  </div>
                                  <div className="text-xs text-slate-600 font-medium">Predicted Impact</div>
                                  <p className="mt-3 text-xs leading-5 text-slate-600">
                                    {impactState}
                                  </p>
                                </div>
                                <div className="rounded-[24px] border border-emerald-200/40 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-[0_10px_28px_rgba(16,185,129,0.08)]">
                                  <div className="text-3xl font-bold text-emerald-600 mb-1">
                                    {aimStats.alertLeadTime > 0 ? `${aimStats.alertLeadTime} days` : 'Standby'}
                                  </div>
                                  <div className="text-xs text-slate-600 font-medium">Alert Lead Time</div>
                                  <p className="mt-3 text-xs leading-5 text-slate-600">
                                    {leadTimeState}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIMPage;
