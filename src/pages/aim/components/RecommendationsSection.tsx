import { useState, useEffect } from 'react';
import { RecommendationsEngine } from '../../../services/recommendationsEngine';
import type { Recommendation } from '../../../services/recommendationsEngine';
import { useAuth } from '../../../contexts/AuthContext';
import { useAIMData } from '../../../hooks/useAIMData';
import { supabase } from '../../../lib/supabase';
import { addToast } from '../../../hooks/useToast';
import { AIMEmptyState, AIMMetricTiles, AIMPanel, AIMSectionIntro } from './AIMSectionSystem';
import {
  getIntelligenceConfidenceState,
} from '../../../services/intelligenceContract';
import { toRecommendationSignal } from '../../../services/intelligenceObjects';

// Track which recommendation IDs have already been pushed this session
const pushedSet = new Set<string>();

const categoryLineage: Record<string, string> = {
  performance: 'Metrics → Forecasts/targets → AIM recommendations',
  quality: 'Quality signals → anomalies/metrics → AIM recommendations',
  efficiency: 'Operational metrics → throughput/utilization logic → AIM recommendations',
  cost: 'Cost and capacity signals → value logic → AIM recommendations',
  risk: 'Alerts and volatility signals → risk logic → AIM recommendations',
};

function formatRelativeTime(timestamp?: string) {
  if (!timestamp) return 'Freshness pending';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just updated';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just updated';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function getRecommendationEvidence(rec: Recommendation) {
  const signal = toRecommendationSignal(rec);
  const evidence = [];
  if (signal.confidenceScore) evidence.push(`${signal.confidenceScore}% confidence`);
  if (signal.impactScore) evidence.push(`${signal.impactScore}% modeled impact`);
  if (signal.effortScore) evidence.push(`${signal.effortScore}% effort load`);
  if (signal.recommendedActions?.length) evidence.push(`${signal.recommendedActions.length} suggested actions`);
  return evidence.join(' • ');
}

function getRecommendationReadiness(rec: Recommendation) {
  const readiness = toRecommendationSignal(rec).evidence.decisionReadiness;

  if (readiness === 'Action-ready') {
    return { label: readiness, tone: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }
  if (readiness === 'Needs review') {
    return { label: readiness, tone: 'bg-amber-100 text-amber-700 border-amber-200' };
  }
  return { label: readiness, tone: 'bg-sky-100 text-sky-700 border-sky-200' };
}

function getRecommendationRationale(rec: Recommendation) {
  const impact = rec.impact_score || 0;
  const effort = rec.effort_score || 0;
  const confidence = rec.confidence_score || 0;
  const netAdvantage = impact - effort;

  const whyNow =
    impact >= 80
      ? 'AIM sees a high-value improvement opportunity with enough signal pressure to justify attention now.'
      : impact >= 60
        ? 'AIM sees a meaningful operating opportunity, but this should be sequenced against current team load.'
        : 'AIM is surfacing this as directional guidance while the likely upside continues to develop.';

  const tradeoff =
    effort >= 75
      ? 'Execution load is heavy. This move likely needs staffing cover, phased rollout, or explicit sponsorship.'
      : effort >= 50
        ? 'Execution load is moderate. Benefits look real, but timing and owner capacity matter.'
        : 'Execution load is relatively light. This is a candidate for quicker operational follow-through.';

  const decisionStance =
    confidence >= 80 && netAdvantage >= 15
      ? 'AIM leans toward execution because expected upside clearly outweighs the current effort burden.'
      : confidence >= 65
        ? 'AIM sees enough evidence to support a guided review before this moves into tracked work.'
        : 'AIM is not fully decision-ready yet. Use this as directional input while more evidence accumulates.';

  const nextBestMove =
    confidence >= 80 && impact >= 70
      ? 'Assign an owner, confirm timeline, and move the strongest actions into tracked execution.'
      : confidence >= 65
        ? 'Validate the local constraints, confirm the source signal still holds, and then decide whether to start.'
        : 'Keep this on the watchlist, collect another refresh cycle, and reassess once the evidence strengthens.';

  const missingEvidence =
    confidence >= 80
      ? 'Confidence is already strong; the main proof now is outcome capture after execution.'
      : confidence >= 65
        ? 'A stronger evidence base would come from another fresh metric cycle, related alert persistence, or early pilot results.'
        : 'AIM still needs fresher metric movement, stronger corroborating signals, or outcome history from similar work.';

  return { whyNow, tradeoff, decisionStance, nextBestMove, missingEvidence };
}

export default function RecommendationsSection() {
  const { user, organization } = useAuth();
  const aimStats = useAIMData();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');
  const [statistics, setStatistics] = useState<any>(null);
  const [watchSignals, setWatchSignals] = useState<Array<{
    id: string;
    title: string;
    severity: string;
    category: string;
    reason: string;
    freshness: string;
  }>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pushedIds, setPushedIds] = useState<Set<string>>(new Set());
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    show: boolean;
    type: 'start' | 'complete' | 'dismiss' | null;
    recommendation: Recommendation | null;
  }>({ show: false, type: null, recommendation: null });
  const [actionNotes, setActionNotes] = useState('');

  useEffect(() => {
    if (user) {
      loadOrganization();
    }
  }, [user, organization?.id]);

  useEffect(() => {
    if (user && organizationId !== undefined) {
      loadRecommendations();
      loadStatistics();
      loadWatchSignals();
    }
  }, [organizationId, selectedCategory, selectedPriority, selectedStatus, user]);

  const loadOrganization = async () => {
    if (!user) return;
    if (organization?.id) {
      setOrganizationId(organization.id);
      return;
    }

    const { data } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();
    setOrganizationId(data?.organization_id ?? null);
  };

  const loadRecommendations = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const engine = new RecommendationsEngine(user.id, organization?.id ?? organizationId ?? null);
      const filters: any = {};
      if (selectedStatus !== 'all') filters.status = selectedStatus;
      if (selectedCategory !== 'all') filters.category = selectedCategory;
      if (selectedPriority !== 'all') filters.priority = selectedPriority;
      const data = await engine.getRecommendations(filters);
      setRecommendations(data);

      // Check which ones are already in action_items (by source_recommendation_id tag)
      if (data.length > 0 && organizationId) {
        const { data: existing } = await supabase
          .from('action_items')
          .select('tags')
          .eq('organization_id', organizationId);
        if (existing) {
          const alreadyPushed = new Set<string>();
          existing.forEach((item: any) => {
            const tags: string[] = item.tags || [];
            tags.forEach((t) => {
              if (t.startsWith('rec:')) alreadyPushed.add(t.replace('rec:', ''));
            });
          });
          setPushedIds(alreadyPushed);
        }
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
      addToast('Failed to load recommendations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    if (!user) return;
    try {
      const engine = new RecommendationsEngine(user.id, organization?.id ?? organizationId ?? null);
      const stats = await engine.getStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const loadWatchSignals = async (orgOverride?: string | null) => {
    const activeOrgId = orgOverride ?? organization?.id ?? organizationId ?? null;
    if (!activeOrgId) {
      setWatchSignals([]);
      return [];
    }

    try {
      const { data } = await supabase
        .from('alerts')
        .select('id, title, severity, category, message, created_at, status')
        .eq('organization_id', activeOrgId)
        .in('status', ['new', 'acknowledged'])
        .order('created_at', { ascending: false })
        .limit(5);

      const signals = (data || []).map((alert: any) => ({
        id: alert.id,
        title: alert.title || 'Operational signal',
        severity: alert.severity || 'info',
        category: alert.category || 'risk',
        reason: alert.message || 'AIM is monitoring this alert, but it has not yet crossed the threshold for a formal recommendation.',
        freshness: formatRelativeTime(alert.created_at),
      }));
      setWatchSignals(signals);
      return signals;
    } catch (error) {
      console.error('Error loading watch signals:', error);
      setWatchSignals([]);
      return [];
    }
  };


  const handleGenerateRecommendations = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const activeOrgId = organization?.id ?? organizationId ?? null;
      const engine = new RecommendationsEngine(user.id, activeOrgId);
      const newRecs = await engine.generateRecommendations();
      if (newRecs.length > 0) {
        addToast(`Generated ${newRecs.length} new recommendations`, 'success');
        await loadRecommendations();
        await loadStatistics();
        await loadWatchSignals(activeOrgId);
      } else {
        const signals = await loadWatchSignals(activeOrgId);
        addToast(
          signals.length > 0
            ? 'No action-ready recommendations were generated. AIM surfaced active watch signals instead.'
            : activeOrgId
              ? 'No new recommendations found. Your system is performing well!'
              : 'AIM could not find an organization context for recommendation generation.',
          'info'
        );
      }
    } catch (error) {
      console.error('Error generating recommendations:', error);
      addToast('Failed to generate recommendations', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // ── Push to Action Tracker ──────────────────────────────────────────────────
  const handlePushToActionTracker = async (rec: Recommendation) => {
    if (!user || !organizationId) {
      addToast('Organization not found', 'error');
      return;
    }
    setPushingId(rec.id);
    try {
      // Map recommendation priority → action priority
      const priorityMap: Record<string, string> = {
        critical: 'critical',
        high: 'high',
        medium: 'medium',
        low: 'low',
      };

      // Build a due date 30 days from now as a sensible default
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const actionData = {
        organization_id: organizationId,
        created_by: user.id,
        title: rec.title,
        description: [
          rec.description,
          rec.expected_impact ? `\nExpected Impact: ${rec.expected_impact}` : '',
          rec.recommended_actions?.length
            ? `\nRecommended Actions:\n${rec.recommended_actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
            : '',
        ]
          .filter(Boolean)
          .join(''),
        priority: priorityMap[rec.priority] ?? 'medium',
        status: 'open',
        category: rec.category ?? 'AI Recommendation',
        due_date: dueDate.toISOString().split('T')[0],
        progress: 0,
        estimated_hours: 0,
        tags: [
          `rec:${rec.id}`,
          'ai-recommendation',
          'aim-source:recommendation',
          'aim-outcome:baseline_ready',
          'aim-verification:pending',
          rec.category ?? 'general',
        ],
        assigned_to: null,
      };

      const { error } = await supabase.from('action_items').insert([actionData]);
      if (error) throw error;

      setPushedIds((prev) => new Set([...prev, rec.id]));
      pushedSet.add(rec.id);
      addToast('Pushed to Action Tracker successfully!', 'success');
    } catch (error) {
      console.error('Error pushing to action tracker:', error);
      addToast('Failed to push to Action Tracker', 'error');
    } finally {
      setPushingId(null);
    }
  };
  // ───────────────────────────────────────────────────────────────────────────

  const handleStartRecommendation = (recommendation: Recommendation) => {
    setActionModal({ show: true, type: 'start', recommendation });
  };

  const handleCompleteRecommendation = (recommendation: Recommendation) => {
    setActionModal({ show: true, type: 'complete', recommendation });
  };

  const handleDismissRecommendation = (recommendation: Recommendation) => {
    setActionModal({ show: true, type: 'dismiss', recommendation });
  };

  const executeAction = async () => {
    if (!user || !actionModal.recommendation) return;
    try {
      const engine = new RecommendationsEngine(user.id, organization?.id ?? organizationId ?? null);
      const { type, recommendation } = actionModal;
      let success = false;

      if (type === 'start') {
        success = await engine.startRecommendation(recommendation.id, user.id);
        if (success) addToast('Recommendation started', 'success');
      } else if (type === 'complete') {
        if (!actionNotes.trim()) {
          addToast('Please provide results and notes', 'error');
          return;
        }
        success = await engine.completeRecommendation(recommendation.id, actionNotes, actionNotes);
        if (success) addToast('Recommendation completed', 'success');
      } else if (type === 'dismiss') {
        success = await engine.dismissRecommendation(recommendation.id, actionNotes || 'Dismissed by user');
        if (success) addToast('Recommendation dismissed', 'success');
      }

      if (success) {
        setActionModal({ show: false, type: null, recommendation: null });
        setActionNotes('');
        await loadRecommendations();
        await loadStatistics();
      } else {
        addToast('Failed to update recommendation', 'error');
      }
    } catch (error) {
      console.error('Error executing action:', error);
      addToast('An error occurred', 'error');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'performance': return 'ri-speed-up-line';
      case 'quality': return 'ri-shield-check-line';
      case 'efficiency': return 'ri-time-line';
      case 'cost': return 'ri-money-dollar-circle-line';
      case 'risk': return 'ri-alert-line';
      default: return 'ri-lightbulb-line';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-teal-600 bg-teal-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-gray-600 bg-gray-100';
      case 'in_progress': return 'text-teal-600 bg-teal-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'dismissed': return 'text-gray-400 bg-gray-50';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatStatus = (status: string) =>
    status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const getWatchSignalTone = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-50 text-red-700 border-red-200';
      case 'high': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'medium': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const readinessSummary = {
    watchSignals: watchSignals.length,
    needsReview: watchSignals.filter((signal) => signal.severity === 'critical' || signal.severity === 'high').length,
    evidenceCoverage: aimStats.evidenceSignals,
    recommendationState: aimStats.decisionReadiness,
  };

  return (
    <div className="space-y-6">
      <AIMSectionIntro
        eyebrow="Actionable Guidance"
        title="AI Recommendations"
        description="Prioritized improvement opportunities ranked by impact, effort, and execution confidence."
        actions={
          <button
            onClick={handleGenerateRecommendations}
            disabled={generating}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
          >
            <i className={`${generating ? 'ri-loader-4-line animate-spin' : 'ri-magic-line'}`}></i>
            {generating ? 'Analyzing...' : 'Generate Recommendations'}
          </button>
        }
      />

      {!loading && recommendations.length === 0 && watchSignals.length > 0 && (
        <AIMPanel
          title="Recommendation Readiness"
          description="AIM is seeing live signals, but none are strong enough yet to become a formal action-ready recommendation."
          icon="ri-radar-line"
          accentClass="from-amber-500 to-orange-600"
        >
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr),minmax(320px,0.8fr)]">
            <div className="space-y-4">
              <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,250,252,0.95))] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
                <div className="grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr)),minmax(220px,1.1fr)]">
                  {[
                    {
                      label: 'Watch Signals',
                      value: readinessSummary.watchSignals,
                      detail: 'Signals still below the action threshold.',
                      accent: 'text-slate-950',
                    },
                    {
                      label: 'Needs Review',
                      value: readinessSummary.needsReview,
                      detail: 'Higher-pressure signals to inspect first.',
                      accent: 'text-amber-600',
                    },
                    {
                      label: 'Evidence Coverage',
                      value: `${readinessSummary.evidenceCoverage}/5`,
                      detail: 'Live signal classes feeding readiness.',
                      accent: 'text-teal-600',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[20px] border border-slate-200/90 bg-white p-4"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
                      <div className={`mt-2 text-[1.65rem] leading-none font-bold tracking-tight ${item.accent}`}>{item.value}</div>
                      <p className="mt-2 text-[12px] leading-5 text-slate-600">{item.detail}</p>
                    </div>
                  ))}

                  <div className="rounded-[22px] border border-sky-200 bg-[linear-gradient(180deg,_rgba(240,249,255,0.92),_rgba(255,255,255,0.98))] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current State</div>
                    <div className="mt-2 text-[1.35rem] leading-tight font-bold tracking-tight text-sky-700">
                      {readinessSummary.recommendationState}
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-slate-600">
                      AIM can guide direction, but it is not yet action-ready.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.95),_rgba(255,255,255,0.98))] p-6 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Why no recommendation yet</div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                  AIM still needs a stronger combination of persistent signal pressure, fresh corroborating evidence, and clearer execution confidence
                  before it promotes a watch signal into a formal recommendation.
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Best next move: review the strongest watch signals below, validate whether the pressure is continuing, and then generate recommendations again
                  after the next refresh cycle.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Closest watch signals</div>
                  <p className="mt-1 text-sm text-slate-600">Signals closest to crossing into formal recommendation territory.</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {watchSignals.length} active
                </span>
              </div>
              {watchSignals.slice(0, 2).map((signal) => (
                <div key={signal.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold leading-6 text-slate-900">{signal.title}</h3>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getWatchSignalTone(signal.severity)}`}>
                      {signal.severity}
                    </span>
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-slate-600">{signal.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      Freshness: {signal.freshness}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      Closest to recommendation threshold
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AIMPanel>
      )}

      {/* Statistics Cards */}
      {statistics && (
        <AIMMetricTiles
          columns="grid-cols-1 md:grid-cols-2 xl:grid-cols-5"
          items={[
            { label: 'Open', value: statistics.open, color: 'text-gray-900' },
            { label: 'Pending', value: statistics.pending, color: 'text-gray-600' },
            { label: 'In Progress', value: statistics.inProgress, color: 'text-teal-600' },
            { label: 'Completed', value: statistics.completed, color: 'text-green-600' },
            { label: 'Avg Open Impact', value: `${statistics.avgImpactScore}%`, color: 'text-teal-600' },
          ].map((s) => ({ label: s.label, value: s.value, accent: s.color }))}
        />
      )}

      {/* Filters */}
      <AIMPanel
        title="Recommendation Filters"
        description="Focus the queue by status, category, and priority."
        icon="ri-equalizer-2-line"
        accentClass="from-slate-700 to-slate-900"
      >
        <div className="flex flex-wrap gap-4">
          {[
            {
              label: 'Status', value: selectedStatus, onChange: setSelectedStatus,
              options: [
                { v: 'all', l: 'All Statuses' }, { v: 'pending', l: 'Pending' },
                { v: 'in_progress', l: 'In Progress' }, { v: 'completed', l: 'Completed' },
                { v: 'dismissed', l: 'Dismissed' },
              ],
            },
            {
              label: 'Category', value: selectedCategory, onChange: setSelectedCategory,
              options: [
                { v: 'all', l: 'All Categories' }, { v: 'performance', l: 'Performance' },
                { v: 'quality', l: 'Quality' }, { v: 'efficiency', l: 'Efficiency' },
                { v: 'cost', l: 'Cost' }, { v: 'risk', l: 'Risk' },
              ],
            },
            {
              label: 'Priority', value: selectedPriority, onChange: setSelectedPriority,
              options: [
                { v: 'all', l: 'All Priorities' }, { v: 'critical', l: 'Critical' },
                { v: 'high', l: 'High' }, { v: 'medium', l: 'Medium' }, { v: 'low', l: 'Low' },
              ],
            },
          ].map((f) => (
            <div key={f.label} className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">{f.label}</label>
              <select
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              >
                {f.options.map((o) => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </AIMPanel>

      {/* Recommendations List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
            <p className="text-gray-600 mt-4">Loading recommendations...</p>
          </div>
        ) : recommendations.length === 0 ? (
          watchSignals.length > 0 ? (
            <AIMPanel
              title="Watchlist Signals"
              description="AIM found active signals to monitor, but none have crossed the threshold for a formal recommendation yet."
              icon="ri-radar-line"
              accentClass="from-amber-500 to-orange-600"
            >
              <div className="space-y-4">
                {watchSignals.map((signal) => (
                  <div key={signal.id} className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="text-base font-semibold text-slate-900">{signal.title}</h3>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getWatchSignalTone(signal.severity)}`}>
                            {signal.severity}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                            {signal.category}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">{signal.reason}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                            Freshness: {signal.freshness}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                            Watch only
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AIMPanel>
          ) : (
            <AIMEmptyState
              icon="ri-lightbulb-line"
              title="No recommendations available"
              description='Generate a fresh recommendation set to analyze your current operational data.'
            />
          )
        ) : (
          recommendations.map((rec) => {
            const signal = toRecommendationSignal(rec);
            const isPushed = pushedIds.has(rec.id);
            const isPushing = pushingId === rec.id;
            const readiness = getRecommendationReadiness(rec);
            const isExpanded = expandedId === rec.id;
            const rationale = getRecommendationRationale(rec);

            return (
              <div
                key={rec.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-lg ${getPriorityColor(rec.priority)} flex items-center justify-center flex-shrink-0`}>
                        <i className={`${getCategoryIcon(rec.category)} text-xl`}></i>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{rec.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                            {rec.priority.toUpperCase()}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(rec.status)}`}>
                            {formatStatus(rec.status)}
                          </span>
                          {isPushed && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                              <i className="ri-checkbox-circle-fill text-xs"></i>
                              In Action Tracker
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 mb-4">{rec.description}</p>

                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <i className="ri-flashlight-line text-teal-600"></i>
                            <span className="text-gray-600">Impact:</span>
                            <span className="font-semibold text-gray-900">{rec.impact_score}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <i className="ri-time-line text-gray-600"></i>
                            <span className="text-gray-600">Effort:</span>
                            <span className="font-semibold text-gray-900">{rec.effort_score}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <i className="ri-shield-check-line text-gray-600"></i>
                            <span className="text-gray-600">Confidence:</span>
                            <span className="font-semibold text-gray-900">{rec.confidence_score}%</span>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                              Freshness: {signal.evidence.freshnessLabel}
                            </span>
                            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${readiness.tone}`}>
                              {readiness.label}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                              Provenance: {signal.evidence.sourceLabel}
                            </span>
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              {isExpanded ? 'Hide evidence' : 'Open evidence'}
                            </button>
                          </div>
                          <p className="mt-2 text-[11px] leading-5 text-slate-500">
                            {getRecommendationEvidence(rec) || 'Confidence and action evidence will strengthen as AIM accumulates more live operational context.'}
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-slate-400">
                            Lineage: {categoryLineage[rec.category] || 'Operational signals → AIM recommendation engine'}
                          </p>
                        </div>

                        {isExpanded && (
                          <div className="mt-6 rounded-[24px] border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-5 space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${readiness.tone}`}>
                                Decision Readiness: {readiness.label}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                                Confidence basis: {signal.evidence.confidenceState} ({signal.confidenceScore}%)
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                                Effort load: {rec.effort_score || 0}%
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                                Provenance: {signal.evidence.sourceLabel}
                              </span>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-3">
                              <div className="rounded-2xl border border-white/70 bg-white/90 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Why AIM surfaced this</div>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  {signal.evidence.evidenceSummary}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/70 bg-white/90 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Evidence window</div>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  Latest signal refresh: {signal.evidence.freshnessLabel}. Stronger evidence appears as more recommendations, alerts, and tracked outcomes accumulate.
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/70 bg-white/90 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Operator guidance</div>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  {rationale.nextBestMove}
                                </p>
                              </div>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-3">
                              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Decision stance</div>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  {rationale.decisionStance}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Execution tradeoff</div>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  {rationale.tradeoff}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">What would strengthen this</div>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  {rationale.missingEvidence}
                                </p>
                              </div>
                            </div>
                            {rec.recommended_actions && rec.recommended_actions.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Recommended Actions:</h4>
                                <ol className="list-decimal list-inside space-y-1">
                                  {rec.recommended_actions.map((action, idx) => (
                                    <li key={idx} className="text-sm text-gray-600">{action}</li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            {rec.expected_impact && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Expected Impact:</h4>
                                <p className="text-sm text-gray-600">{rec.expected_impact}</p>
                              </div>
                            )}
                            {rec.actual_impact && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Actual Impact:</h4>
                                <p className="text-sm text-green-600">{rec.actual_impact}</p>
                              </div>
                            )}
                            {rec.implementation_notes && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Implementation Notes:</h4>
                                <p className="text-sm text-gray-600">{rec.implementation_notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {/* ── Push to Action Tracker ── */}
                      <button
                        onClick={() => !isPushed && handlePushToActionTracker(rec)}
                        disabled={isPushed || isPushing}
                        title={isPushed ? 'Already in Action Tracker' : 'Push to Action Tracker'}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                          isPushed
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : isPushing
                            ? 'bg-teal-100 text-teal-600 cursor-wait'
                            : 'bg-teal-600 text-white hover:bg-teal-700 cursor-pointer'
                        }`}
                      >
                        {isPushing ? (
                          <>
                            <i className="ri-loader-4-line animate-spin text-xs"></i>
                            Pushing...
                          </>
                        ) : isPushed ? (
                          <>
                            <i className="ri-checkbox-circle-fill text-xs"></i>
                            Pushed
                          </>
                        ) : (
                          <>
                            <i className="ri-send-plane-line text-xs"></i>
                            Push to Tracker
                          </>
                        )}
                      </button>

                      {rec.status === 'pending' && (
                        <button
                          onClick={() => handleStartRecommendation(rec)}
                          className="px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors text-sm whitespace-nowrap"
                        >
                          Start
                        </button>
                      )}
                      {rec.status === 'in_progress' && (
                        <button
                          onClick={() => handleCompleteRecommendation(rec)}
                          className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-sm whitespace-nowrap"
                        >
                          Complete
                        </button>
                      )}
                      {(rec.status === 'pending' || rec.status === 'in_progress') && (
                        <button
                          onClick={() => handleDismissRecommendation(rec)}
                          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
                        >
                          Dismiss
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                        className="px-4 py-2 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm whitespace-nowrap"
                      >
                        {expandedId === rec.id ? 'Less' : 'Details'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Action Modal */}
      {actionModal.show && actionModal.recommendation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {actionModal.type === 'start' && 'Start Recommendation'}
              {actionModal.type === 'complete' && 'Complete Recommendation'}
              {actionModal.type === 'dismiss' && 'Dismiss Recommendation'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">{actionModal.recommendation.title}</p>
            {(actionModal.type === 'complete' || actionModal.type === 'dismiss') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {actionModal.type === 'complete' ? 'Results & Notes' : 'Reason for Dismissal'}
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={4}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder={
                    actionModal.type === 'complete'
                      ? 'Describe the results and impact...'
                      : 'Why are you dismissing this recommendation?'
                  }
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={executeAction}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setActionModal({ show: false, type: null, recommendation: null });
                  setActionNotes('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
