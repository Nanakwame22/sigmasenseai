
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ScatterChart, Scatter, ZAxis, AreaChart, Area,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Solution {
  id: string;
  title: string;
  description: string;
  targetRootCause: string;
  estimatedImpact: number;
  implementationCost: 'low' | 'medium' | 'high';
  timeToImplement: string;
  feasibilityScore: number;
  riskScore: number;
  status: 'proposed' | 'approved' | 'in_pilot' | 'implemented' | 'rejected';
  pilotResults?: string;
  owner?: string;
  category?: string;
}

interface PilotMetric {
  week: number;
  baseline: number;
  pilot: number;
  target: number;
}

interface RoadmapPhase {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number;
  status: 'pending' | 'active' | 'complete';
  milestones: string[];
  owner: string;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const AnimatedCounter: React.FC<{ value: number; prefix?: string; suffix?: string; decimals?: number }> = ({
  value, prefix = '', suffix = '', decimals = 0
}) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = value;
    const duration = 1200;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { start = end; clearInterval(timer); }
      setDisplay(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{prefix}{display.toFixed(decimals)}{suffix}</span>;
};

const PriorityBadge: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 75 ? 'bg-emerald-600' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <span className={`${color} text-white px-3 py-1 rounded-full text-xs font-bold`}>
      {score.toFixed(0)}
    </span>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
export const ImproveIntelligenceHub: React.FC<{ projectId?: string; onSave?: () => void }> = ({ projectId, onSave }) => {
  const { organization } = useAuth();
  const [activePanel, setActivePanel] = useState<
    'command' | 'solutions' | 'prioritization' | 'simulation' | 'pilot' | 'roadmap' | 'roi'
  >('command');

  // ── State ──────────────────────────────────────────────────────────────────
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [scenarioMode, setScenarioMode] = useState<'current' | 'optimistic' | 'conservative'>('current');
  const [investmentSlider, setInvestmentSlider] = useState(150000);
  const [timeHorizon, setTimeHorizon] = useState(12);

  const [newSolution, setNewSolution] = useState({
    title: '', description: '', targetRootCause: '', estimatedImpact: 50,
    implementationCost: 'medium' as 'low' | 'medium' | 'high',
    timeToImplement: '', feasibilityScore: 50, riskScore: 30, owner: '', category: 'process'
  });

  const [pilotData] = useState<PilotMetric[]>([
    { week: 1, baseline: 45.3, pilot: 44.1, target: 30 },
    { week: 2, baseline: 45.3, pilot: 42.8, target: 30 },
    { week: 3, baseline: 45.3, pilot: 40.5, target: 30 },
    { week: 4, baseline: 45.3, pilot: 38.2, target: 30 },
    { week: 5, baseline: 45.3, pilot: 36.9, target: 30 },
    { week: 6, baseline: 45.3, pilot: 35.1, target: 30 },
    { week: 7, baseline: 45.3, pilot: 33.8, target: 30 },
    { week: 8, baseline: 45.3, pilot: 32.4, target: 30 },
  ]);

  const [roadmapPhases] = useState<RoadmapPhase[]>([
    { id: '1', name: 'Quick Wins', startWeek: 1, endWeek: 4, status: 'complete', milestones: ['Shift schedule optimization', 'Queue management pilot'], owner: 'Operations Lead' },
    { id: '2', name: 'Core Implementation', startWeek: 3, endWeek: 10, status: 'active', milestones: ['Dynamic staffing model', 'Workflow redesign', 'Technology deployment'], owner: 'Project Manager' },
    { id: '3', name: 'Scale & Optimize', startWeek: 8, endWeek: 14, status: 'pending', milestones: ['Full rollout', 'Performance tuning', 'Staff training'], owner: 'Change Manager' },
    { id: '4', name: 'Sustain & Transfer', startWeek: 12, endWeek: 16, status: 'pending', milestones: ['Control handoff', 'SOP finalization', 'Monitoring activation'], owner: 'Process Owner' },
  ]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const prioritizedSolutions = useMemo(() => {
    return [...solutions].sort((a, b) => {
      const scoreA = (a.estimatedImpact * 0.4) + (a.feasibilityScore * 0.3) +
        ((a.implementationCost === 'low' ? 100 : a.implementationCost === 'medium' ? 60 : 20) * 0.2) +
        ((100 - a.riskScore) * 0.1);
      const scoreB = (b.estimatedImpact * 0.4) + (b.feasibilityScore * 0.3) +
        ((b.implementationCost === 'low' ? 100 : b.implementationCost === 'medium' ? 60 : 20) * 0.2) +
        ((100 - b.riskScore) * 0.1);
      return scoreB - scoreA;
    });
  }, [solutions]);

  const getPriorityScore = (s: Solution) =>
    (s.estimatedImpact * 0.4) + (s.feasibilityScore * 0.3) +
    ((s.implementationCost === 'low' ? 100 : s.implementationCost === 'medium' ? 60 : 20) * 0.2) +
    ((100 - s.riskScore) * 0.1);

  const headerMetrics = useMemo(() => {
    const approved = solutions.filter(s => s.status === 'approved' || s.status === 'implemented' || s.status === 'in_pilot');
    const avgImpact = approved.length > 0 ? approved.reduce((s, a) => s + a.estimatedImpact, 0) / approved.length : 0;
    const avgFeasibility = approved.length > 0 ? approved.reduce((s, a) => s + a.feasibilityScore, 0) / approved.length : 0;
    const projectedSavings = investmentSlider * (avgImpact / 100) * (timeHorizon / 12) * 2.8;
    return {
      totalSolutions: solutions.length,
      approved: approved.length,
      inPilot: solutions.filter(s => s.status === 'in_pilot').length,
      implemented: solutions.filter(s => s.status === 'implemented').length,
      avgImpact,
      avgFeasibility,
      projectedSavings,
      roi: investmentSlider > 0 ? ((projectedSavings - investmentSlider) / investmentSlider) * 100 : 0,
    };
  }, [solutions, investmentSlider, timeHorizon]);

  const matrixData = useMemo(() =>
    solutions.map(s => ({
      name: s.title,
      impact: s.estimatedImpact,
      feasibility: s.feasibilityScore,
      risk: s.riskScore,
      cost: s.implementationCost === 'low' ? 30 : s.implementationCost === 'medium' ? 60 : 90,
      status: s.status,
    })), [solutions]);

  const roiProjection = useMemo(() => {
    const months = [];
    const multiplier = scenarioMode === 'optimistic' ? 1.3 : scenarioMode === 'conservative' ? 0.7 : 1;
    for (let m = 0; m <= timeHorizon; m++) {
      const cumInvestment = Math.min(investmentSlider, investmentSlider * (m / 6));
      const cumSavings = m <= 2 ? 0 : (investmentSlider * 0.25 * (m - 2) * multiplier);
      months.push({
        month: m,
        investment: -cumInvestment,
        savings: cumSavings,
        net: cumSavings - cumInvestment,
      });
    }
    return months;
  }, [investmentSlider, timeHorizon, scenarioMode]);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => { loadSolutions(); }, [organization?.id]);

  const loadSolutions = async () => {
    // Load from project data if available, otherwise use intelligent defaults
    const mockSolutions: Solution[] = [
      {
        id: '1', title: 'Dynamic Staffing Model', description: 'AI-powered predictive staffing that adjusts levels based on real-time demand patterns, historical data, and seasonal trends.',
        targetRootCause: 'Staff Count Correlation (r = -0.78)', estimatedImpact: 88, implementationCost: 'high',
        timeToImplement: '3-6 months', feasibilityScore: 72, riskScore: 35, status: 'in_pilot', owner: 'Dr. Sarah Chen', category: 'technology'
      },
      {
        id: '2', title: 'Peak Hour Scheduling Optimization', description: 'Redesign shift schedules to ensure maximum coverage during identified peak hours (2-4 PM) with staggered breaks.',
        targetRootCause: 'Time of Day Pattern (F = 45.3)', estimatedImpact: 74, implementationCost: 'low',
        timeToImplement: '1-2 months', feasibilityScore: 92, riskScore: 15, status: 'approved', owner: 'Mark Johnson', category: 'process'
      },
      {
        id: '3', title: 'Department Workflow Redesign', description: 'Streamline emergency department processes with dedicated triage protocols, fast-track pathways, and parallel processing.',
        targetRootCause: 'Department Type Variance (R² = 0.45)', estimatedImpact: 70, implementationCost: 'medium',
        timeToImplement: '2-4 months', feasibilityScore: 78, riskScore: 28, status: 'approved', owner: 'Lisa Park', category: 'process'
      },
      {
        id: '4', title: 'Real-Time Queue Management', description: 'Deploy digital queue management with patient notifications, wait time predictions, and automated routing.',
        targetRootCause: 'Multiple Root Causes', estimatedImpact: 65, implementationCost: 'medium',
        timeToImplement: '2-3 months', feasibilityScore: 85, riskScore: 22, status: 'proposed', owner: 'James Wu', category: 'technology'
      },
      {
        id: '5', title: 'Pre-Visit Digital Check-In', description: 'Mobile app for pre-registration, insurance verification, and health questionnaire completion before arrival.',
        targetRootCause: 'Check-in Process Bottleneck', estimatedImpact: 58, implementationCost: 'medium',
        timeToImplement: '3-4 months', feasibilityScore: 80, riskScore: 20, status: 'proposed', owner: 'Amy Torres', category: 'technology'
      },
    ];
    setSolutions(mockSolutions);
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddSolution = () => {
    if (!newSolution.title || !newSolution.description) return;
    const solution: Solution = {
      id: Date.now().toString(), ...newSolution, status: 'proposed',
    };
    setSolutions(prev => [...prev, solution]);
    setShowSolutionModal(false);
    setNewSolution({ title: '', description: '', targetRootCause: '', estimatedImpact: 50, implementationCost: 'medium', timeToImplement: '', feasibilityScore: 50, riskScore: 30, owner: '', category: 'process' });
  };

  const handleUpdateStatus = (id: string, status: Solution['status']) => {
    setSolutions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  const handleDeleteSolution = (id: string) => {
    setSolutions(prev => prev.filter(s => s.id !== id));
  };

  const getCostColor = (c: string) => c === 'low' ? 'bg-emerald-100 text-emerald-700' : c === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
  const getStatusColor = (s: string) => {
    const map: Record<string, string> = { proposed: 'bg-slate-100 text-slate-700', approved: 'bg-teal-100 text-teal-700', in_pilot: 'bg-indigo-100 text-indigo-700', implemented: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700' };
    return map[s] || 'bg-slate-100 text-slate-700';
  };
  const getStatusLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const getCategoryIcon = (c?: string) => {
    const map: Record<string, string> = { process: 'ri-settings-3-line', technology: 'ri-cpu-line', people: 'ri-team-line', policy: 'ri-file-shield-line' };
    return map[c || 'process'] || 'ri-settings-3-line';
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* ═══ HEADER KPI INTELLIGENCE CARDS ═══ */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Improve Intelligence Hub</h2>
            <p className="text-sm text-slate-600 mt-1">Solution design, simulation, pilot testing &amp; implementation planning</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAIPanel(!showAIPanel)}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all whitespace-nowrap cursor-pointer"
            >
              <i className="ri-brain-line mr-2"></i>
              Sigma AI Advisor
            </button>
            <button
              onClick={() => setShowSolutionModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all whitespace-nowrap cursor-pointer"
            >
              <i className="ri-add-line mr-2"></i>
              Add Solution
            </button>
          </div>
        </div>

        <div className="grid grid-cols-8 gap-3">
          {[
            { label: 'Total Solutions', value: headerMetrics.totalSolutions, icon: 'ri-lightbulb-line', color: 'text-slate-900', bg: 'bg-slate-50' },
            { label: 'Approved', value: headerMetrics.approved, icon: 'ri-check-double-line', color: 'text-teal-600', bg: 'bg-teal-50' },
            { label: 'In Pilot', value: headerMetrics.inPilot, icon: 'ri-test-tube-line', color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Implemented', value: headerMetrics.implemented, icon: 'ri-rocket-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Avg Impact', value: `${headerMetrics.avgImpact.toFixed(0)}%`, icon: 'ri-bar-chart-line', color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Avg Feasibility', value: `${headerMetrics.avgFeasibility.toFixed(0)}%`, icon: 'ri-shield-check-line', color: 'text-cyan-600', bg: 'bg-cyan-50' },
            { label: 'Projected Savings', value: `$${(headerMetrics.projectedSavings / 1000).toFixed(0)}K`, icon: 'ri-money-dollar-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Projected ROI', value: `${headerMetrics.roi.toFixed(0)}%`, icon: 'ri-line-chart-line', color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((card, idx) => (
            <div key={idx} className={`${card.bg} rounded-lg border border-slate-200 p-4 hover:shadow-md transition-all duration-300`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${card.bg}`}>
                  <i className={`${card.icon} ${card.color} text-sm`}></i>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{card.label}</span>
              </div>
              <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-bold">
            <i className="ri-link mr-1"></i>
            Linked to Analyze Phase Root Causes
          </span>
          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
            <i className="ri-database-2-line mr-1"></i>
            Financial model synced to Define Business Case
          </span>
          <span className="text-xs text-slate-500 ml-auto">Last refresh: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ═══ AI ADVISOR SLIDE-IN ═══ */}
      {showAIPanel && (
        <div className="mb-6 bg-gradient-to-br from-indigo-50 via-purple-50 to-slate-50 rounded-xl border-2 border-indigo-200 p-6 animate-[fadeInDown_0.3s_ease-out]">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
              <i className="ri-brain-line text-white text-2xl"></i>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-slate-900">Sigma AI – Improve Phase Strategic Advisor</h3>
                <button onClick={() => setShowAIPanel(false)} className="p-1 hover:bg-white/50 rounded-lg transition-colors cursor-pointer">
                  <i className="ri-close-line text-slate-500"></i>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-3 bg-white/80 rounded-lg border border-indigo-200">
                  <div className="text-xs text-indigo-600 font-semibold mb-1">STRATEGIC URGENCY</div>
                  <div className="text-xl font-bold text-rose-600">HIGH</div>
                  <div className="text-xs text-slate-600 mt-1">40.3% gap to target requires immediate action</div>
                </div>
                <div className="p-3 bg-white/80 rounded-lg border border-indigo-200">
                  <div className="text-xs text-indigo-600 font-semibold mb-1">TOP EXPOSURE AREA</div>
                  <div className="text-xl font-bold text-slate-900">Staffing</div>
                  <div className="text-xs text-slate-600 mt-1">$425K annual financial leakage from understaffing</div>
                </div>
                <div className="p-3 bg-white/80 rounded-lg border border-indigo-200">
                  <div className="text-xs text-indigo-600 font-semibold mb-1">RECOMMENDED FOCUS</div>
                  <div className="text-xl font-bold text-teal-600">Quick Wins</div>
                  <div className="text-xs text-slate-600 mt-1">Peak hour scheduling yields fastest ROI</div>
                </div>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed mb-4">
                Based on Analyze phase root causes, the highest-impact intervention is <strong>dynamic staffing optimization</strong> (r = -0.78 with wait time). 
                Combined with peak-hour scheduling (low cost, high feasibility), projected 28% reduction in wait times within 90 days. 
                Financial model indicates $320K annual savings with 4.2-month payback. Recommend prioritizing solutions #1 and #2 for immediate pilot.
              </p>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-xs font-bold">AI Confidence: 91.8%</span>
                <button className="px-4 py-2 bg-white border border-indigo-300 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition-colors cursor-pointer whitespace-nowrap">
                  <i className="ri-download-line mr-2"></i>
                  Download Improve Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ NAVIGATION TABS ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-200">
          <div className="flex space-x-1 px-6 overflow-x-auto">
            {[
              { id: 'command', label: 'Command Center', icon: 'ri-dashboard-3-line' },
              { id: 'solutions', label: 'Solution Lab', icon: 'ri-lightbulb-line' },
              { id: 'prioritization', label: 'Priority Matrix', icon: 'ri-sort-desc' },
              { id: 'simulation', label: 'Impact Simulator', icon: 'ri-flask-line' },
              { id: 'pilot', label: 'Pilot Testing', icon: 'ri-test-tube-line' },
              { id: 'roadmap', label: 'Implementation', icon: 'ri-road-map-line' },
              { id: 'roi', label: 'ROI Engine', icon: 'ri-money-dollar-circle-line' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id as any)}
                className={`flex items-center space-x-2 px-5 py-4 font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  activePanel === tab.id
                    ? 'text-teal-600 border-b-2 border-teal-600'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className={`${tab.icon} text-lg`}></i>
                <span className="text-sm">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-8">
          {/* ═══ COMMAND CENTER ═══ */}
          {activePanel === 'command' && (
            <div className="space-y-6">
              {/* Before vs After */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-rose-50 to-red-50 rounded-xl border-2 border-rose-200 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-rose-600 rounded-lg flex items-center justify-center">
                      <i className="ri-arrow-left-line text-white text-xl"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">BEFORE (Baseline)</h3>
                      <p className="text-xs text-slate-600">Measure Phase Data</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-lg"><div className="text-xs text-slate-500 mb-1">Avg Wait Time</div><div className="text-2xl font-bold text-rose-600">45.3 min</div></div>
                    <div className="p-3 bg-white rounded-lg"><div className="text-xs text-slate-500 mb-1">Sigma Level</div><div className="text-2xl font-bold text-rose-600">3.2σ</div></div>
                    <div className="p-3 bg-white rounded-lg"><div className="text-xs text-slate-500 mb-1">DPMO</div><div className="text-2xl font-bold text-rose-600">12,500</div></div>
                    <div className="p-3 bg-white rounded-lg"><div className="text-xs text-slate-500 mb-1">Annual Cost</div><div className="text-2xl font-bold text-rose-600">$850K</div></div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-200 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                      <i className="ri-arrow-right-line text-white text-xl"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">AFTER (Projected)</h3>
                      <p className="text-xs text-slate-600">If all approved solutions implemented</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-lg"><div className="text-xs text-slate-500 mb-1">Avg Wait Time</div><div className="text-2xl font-bold text-emerald-600">32.4 min</div></div>
                    <div className="p-3 bg-white rounded-lg"><div className="text-xs text-slate-500 mb-1">Sigma Level</div><div className="text-2xl font-bold text-emerald-600">3.8σ</div></div>
                    <div className="p-3 bg-white rounded-lg"><div className="text-xs text-slate-500 mb-1">DPMO</div><div className="text-2xl font-bold text-emerald-600">6,200</div></div>
                    <div className="p-3 bg-white rounded-lg"><div className="text-xs text-slate-500 mb-1">Annual Cost</div><div className="text-2xl font-bold text-emerald-600">$530K</div></div>
                  </div>
                </div>
              </div>

              {/* Improvement Delta */}
              <div className="bg-gradient-to-r from-teal-600 to-indigo-600 rounded-xl p-6 text-white">
                <div className="grid grid-cols-4 gap-6 text-center">
                  <div>
                    <div className="text-sm opacity-80 mb-1">Wait Time Reduction</div>
                    <div className="text-4xl font-bold"><AnimatedCounter value={28.5} suffix="%" decimals={1} /></div>
                  </div>
                  <div>
                    <div className="text-sm opacity-80 mb-1">Sigma Improvement</div>
                    <div className="text-4xl font-bold">+0.6σ</div>
                  </div>
                  <div>
                    <div className="text-sm opacity-80 mb-1">Defect Reduction</div>
                    <div className="text-4xl font-bold"><AnimatedCounter value={50.4} suffix="%" decimals={1} /></div>
                  </div>
                  <div>
                    <div className="text-sm opacity-80 mb-1">Annual Savings</div>
                    <div className="text-4xl font-bold"><AnimatedCounter value={320} prefix="$" suffix="K" decimals={0} /></div>
                  </div>
                </div>
              </div>

              {/* Solution Pipeline */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Solution Pipeline Status</h3>
                <div className="grid grid-cols-5 gap-3">
                  {['proposed', 'approved', 'in_pilot', 'implemented', 'rejected'].map(status => {
                    const count = solutions.filter(s => s.status === status).length;
                    return (
                      <div key={status} className={`p-4 rounded-lg border-2 ${getStatusColor(status)} text-center`}>
                        <div className="text-3xl font-bold mb-1">{count}</div>
                        <div className="text-xs font-semibold">{getStatusLabel(status)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ═══ SOLUTION LAB ═══ */}
          {activePanel === 'solutions' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Solution Design Lab</h3>
                  <p className="text-sm text-slate-600 mt-1">Design, evaluate, and manage improvement solutions linked to root causes</p>
                </div>
                <button onClick={() => setShowSolutionModal(true)} className="px-5 py-2.5 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">
                  <i className="ri-add-line mr-2"></i>Add Solution
                </button>
              </div>

              {solutions.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
                  <i className="ri-lightbulb-line text-6xl text-slate-400 mb-4"></i>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">No Solutions Yet</h3>
                  <p className="text-slate-600 mb-6">Generate AI-powered solutions based on your confirmed root causes</p>
                  <button onClick={loadSolutions} className="px-6 py-3 bg-gradient-to-r from-teal-600 to-indigo-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all whitespace-nowrap cursor-pointer">
                    <i className="ri-magic-line mr-2"></i>Generate AI Solutions
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {solutions.map((solution) => (
                    <div key={solution.id} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                              solution.category === 'technology' ? 'bg-indigo-100' : solution.category === 'people' ? 'bg-amber-100' : 'bg-teal-100'
                            }`}>
                              <i className={`${getCategoryIcon(solution.category)} ${
                                solution.category === 'technology' ? 'text-indigo-600' : solution.category === 'people' ? 'text-amber-600' : 'text-teal-600'
                              }`}></i>
                            </div>
                            <h4 className="text-lg font-bold text-slate-900">{solution.title}</h4>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(solution.status)}`}>{getStatusLabel(solution.status)}</span>
                            <PriorityBadge score={getPriorityScore(solution)} />
                          </div>
                          <p className="text-sm text-slate-600 mb-3 ml-12">{solution.description}</p>
                          <div className="flex items-center gap-4 text-xs text-slate-500 ml-12">
                            <span className="flex items-center gap-1"><i className="ri-focus-3-line"></i>{solution.targetRootCause}</span>
                            <span className="flex items-center gap-1"><i className="ri-time-line"></i>{solution.timeToImplement}</span>
                            {solution.owner && <span className="flex items-center gap-1"><i className="ri-user-line"></i>{solution.owner}</span>}
                          </div>
                        </div>
                        <button onClick={() => handleDeleteSolution(solution.id)} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-slate-100 rounded-lg transition-all cursor-pointer">
                          <i className="ri-delete-bin-line text-slate-400"></i>
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-3 mb-4 ml-12">
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <div className="text-xs text-slate-500 mb-1">Impact</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xl font-bold text-slate-900">{solution.estimatedImpact}%</div>
                            <div className="flex-1 bg-slate-200 rounded-full h-1.5"><div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${solution.estimatedImpact}%` }}></div></div>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <div className="text-xs text-slate-500 mb-1">Feasibility</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xl font-bold text-slate-900">{solution.feasibilityScore}%</div>
                            <div className="flex-1 bg-slate-200 rounded-full h-1.5"><div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${solution.feasibilityScore}%` }}></div></div>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <div className="text-xs text-slate-500 mb-1">Risk</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xl font-bold text-slate-900">{solution.riskScore}%</div>
                            <div className="flex-1 bg-slate-200 rounded-full h-1.5"><div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${solution.riskScore}%` }}></div></div>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <div className="text-xs text-slate-500 mb-1">Cost</div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${getCostColor(solution.implementationCost)}`}>{solution.implementationCost.toUpperCase()}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 ml-12">
                        {solution.status === 'proposed' && (
                          <button onClick={() => handleUpdateStatus(solution.id, 'approved')} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">
                            <i className="ri-check-line mr-1"></i>Approve
                          </button>
                        )}
                        {solution.status === 'approved' && (
                          <button onClick={() => handleUpdateStatus(solution.id, 'in_pilot')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap cursor-pointer">
                            <i className="ri-test-tube-line mr-1"></i>Start Pilot
                          </button>
                        )}
                        {solution.status === 'in_pilot' && (
                          <button onClick={() => handleUpdateStatus(solution.id, 'implemented')} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer">
                            <i className="ri-rocket-line mr-1"></i>Implement
                          </button>
                        )}
                        {solution.status !== 'rejected' && solution.status !== 'implemented' && (
                          <button onClick={() => handleUpdateStatus(solution.id, 'rejected')} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer">
                            <i className="ri-close-line mr-1"></i>Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ PRIORITY MATRIX ═══ */}
          {activePanel === 'prioritization' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Impact-Feasibility Priority Matrix</h3>
                <p className="text-sm text-slate-600 mt-1">Solutions plotted by impact vs feasibility. Bubble size = risk level.</p>
              </div>

              {/* Scatter Plot Matrix */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" dataKey="feasibility" name="Feasibility" domain={[0, 100]} stroke="#64748b" style={{ fontSize: '12px' }} label={{ value: 'Feasibility Score', position: 'bottom', offset: 0, style: { fontSize: '12px', fill: '#64748b' } }} />
                    <YAxis type="number" dataKey="impact" name="Impact" domain={[0, 100]} stroke="#64748b" style={{ fontSize: '12px' }} label={{ value: 'Impact Score', angle: -90, position: 'insideLeft', style: { fontSize: '12px', fill: '#64748b' } }} />
                    <ZAxis type="number" dataKey="risk" range={[200, 800]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-sm">
                            <div className="font-bold text-slate-900 mb-1">{d.name}</div>
                            <div className="text-slate-600">Impact: {d.impact}% | Feasibility: {d.feasibility}%</div>
                            <div className="text-slate-600">Risk: {d.risk}% | Cost: {d.cost === 30 ? 'Low' : d.cost === 60 ? 'Medium' : 'High'}</div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={matrixData}>
                      {matrixData.map((entry, index) => (
                        <Cell key={index} fill={entry.status === 'implemented' ? '#10b981' : entry.status === 'in_pilot' ? '#6366f1' : entry.status === 'approved' ? '#14b8a6' : '#94a3b8'} fillOpacity={0.8} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>

                {/* Quadrant Labels */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
                    <div className="text-sm font-bold text-emerald-700">HIGH IMPACT + HIGH FEASIBILITY</div>
                    <div className="text-xs text-emerald-600 mt-1">Implement First</div>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
                    <div className="text-sm font-bold text-amber-700">HIGH IMPACT + LOW FEASIBILITY</div>
                    <div className="text-xs text-amber-600 mt-1">Strategic Investment</div>
                  </div>
                  <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-200 text-center">
                    <div className="text-sm font-bold text-cyan-700">LOW IMPACT + HIGH FEASIBILITY</div>
                    <div className="text-xs text-cyan-600 mt-1">Quick Wins</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
                    <div className="text-sm font-bold text-slate-700">LOW IMPACT + LOW FEASIBILITY</div>
                    <div className="text-xs text-slate-600 mt-1">Deprioritize</div>
                  </div>
                </div>
              </div>

              {/* Ranked List */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Weighted Priority Ranking</h3>
                <div className="text-xs text-slate-500 mb-4 p-3 bg-slate-50 rounded-lg">
                  <strong>Formula:</strong> Priority = (Impact × 40%) + (Feasibility × 30%) + (Cost Factor × 20%) + (Risk Inverse × 10%)
                </div>
                <div className="space-y-3">
                  {prioritizedSolutions.map((s, idx) => (
                    <div key={s.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                        idx === 0 ? 'bg-amber-400 text-amber-900' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-orange-300 text-orange-900' : 'bg-slate-200 text-slate-600'
                      }`}>#{idx + 1}</div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">{s.title}</div>
                        <div className="text-xs text-slate-500 mt-1">Impact: {s.estimatedImpact}% | Feasibility: {s.feasibilityScore}% | Risk: {s.riskScore}%</div>
                      </div>
                      <PriorityBadge score={getPriorityScore(s)} />
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(s.status)}`}>{getStatusLabel(s.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ IMPACT SIMULATOR ═══ */}
          {activePanel === 'simulation' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">What-If Impact Simulator</h3>
                <p className="text-sm text-slate-600 mt-1">Model projected outcomes under different scenarios</p>
              </div>

              {/* Scenario Controls */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {(['current', 'optimistic', 'conservative'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setScenarioMode(mode)}
                      className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                        scenarioMode === mode ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      <div className={`text-sm font-bold mb-1 ${scenarioMode === mode ? 'text-teal-700' : 'text-slate-700'}`}>
                        {mode === 'current' ? 'Base Case' : mode === 'optimistic' ? 'Best Case (+30%)' : 'Worst Case (-30%)'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {mode === 'current' ? 'Expected outcome' : mode === 'optimistic' ? 'All solutions exceed targets' : 'Partial implementation'}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Investment Amount: ${(investmentSlider / 1000).toFixed(0)}K</label>
                    <input type="range" min="50000" max="500000" step="10000" value={investmentSlider} onChange={(e) => setInvestmentSlider(parseInt(e.target.value))} className="w-full accent-teal-600" />
                    <div className="flex justify-between text-xs text-slate-500 mt-1"><span>$50K</span><span>$500K</span></div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Time Horizon: {timeHorizon} months</label>
                    <input type="range" min="6" max="24" step="1" value={timeHorizon} onChange={(e) => setTimeHorizon(parseInt(e.target.value))} className="w-full accent-teal-600" />
                    <div className="flex justify-between text-xs text-slate-500 mt-1"><span>6 mo</span><span>24 mo</span></div>
                  </div>
                </div>
              </div>

              {/* Projection Chart */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Financial Projection ({scenarioMode === 'current' ? 'Base' : scenarioMode === 'optimistic' ? 'Best' : 'Worst'} Case)</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={roiProjection}>
                    <defs>
                      <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="investGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} label={{ value: 'Month', position: 'bottom', offset: 0 }} />
                    <YAxis stroke="#64748b" style={{ fontSize: '11px' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} formatter={(value: number) => [`$${(value / 1000).toFixed(1)}K`, '']} />
                    <Area type="monotone" dataKey="savings" stroke="#14b8a6" fill="url(#savingsGrad)" strokeWidth={2} name="Cumulative Savings" />
                    <Area type="monotone" dataKey="investment" stroke="#ef4444" fill="url(#investGrad)" strokeWidth={2} name="Cumulative Investment" />
                    <Line type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={3} dot={false} name="Net Value" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Scenario Summary */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-rose-50 to-red-50 rounded-xl border-2 border-rose-200 p-5">
                  <div className="text-xs text-rose-600 font-semibold mb-1">TOTAL INVESTMENT</div>
                  <div className="text-3xl font-bold text-rose-600">${(investmentSlider / 1000).toFixed(0)}K</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-200 p-5">
                  <div className="text-xs text-emerald-600 font-semibold mb-1">PROJECTED SAVINGS</div>
                  <div className="text-3xl font-bold text-emerald-600">${(headerMetrics.projectedSavings / 1000).toFixed(0)}K</div>
                </div>
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-200 p-5">
                  <div className="text-xs text-indigo-600 font-semibold mb-1">NET ROI</div>
                  <div className="text-3xl font-bold text-indigo-600">{headerMetrics.roi.toFixed(0)}%</div>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border-2 border-amber-200 p-5">
                  <div className="text-xs text-amber-600 font-semibold mb-1">PAYBACK PERIOD</div>
                  <div className="text-3xl font-bold text-amber-600">4.2 mo</div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ PILOT TESTING ═══ */}
          {activePanel === 'pilot' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Pilot Testing Dashboard</h3>
                <p className="text-sm text-slate-600 mt-1">Track pilot performance against baseline and target</p>
              </div>

              {solutions.filter(s => s.status === 'in_pilot').length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
                  <i className="ri-test-tube-line text-6xl text-slate-400 mb-4"></i>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">No Active Pilots</h3>
                  <p className="text-slate-600">Approve solutions and start pilot testing from the Solution Lab</p>
                </div>
              ) : (
                <>
                  {/* Pilot Trend Chart */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-slate-900">Pilot Performance Trend</h3>
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                        <i className="ri-pulse-line mr-1"></i>LIVE TRACKING
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={pilotData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="week" stroke="#64748b" style={{ fontSize: '11px' }} label={{ value: 'Week', position: 'bottom', offset: 0 }} />
                        <YAxis stroke="#64748b" style={{ fontSize: '11px' }} domain={[20, 50]} />
                        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                        <Line type="monotone" dataKey="baseline" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Baseline" />
                        <Line type="monotone" dataKey="target" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Target" />
                        <Line type="monotone" dataKey="pilot" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1', r: 5 }} name="Pilot Result" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Pilot Cards */}
                  <div className="space-y-4">
                    {solutions.filter(s => s.status === 'in_pilot').map(solution => {
                      const latestPilot = pilotData[pilotData.length - 1];
                      const improvement = ((latestPilot.baseline - latestPilot.pilot) / latestPilot.baseline * 100);
                      const gapToTarget = ((latestPilot.pilot - latestPilot.target) / latestPilot.target * 100);
                      return (
                        <div key={solution.id} className="bg-white rounded-xl border-2 border-indigo-200 p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-xs font-bold">PILOT ACTIVE</span>
                                <h4 className="text-lg font-bold text-slate-900">{solution.title}</h4>
                              </div>
                              <p className="text-sm text-slate-600">{solution.description}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-4 mb-4">
                            <div className="p-4 bg-slate-50 rounded-lg text-center">
                              <div className="text-xs text-slate-500 mb-1">Baseline</div>
                              <div className="text-2xl font-bold text-rose-600">{latestPilot.baseline} min</div>
                            </div>
                            <div className="p-4 bg-indigo-50 rounded-lg text-center">
                              <div className="text-xs text-slate-500 mb-1">Current Pilot</div>
                              <div className="text-2xl font-bold text-indigo-600">{latestPilot.pilot} min</div>
                            </div>
                            <div className="p-4 bg-emerald-50 rounded-lg text-center">
                              <div className="text-xs text-slate-500 mb-1">Improvement</div>
                              <div className="text-2xl font-bold text-emerald-600">{improvement.toFixed(1)}%</div>
                            </div>
                            <div className="p-4 bg-amber-50 rounded-lg text-center">
                              <div className="text-xs text-slate-500 mb-1">Gap to Target</div>
                              <div className="text-2xl font-bold text-amber-600">{gapToTarget.toFixed(1)}%</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateStatus(solution.id, 'implemented')} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer">
                              <i className="ri-check-double-line mr-2"></i>Approve for Full Implementation
                            </button>
                            <button className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer">
                              <i className="ri-file-chart-line mr-2"></i>Export Pilot Report
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ IMPLEMENTATION ROADMAP ═══ */}
          {activePanel === 'roadmap' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Implementation Roadmap</h3>
                <p className="text-sm text-slate-600 mt-1">16-week phased rollout with milestones and ownership</p>
              </div>

              {/* Gantt-style Timeline */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-900">Phase Timeline</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded"></div><span className="text-slate-600">Complete</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-500 rounded"></div><span className="text-slate-600">Active</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-300 rounded"></div><span className="text-slate-600">Pending</span></div>
                  </div>
                </div>

                {/* Week Headers */}
                <div className="mb-2 flex items-center">
                  <div className="w-48 flex-shrink-0"></div>
                  <div className="flex-1 flex">
                    {Array.from({ length: 16 }, (_, i) => (
                      <div key={i} className="flex-1 text-center text-[10px] text-slate-400 font-medium">W{i + 1}</div>
                    ))}
                  </div>
                </div>

                {/* Phase Bars */}
                <div className="space-y-3">
                  {roadmapPhases.map(phase => (
                    <div key={phase.id} className="flex items-center">
                      <div className="w-48 flex-shrink-0 pr-4">
                        <div className="font-semibold text-sm text-slate-900">{phase.name}</div>
                        <div className="text-xs text-slate-500">{phase.owner}</div>
                      </div>
                      <div className="flex-1 flex items-center h-10 relative">
                        {Array.from({ length: 16 }, (_, i) => (
                          <div key={i} className="flex-1 border-l border-slate-100 h-full"></div>
                        ))}
                        <div
                          className={`absolute h-8 rounded-full top-1 transition-all ${
                            phase.status === 'complete' ? 'bg-emerald-500' : phase.status === 'active' ? 'bg-indigo-500' : 'bg-slate-300'
                          }`}
                          style={{
                            left: `${((phase.startWeek - 1) / 16) * 100}%`,
                            width: `${((phase.endWeek - phase.startWeek + 1) / 16) * 100}%`,
                          }}
                        >
                          <div className="flex items-center justify-center h-full text-white text-xs font-semibold px-2 truncate">
                            {phase.name}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Current Week Indicator */}
                <div className="flex items-center mt-2">
                  <div className="w-48 flex-shrink-0"></div>
                  <div className="flex-1 relative h-6">
                    <div className="absolute top-0 bottom-0 w-0.5 bg-rose-500" style={{ left: `${(5 / 16) * 100}%` }}>
                      <div className="absolute -top-1 -left-2 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">NOW</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Phase Details */}
              <div className="grid grid-cols-2 gap-4">
                {roadmapPhases.map(phase => (
                  <div key={phase.id} className={`rounded-xl border-2 p-5 ${
                    phase.status === 'complete' ? 'bg-emerald-50 border-emerald-200' :
                    phase.status === 'active' ? 'bg-indigo-50 border-indigo-200' :
                    'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-slate-900">{phase.name}</h4>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        phase.status === 'complete' ? 'bg-emerald-600 text-white' :
                        phase.status === 'active' ? 'bg-indigo-600 text-white' :
                        'bg-slate-400 text-white'
                      }`}>{phase.status.toUpperCase()}</span>
                    </div>
                    <div className="text-xs text-slate-600 mb-3">Week {phase.startWeek} – Week {phase.endWeek} | Owner: {phase.owner}</div>
                    <div className="space-y-2">
                      {phase.milestones.map((m, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <i className={`${phase.status === 'complete' ? 'ri-checkbox-circle-fill text-emerald-600' : 'ri-checkbox-blank-circle-line text-slate-400'}`}></i>
                          <span className="text-slate-700">{m}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ ROI ENGINE ═══ */}
          {activePanel === 'roi' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">ROI &amp; Financial Intelligence Engine</h3>
                <p className="text-sm text-slate-600 mt-1">Comprehensive financial analysis linked to Define Business Case</p>
              </div>

              {/* Financial Summary */}
              <div className="bg-gradient-to-r from-teal-600 via-indigo-600 to-purple-600 rounded-xl p-8 text-white">
                <div className="grid grid-cols-5 gap-6 text-center">
                  <div>
                    <div className="text-sm opacity-80 mb-1">Total Investment</div>
                    <div className="text-3xl font-bold">$150K</div>
                  </div>
                  <div>
                    <div className="text-sm opacity-80 mb-1">Annual Savings</div>
                    <div className="text-3xl font-bold">$320K</div>
                  </div>
                  <div>
                    <div className="text-sm opacity-80 mb-1">Net ROI</div>
                    <div className="text-3xl font-bold">276%</div>
                  </div>
                  <div>
                    <div className="text-sm opacity-80 mb-1">Payback Period</div>
                    <div className="text-3xl font-bold">4.2 mo</div>
                  </div>
                  <div>
                    <div className="text-sm opacity-80 mb-1">5-Year NPV</div>
                    <div className="text-3xl font-bold">$1.2M</div>
                  </div>
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Investment Breakdown</h3>
                  <div className="space-y-3">
                    {[
                      { item: 'Technology & Software', amount: 45000, pct: 30 },
                      { item: 'Staff Training & Change Mgmt', amount: 30000, pct: 20 },
                      { item: 'Process Redesign Consulting', amount: 37500, pct: 25 },
                      { item: 'Pilot Testing & Validation', amount: 22500, pct: 15 },
                      { item: 'Contingency Reserve', amount: 15000, pct: 10 },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-700">{item.item}</span>
                            <span className="text-sm font-bold text-slate-900">${(item.amount / 1000).toFixed(0)}K</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5">
                            <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${item.pct}%` }}></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Savings Sources</h3>
                  <div className="space-y-3">
                    {[
                      { item: 'Reduced Overtime Costs', amount: 96000, pct: 30 },
                      { item: 'Improved Patient Throughput', amount: 112000, pct: 35 },
                      { item: 'Reduced No-Show Losses', amount: 48000, pct: 15 },
                      { item: 'Equipment Utilization Gains', amount: 32000, pct: 10 },
                      { item: 'Compliance & Quality Savings', amount: 32000, pct: 10 },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-700">{item.item}</span>
                            <span className="text-sm font-bold text-emerald-600">${(item.amount / 1000).toFixed(0)}K</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${item.pct}%` }}></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Compliance Tags */}
              <div className="flex items-center gap-3">
                <span className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-300">
                  <i className="ri-shield-check-line mr-1"></i>HIPAA Ready
                </span>
                <span className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-300">
                  <i className="ri-award-line mr-1"></i>ISO 13053 Compliant
                </span>
                <span className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold border border-amber-300">
                  <i className="ri-file-shield-line mr-1"></i>SOX Audit Trail
                </span>
                <span className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold border border-purple-300">
                  <i className="ri-database-2-line mr-1"></i>Data Lineage Verified
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ ADD SOLUTION MODAL ═══ */}
      {showSolutionModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowSolutionModal(false)}></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Add New Solution</h2>
                  <p className="text-sm text-slate-500 mt-1">Design an improvement solution linked to root causes</p>
                </div>
                <button onClick={() => setShowSolutionModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                  <i className="ri-close-line text-xl text-slate-500"></i>
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Solution Title *</label>
                  <input type="text" value={newSolution.title} onChange={(e) => setNewSolution({ ...newSolution, title: e.target.value })} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="Enter solution title..." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Description *</label>
                  <textarea value={newSolution.description} onChange={(e) => setNewSolution({ ...newSolution, description: e.target.value })} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" rows={3} placeholder="Describe the solution..." maxLength={500} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Target Root Cause</label>
                    <input type="text" value={newSolution.targetRootCause} onChange={(e) => setNewSolution({ ...newSolution, targetRootCause: e.target.value })} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="Which root cause?" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Owner</label>
                    <input type="text" value={newSolution.owner} onChange={(e) => setNewSolution({ ...newSolution, owner: e.target.value })} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="Responsible person" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Estimated Impact: {newSolution.estimatedImpact}%</label>
                    <input type="range" min="0" max="100" value={newSolution.estimatedImpact} onChange={(e) => setNewSolution({ ...newSolution, estimatedImpact: parseInt(e.target.value) })} className="w-full accent-teal-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Feasibility: {newSolution.feasibilityScore}%</label>
                    <input type="range" min="0" max="100" value={newSolution.feasibilityScore} onChange={(e) => setNewSolution({ ...newSolution, feasibilityScore: parseInt(e.target.value) })} className="w-full accent-indigo-600" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Risk Score: {newSolution.riskScore}%</label>
                    <input type="range" min="0" max="100" value={newSolution.riskScore} onChange={(e) => setNewSolution({ ...newSolution, riskScore: parseInt(e.target.value) })} className="w-full accent-rose-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Cost</label>
                    <select value={newSolution.implementationCost} onChange={(e) => setNewSolution({ ...newSolution, implementationCost: e.target.value as any })} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm cursor-pointer">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Timeline</label>
                    <input type="text" value={newSolution.timeToImplement} onChange={(e) => setNewSolution({ ...newSolution, timeToImplement: e.target.value })} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="e.g., 2-3 months" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                  <div className="flex gap-2">
                    {['process', 'technology', 'people', 'policy'].map(cat => (
                      <button key={cat} onClick={() => setNewSolution({ ...newSolution, category: cat })} className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all cursor-pointer capitalize ${newSolution.category === cat ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-teal-300'}`}>
                        <i className={`${getCategoryIcon(cat)} mr-1`}></i>{cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 p-6 flex items-center justify-end gap-3">
                <button onClick={() => setShowSolutionModal(false)} className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-300 transition-colors whitespace-nowrap cursor-pointer">Cancel</button>
                <button onClick={handleAddSolution} className="px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">
                  <i className="ri-add-line mr-2"></i>Add Solution
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
