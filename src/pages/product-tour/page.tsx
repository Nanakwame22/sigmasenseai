import { useState, useEffect, useCallback } from 'react';
import Navigation from '../home/components/Navigation';
import Footer from '../home/components/Footer';
import TourHero from './components/TourHero';
import TourSidebar from './components/TourSidebar';
import ModuleSection from './components/ModuleSection';
import TourCTA from './components/TourCTA';
import SEOHead from '../../components/common/SEOHead';
import {
  DashboardPreview,
  AIMPreview,
  CPIPreview,
  AnomalyPreview,
  DMAICPreview,
  RootCausePreview,
  ForecastPreview,
  DataIntegrationPreview,
  KaizenPreview,
  BenchmarkingPreview,
} from './components/ModulePreviews';

const MODULES = [
  {
    id: 'dashboard',
    label: 'Dashboard & KPIs',
    icon: 'ri-dashboard-3-line',
    color: 'bg-teal-600',
    badge: 'Core Platform',
    badgeColor: 'bg-teal-50 text-teal-700 border border-teal-200',
    title: 'Your Real-Time Operational Command Center',
    description:
      'See every KPI, trend, and alert across your entire organization on a single dashboard. No more digging through spreadsheets — live visibility in seconds.',
    features: [
      { icon: 'ri-bar-chart-box-line', text: 'Configurable KPI cards with real-time trend lines and delta vs. baseline' },
      { icon: 'ri-pulse-line', text: 'Multi-site performance rollup with drill-down into individual departments' },
      { icon: 'ri-layout-grid-line', text: 'Drag-and-drop dashboard builder — customize views per role' },
      { icon: 'ri-history-line', text: '90-day historical comparison with automated period-over-period analysis' },
    ],
    ctaLabel: 'Open Dashboard',
    ctaLink: '/dashboard',
    preview: <DashboardPreview />,
    reverse: false,
  },
  {
    id: 'aim',
    label: 'AIM — AI Intelligence',
    icon: 'ri-brain-line',
    color: 'bg-gray-900',
    badge: 'AI Engine',
    badgeColor: 'bg-gray-900 text-teal-400 border border-gray-700',
    title: 'Ask Questions. Get Prioritized Actions.',
    description:
      'AIM replaces your analyst queue. Ask anything in plain English, and get ranked recommendations with impact forecasts — automatically.',
    features: [
      { icon: 'ri-search-eye-line', text: 'Natural language query engine: "Why did readmissions spike last Tuesday?"' },
      { icon: 'ri-list-ordered', text: 'Priority-ranked recommendations with confidence scores and ROI estimates' },
      { icon: 'ri-flashlight-line', text: 'Proactive AI alerts before KPIs breach thresholds — not after' },
      { icon: 'ri-robot-line', text: 'Continuous learning model that improves with your organization\'s data' },
    ],
    ctaLabel: 'Try AIM Engine',
    ctaLink: '/dashboard/aim',
    preview: <AIMPreview />,
    reverse: true,
  },
  {
    id: 'cpi',
    label: 'CPI — Clinical Intelligence',
    icon: 'ri-heart-pulse-line',
    color: 'bg-emerald-600',
    badge: 'HIPAA Compliant',
    badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    title: 'Clinical Performance Intelligence Built for Healthcare',
    description:
      'The only HIPAA-compliant clinical analytics module with field-level PHI encryption, real-time EHR integration, and automated clinical trigger workflows.',
    features: [
      { icon: 'ri-lock-2-line', text: 'Field-level AES-256 encryption for all PHI data columns — at rest in Supabase' },
      { icon: 'ri-link-m', text: 'Pre-built connectors for Epic, Cerner, HL7 FHIR, and LabCorp integrations' },
      { icon: 'ri-robot-line', text: 'Auto-trigger workflows: ED surge, readmission risk, lab escalation' },
      { icon: 'ri-file-shield-2-line', text: 'Complete phi_access_logs audit trail satisfying HIPAA §164.312' },
    ],
    ctaLabel: 'Explore CPI Module',
    ctaLink: '/cpi',
    preview: <CPIPreview />,
    reverse: false,
  },
  {
    id: 'anomaly',
    label: 'Anomaly Detection',
    icon: 'ri-alarm-warning-line',
    color: 'bg-red-600',
    badge: 'Real-Time',
    badgeColor: 'bg-red-50 text-red-700 border border-red-200',
    title: 'Know Before It Breaks — 24/7 Statistical Monitoring',
    description:
      'SigmaSenseAI watches every metric, every minute. Statistical anomaly detection catches drift before it becomes a crisis, and fires the right alert to the right person.',
    features: [
      { icon: 'ri-compass-discover-line', text: 'Control chart-based detection (3σ, 4σ, 6σ) across 48+ operational metrics simultaneously' },
      { icon: 'ri-notification-4-line', text: 'Multi-channel alerts: Email, Slack, PagerDuty, webhook, in-app — fully configurable' },
      { icon: 'ri-eye-line', text: 'Auto-suppression of known noise patterns — reduces false positive fatigue by 80%' },
      { icon: 'ri-link-unlink-m', text: 'Anomaly-to-DMAIC bridge: One click to launch an improvement project from any alert' },
    ],
    ctaLabel: 'View Alerts Module',
    ctaLink: '/dashboard/alerts',
    preview: <AnomalyPreview />,
    reverse: true,
  },
  {
    id: 'dmaic',
    label: 'DMAIC Projects',
    icon: 'ri-flow-chart',
    color: 'bg-teal-700',
    badge: 'Six Sigma',
    badgeColor: 'bg-teal-50 text-teal-700 border border-teal-200',
    title: 'Run Six Sigma Projects — Without the Spreadsheets',
    description:
      'A digital DMAIC workspace that takes your team from problem statement to sustained control. All five phases, fully structured, with AI-powered analysis at every step.',
    features: [
      { icon: 'ri-map-pin-range-line', text: 'Guided Define → Measure → Analyze → Improve → Control workflow with phase gates' },
      { icon: 'ri-team-line', text: 'Team assignments, deadlines, and progress tracking built into every task' },
      { icon: 'ri-check-double-line', text: 'Automated hypothesis testing, capability analysis, and control charts inline' },
      { icon: 'ri-folder-open-line', text: 'Pre-built templates for 20+ common healthcare and manufacturing project types' },
    ],
    ctaLabel: 'Open DMAIC Workspace',
    ctaLink: '/dashboard/dmaic',
    preview: <DMAICPreview />,
    reverse: false,
  },
  {
    id: 'root-cause',
    label: 'Root Cause Analysis',
    icon: 'ri-search-eye-line',
    color: 'bg-gray-800',
    badge: 'AI Powered',
    badgeColor: 'bg-gray-100 text-gray-700 border border-gray-200',
    title: 'Find the Real Problem — Not Just the Symptoms',
    description:
      'AI-generated fishbone diagrams, 5-Why trees, and probabilistic root cause scoring. Stop guessing and start solving the actual driver.',
    features: [
      { icon: 'ri-git-branch-line', text: 'AI-generated cause-and-effect trees from raw metric data — no manual diagramming' },
      { icon: 'ri-percent-line', text: 'Probability scores per root cause based on historical pattern matching' },
      { icon: 'ri-git-merge-line', text: 'Pareto analysis with automatic top-3 high-impact causes highlighted' },
      { icon: 'ri-arrow-right-circle-line', text: 'One-click escalation from root cause to corrective action in Action Tracker' },
    ],
    ctaLabel: 'Explore Root Cause',
    ctaLink: '/dashboard/root-cause',
    preview: <RootCausePreview />,
    reverse: true,
  },
  {
    id: 'forecasting',
    label: 'Forecasting & Simulations',
    icon: 'ri-line-chart-line',
    color: 'bg-teal-600',
    badge: 'Predictive',
    badgeColor: 'bg-teal-50 text-teal-700 border border-teal-200',
    title: 'See 30 Days Ahead. Test Changes Before You Make Them.',
    description:
      'Multi-model forecasting (ARIMA, Prophet, Ensemble) and What-If scenario simulations let you predict demand, model interventions, and validate changes risk-free.',
    features: [
      { icon: 'ri-skip-forward-line', text: 'Up to 90-day patient volume, staffing, and resource demand forecasts' },
      { icon: 'ri-flask-line', text: 'What-If simulator: "If LOS drops 1 day, what happens to revenue and bed capacity?"' },
      { icon: 'ri-shuffle-line', text: 'Monte Carlo simulations with confidence intervals for risk quantification' },
      { icon: 'ri-robot-2-line', text: 'Ensemble model selection — automatically picks the most accurate model per dataset' },
    ],
    ctaLabel: 'Try Forecasting',
    ctaLink: '/dashboard/advanced-forecasting',
    preview: <ForecastPreview />,
    reverse: false,
  },
  {
    id: 'data',
    label: 'Data Integration & ETL',
    icon: 'ri-database-2-line',
    color: 'bg-gray-700',
    badge: 'Infrastructure',
    badgeColor: 'bg-gray-100 text-gray-600 border border-gray-200',
    title: 'Connect Every Data Source. Clean It. Trust It.',
    description:
      'Ingest data from any EHR, lab system, finance platform, or flat file. Transform and validate it with built-in ETL pipelines, data quality rules, and automated cleaning.',
    features: [
      { icon: 'ri-plug-2-line', text: 'Pre-built connectors for 50+ systems — Epic, Cerner, SAP, Salesforce, flat files' },
      { icon: 'ri-shield-check-line', text: 'Automated data quality rules with real-time quality scores and drift detection' },
      { icon: 'ri-scales-line', text: 'Schema mapping and field transformation with visual drag-and-drop builder' },
      { icon: 'ri-history-line', text: 'Full pipeline run history, error logs, and rollback capability per pipeline' },
    ],
    ctaLabel: 'View Data Hub',
    ctaLink: '/dashboard/data-integration',
    preview: <DataIntegrationPreview />,
    reverse: true,
  },
  {
    id: 'kaizen',
    label: 'Kaizen & Action Tracker',
    icon: 'ri-kanban-view',
    color: 'bg-emerald-600',
    badge: 'Continuous Improvement',
    badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    title: 'Every Improvement Tracked. Nothing Falls Through the Cracks.',
    description:
      'Kaizen boards, action items, and SOP builder — all in one place. Turn every AI recommendation into an assigned, tracked, time-bound action.',
    features: [
      { icon: 'ri-layout-column-line', text: 'Kanban-style Kaizen board: Backlog → In Progress → Review → Done' },
      { icon: 'ri-user-add-line', text: 'Owner assignment, due dates, and priority tagging per action item' },
      { icon: 'ri-file-text-line', text: 'SOP Builder: turn completed improvements into reusable standard procedures' },
      { icon: 'ri-links-line', text: 'AIM-to-Action bridge: AI recommendations auto-populate as Kaizen items' },
    ],
    ctaLabel: 'Open Kaizen Board',
    ctaLink: '/dashboard/kaizen',
    preview: <KaizenPreview />,
    reverse: false,
  },
  {
    id: 'benchmarking',
    label: 'Benchmarking & Scorecards',
    icon: 'ri-trophy-line',
    color: 'bg-yellow-600',
    badge: 'Performance',
    badgeColor: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    title: 'Know Exactly Where You Stand vs. Your Peers',
    description:
      'Compare every KPI against industry benchmarks from 2,400+ peer organizations. Scorecard views give leadership a traffic-light view of org health in seconds.',
    features: [
      { icon: 'ri-bar-chart-horizontal-line', text: 'Automated benchmarking against peer-group averages and top-quartile thresholds' },
      { icon: 'ri-traffic-light-line', text: 'Traffic-light KPI scorecards: Green/Yellow/Red status on every metric at a glance' },
      { icon: 'ri-award-line', text: 'Percentile ranking with gap analysis showing distance to top quartile per KPI' },
      { icon: 'ri-presentation-line', text: 'Export executive-ready scorecard reports in one click — PDF and PowerPoint' },
    ],
    ctaLabel: 'View Benchmarking',
    ctaLink: '/dashboard/benchmarking',
    preview: <BenchmarkingPreview />,
    reverse: true,
  },
];

export default function ProductTourPage() {
  const [activeId, setActiveId] = useState(MODULES[0].id);

  const handleScroll = useCallback(() => {
    for (let i = MODULES.length - 1; i >= 0; i--) {
      const el = document.getElementById(MODULES[i].id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 200) {
          setActiveId(MODULES[i].id);
          break;
        }
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleSidebarSelect = (id: string) => {
    setActiveId(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const activeIndex = MODULES.findIndex(m => m.id === activeId);

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Product Tour | SigmaSenseAI — Interactive Module Walkthrough"
        description="Explore all 10 modules of SigmaSenseAI — from AI-powered clinical intelligence and HIPAA-compliant PHI encryption to DMAIC project management, anomaly detection, and advanced forecasting."
        keywords="product tour, healthcare analytics demo, DMAIC software, clinical intelligence, HIPAA analytics platform"
        canonicalPath="/product-tour"
      />
      <Navigation />
      <TourHero totalModules={MODULES.length} activeIndex={activeIndex} />

      <div id="tour-modules" className="w-full px-6 lg:px-12 xl:px-16 2xl:px-24 py-16 flex gap-10 lg:gap-14">
        <TourSidebar
          modules={MODULES.map(m => ({ id: m.id, label: m.label, icon: m.icon, color: m.color }))}
          activeId={activeId}
          onSelect={handleSidebarSelect}
        />

        <main className="flex-1 min-w-0">
          {MODULES.map((mod) => (
            <ModuleSection
              key={mod.id}
              id={mod.id}
              badge={mod.badge}
              badgeColor={mod.badgeColor}
              title={mod.title}
              description={mod.description}
              features={mod.features}
              ctaLabel={mod.ctaLabel}
              ctaLink={mod.ctaLink}
              previewComponent={mod.preview}
              reverse={mod.reverse}
            />
          ))}
        </main>
      </div>

      {/* Mobile module nav strip */}
      <div className="lg:hidden sticky bottom-0 bg-white border-t border-gray-200 z-30 overflow-x-auto">
        <div className="flex gap-1 px-3 py-2">
          {MODULES.map((mod) => (
            <button
              key={mod.id}
              onClick={() => handleSidebarSelect(mod.id)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-center transition-all duration-200 cursor-pointer ${
                activeId === mod.id ? 'bg-teal-50 text-teal-700' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <i className={`${mod.icon} text-base`}></i>
              <span className="text-[9px] font-semibold whitespace-nowrap">{mod.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      <TourCTA />
      <Footer />
    </div>
  );
}
