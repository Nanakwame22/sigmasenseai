import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import CPIClinicalPanel from './CPIClinicalPanel';
import { AIMEmptyState, AIMMetricTiles, AIMPanel, AIMSectionIntro } from './AIMSectionSystem';

interface OverviewStats {
  overallPerformance: number;
  activeOpportunities: number;
  predictedImpact: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  alertCount: number;
  recommendationCount: number;
}

interface KeyDriver {
  id: string;
  title: string;
  description: string;
  confidence: number;
  actions: string[];
  category: string;
}

interface QueryInsightPreview {
  id: string;
  query_text: string;
  summary: string;
  category: string;
  row_count: number;
  visualization: string;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  alerts: 'bg-red-100 text-red-700',
  metrics: 'bg-teal-100 text-teal-700',
  projects: 'bg-indigo-100 text-indigo-700',
  recommendations: 'bg-amber-100 text-amber-700',
  forecasts: 'bg-cyan-100 text-cyan-700',
  'root-cause': 'bg-orange-100 text-orange-700',
  general: 'bg-gray-100 text-gray-700',
};

const RISK_THEME: Record<string, { shell: string; icon: string; accent: string }> = {
  low: { shell: 'bg-emerald-50', icon: 'text-emerald-600', accent: 'text-emerald-600' },
  medium: { shell: 'bg-amber-50', icon: 'text-amber-600', accent: 'text-amber-600' },
  high: { shell: 'bg-orange-50', icon: 'text-orange-600', accent: 'text-orange-600' },
  critical: { shell: 'bg-red-50', icon: 'text-red-600', accent: 'text-red-600' },
};

export default function OverviewSection() {
  const { user } = useAuth();
  const [stats, setStats] = useState<OverviewStats>({
    overallPerformance: 0,
    activeOpportunities: 0,
    predictedImpact: 0,
    riskLevel: 'low',
    alertCount: 0,
    recommendationCount: 0,
  });
  const [keyDrivers, setKeyDrivers] = useState<KeyDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentQueries, setRecentQueries] = useState<QueryInsightPreview[]>([]);
  const [queriesLoading, setQueriesLoading] = useState(true);

  const loadRecentQueries = useCallback(async () => {
    if (!user) return;
    try {
      setQueriesLoading(true);
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const orgId = userOrg?.organization_id ?? user.id;

      const { data } = await supabase
        .from('aim_query_insights')
        .select('id, query_text, summary, category, row_count, visualization, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentQueries(data ?? []);
    } catch (err) {
      console.error('Error loading recent queries:', err);
    } finally {
      setQueriesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadOverviewData();
    loadRecentQueries();
  }, [user]);

  // Live refresh when a new query is saved from EnhancedQueryEngine
  useEffect(() => {
    const handler = () => loadRecentQueries();
    window.addEventListener('aim-insight-added', handler);
    return () => window.removeEventListener('aim-insight-added', handler);
  }, [loadRecentQueries]);

  const loadOverviewData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Get user's organization
      const { data: userOrg } = await supabase
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();

      const orgId = userOrg?.organization_id;

      // Load KPIs and Metrics performance scores
      const [kpisRes, metricsRes] = await Promise.all([
        supabase
          .from('kpis')
          .select('current_value, target_value')
          .eq('organization_id', orgId)
          .not('current_value', 'is', null)
          .not('target_value', 'is', null),
        supabase
          .from('metrics')
          .select('current_value, target_value')
          .eq('organization_id', orgId)
          .not('current_value', 'is', null)
          .not('target_value', 'is', null),
      ]);

      // Calculate overall performance
      const allPerformances: number[] = [];
      
      kpisRes.data?.forEach((kpi) => {
        if (kpi.target_value && kpi.target_value !== 0) {
          const perf = (kpi.current_value / kpi.target_value) * 100;
          allPerformances.push(Math.min(perf, 150)); // Cap at 150%
        }
      });

      metricsRes.data?.forEach((metric) => {
        if (metric.target_value && metric.target_value !== 0) {
          const perf = (metric.current_value / metric.target_value) * 100;
          allPerformances.push(Math.min(perf, 150));
        }
      });

      const overallPerformance = allPerformances.length > 0
        ? Math.round(allPerformances.reduce((a, b) => a + b, 0) / allPerformances.length)
        : 0;

      // Load active opportunities (pending/in_progress recommendations)
      const { data: opportunities } = await supabase
        .from('recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('status', ['pending', 'in_progress']);

      const activeOpportunities = opportunities || 0;

      // Compute predicted impact from recommendations and projects
      const [recsRes, projectsRes] = await Promise.all([
        supabase
          .from('recommendations')
          .select('impact_score')
          .eq('organization_id', orgId)
          .in('status', ['pending', 'in_progress']),
        supabase
          .from('dmaic_projects')
          .select('expected_savings')
          .eq('organization_id', orgId)
          .in('status', ['active', 'in_progress']),
      ]);

      const recsImpact = (recsRes.data || []).reduce((sum, r) => sum + (r.impact_score || 0) * 1000, 0);
      const projectsImpact = (projectsRes.data || []).reduce((sum, p) => sum + (p.expected_savings || 0), 0);
      const predictedImpact = Math.round(recsImpact + projectsImpact);

      // Derive risk level from alerts
      const { data: alerts } = await supabase
        .from('alerts')
        .select('severity')
        .eq('organization_id', orgId)
        .in('status', ['new', 'acknowledged']);

      const alertCount = alerts?.length || 0;
      const criticalCount = alerts?.filter((a) => a.severity === 'critical').length || 0;
      const highCount = alerts?.filter((a) => a.severity === 'high').length || 0;

      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (criticalCount > 0) riskLevel = 'critical';
      else if (highCount >= 3) riskLevel = 'high';
      else if (highCount > 0 || alertCount >= 5) riskLevel = 'medium';

      // Load recommendation count
      const { data: allRecs } = await supabase
        .from('recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId);

      const recommendationCount = allRecs || 0;

      setStats({
        overallPerformance,
        activeOpportunities,
        predictedImpact,
        riskLevel,
        alertCount,
        recommendationCount,
      });

      // Load top recommendations as key drivers
      const { data: topRecs } = await supabase
        .from('recommendations')
        .select('id, title, description, confidence_score, recommended_actions, category')
        .eq('organization_id', orgId)
        .in('status', ['pending', 'in_progress'])
        .order('impact_score', { ascending: false })
        .limit(4);

      const drivers: KeyDriver[] = (topRecs || []).map((rec) => ({
        id: rec.id,
        title: rec.title || 'Untitled Recommendation',
        description: rec.description || 'No description available',
        confidence: rec.confidence_score || 0,
        actions: Array.isArray(rec.recommended_actions) ? rec.recommended_actions : [],
        category: rec.category || 'general',
      }));

      setKeyDrivers(drivers);
    } catch (error) {
      console.error('Error loading overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskLabel = (level: string) => {
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'quality': return 'ri-shield-check-line';
      case 'efficiency': return 'ri-speed-line';
      case 'cost': return 'ri-money-dollar-circle-line';
      case 'customer': return 'ri-user-heart-line';
      default: return 'ri-lightbulb-line';
    }
  };

  const hasSignalData =
    stats.activeOpportunities > 0 ||
    stats.predictedImpact > 0 ||
    stats.alertCount > 0 ||
    stats.recommendationCount > 0 ||
    keyDrivers.length > 0 ||
    recentQueries.length > 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-[28px] border border-slate-200 bg-white p-6 animate-pulse shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (stats.overallPerformance === 0 && !hasSignalData) {
    return (
      <AIMEmptyState
        icon="ri-bar-chart-box-line"
        title="No overview data available yet"
        description="Start by adding KPIs, metrics, and connected data sources so AIM can surface performance, risk, and recommendation signals."
        action={
          <button
            onClick={() => window.REACT_APP_NAVIGATE?.('/dashboard/kpi-manager')}
            className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            Set Up KPIs
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <AIMSectionIntro
        eyebrow="Command Center"
        title="AIM Overview"
        description="See the operating picture, the strongest AI opportunities, and the newest intelligence activity in one executive briefing."
      />

      <AIMMetricTiles
        items={[
          {
            label: 'Overall Performance',
            value: `${stats.overallPerformance}%`,
            detail: stats.overallPerformance >= 90 ? 'Excellent alignment to target' : 'Blended KPI and metric attainment',
            accent: 'text-slate-950',
          },
          {
            label: 'Active Opportunities',
            value: stats.activeOpportunities,
            detail: 'Recommendations ready for action',
            accent: 'text-blue-600',
          },
          {
            label: 'Predicted Impact',
            value: stats.predictedImpact >= 1000000
              ? `$${(stats.predictedImpact / 1000000).toFixed(1)}M`
              : `$${(stats.predictedImpact / 1000).toFixed(0)}K`,
            detail: 'Modeled annual upside from current work',
            accent: 'text-emerald-600',
          },
          {
            label: 'Risk Level',
            value: getRiskLabel(stats.riskLevel),
            detail: `${stats.alertCount} active alerts under watch`,
            accent: RISK_THEME[stats.riskLevel]?.accent || 'text-slate-950',
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <AIMPanel
          title="AI Performance Summary"
          description="A concise interpretation of the current operating state, priority pressure, and opportunity volume."
          icon="ri-robot-line"
          accentClass="from-teal-500 to-cyan-600"
        >
          <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
            <div>
              <p className="text-gray-700 leading-7 text-[15px]">
                {stats.alertCount === 0 && stats.recommendationCount === 0 && stats.overallPerformance === 0
                  ? 'AIM is connected and monitoring live sources. KPI scoring is still filling in, but the workspace can already surface alerts, actions, and query history.'
                  : stats.alertCount === 0 && stats.recommendationCount === 0
                    ? 'Your system is being monitored. AI will generate deeper recommendations as more performance evidence becomes available.'
                  : stats.alertCount > 0
                    ? `The AI has identified ${stats.alertCount} active alert${stats.alertCount !== 1 ? 's' : ''} requiring attention and generated ${stats.recommendationCount} recommendation${stats.recommendationCount !== 1 ? 's' : ''} to optimize performance. ${stats.riskLevel === 'critical' || stats.riskLevel === 'high' ? 'Immediate action is recommended for high-priority items.' : 'Continue monitoring key metrics and implementing suggested improvements.'}`
                    : `The AI has generated ${stats.recommendationCount} recommendation${stats.recommendationCount !== 1 ? 's' : ''} to help you achieve your performance targets. No critical alerts detected — your operations are running smoothly.`}
              </p>
            </div>
            <div className={`rounded-[24px] border border-slate-200 ${RISK_THEME[stats.riskLevel]?.shell || 'bg-slate-50'} p-5`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Briefing Risk</div>
              <div className={`mt-3 text-3xl font-bold ${RISK_THEME[stats.riskLevel]?.accent || 'text-slate-900'}`}>
                {getRiskLabel(stats.riskLevel)}
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {stats.alertCount} active alert{stats.alertCount === 1 ? '' : 's'} under watch
              </div>
            </div>
          </div>
        </AIMPanel>

        {keyDrivers.length > 0 ? (
          <AIMPanel
            title="Key Drivers of Change"
            description="Top current drivers shaping risk, recommendations, and performance movement."
            icon="ri-radar-line"
            accentClass="from-violet-500 to-indigo-600"
          >
            <div className="space-y-4">
              {keyDrivers.slice(0, 3).map((driver) => (
                <div
                  key={driver.id}
                  className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 bg-teal-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <i className={`${getCategoryIcon(driver.category)} text-xl text-teal-600`}></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-base font-semibold text-slate-900">{driver.title}</h4>
                      <p className="mt-1 text-sm text-slate-600 line-clamp-2">{driver.description}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-500">AI confidence</span>
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600" style={{ width: `${driver.confidence}%` }}></div>
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{driver.confidence}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AIMPanel>
        ) : (
          <AIMPanel
            title="Signal Readiness"
            description="AIM already has enough signal to monitor alerts, actions, and recent activity even before a full KPI briefing is available."
            icon="ri-pulse-line"
            accentClass="from-violet-500 to-indigo-600"
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Alert coverage</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{stats.alertCount}</div>
                <p className="mt-2 text-sm text-slate-600">Current predictive or operational alerts already visible to AIM.</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recommendation load</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{stats.recommendationCount}</div>
                <p className="mt-2 text-sm text-slate-600">Recommendations or actions are already flowing into the workspace.</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recent queries</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{recentQueries.length}</div>
                <p className="mt-2 text-sm text-slate-600">Ask AIM activity is ready to populate the briefing as usage grows.</p>
              </div>
            </div>
          </AIMPanel>
        )}
      </div>

      {/* ── Clinical Intelligence Panel ── */}
      <CPIClinicalPanel />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <AIMPanel
          title="Recent Ask Sigma Queries"
          description="Latest natural-language questions surfaced in the insights feed."
          icon="ri-chat-voice-line"
          accentClass="from-teal-500 to-cyan-600"
          actions={
            <button
              onClick={() => window.REACT_APP_NAVIGATE?.('/dashboard/aim')}
              className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              View all <i className="ri-arrow-right-s-line"></i>
            </button>
          }
        >
          {queriesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-lg flex-shrink-0"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : recentQueries.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-chat-3-line text-2xl text-teal-400"></i>
              </div>
              <p className="text-sm text-gray-600 mb-1 font-medium">No queries yet</p>
              <p className="text-xs text-gray-400">Run a query in <strong>Ask AIM</strong> — it will appear here instantly</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentQueries.map((qi) => (
                <div key={qi.id} className="rounded-[24px] border border-slate-200 bg-white p-5 transition-colors hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="ri-chat-1-line text-teal-600 text-sm"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${CATEGORY_COLORS[qi.category] ?? CATEGORY_COLORS.general}`}>
                          {qi.category}
                        </span>
                        <span className="text-xs text-gray-400">{qi.row_count} rows · {qi.visualization}</span>
                      </div>
                      <p className="text-sm text-gray-800 font-medium truncate italic">&ldquo;{qi.query_text}&rdquo;</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{qi.summary}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        <i className="ri-time-line mr-1"></i>
                        {new Date(qi.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AIMPanel>

        <AIMPanel
          title="Signal Summary"
          description="A quick translation of what AIM sees most clearly right now."
          icon="ri-sparkling-2-line"
          accentClass="from-fuchsia-500 to-violet-600"
        >
          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Primary watch item</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {stats.riskLevel === 'critical' || stats.riskLevel === 'high'
                  ? 'Risk pressure is elevated and requires active response.'
                  : 'No severe operating pressure is dominating the current signal set.'}
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Opportunity posture</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {stats.activeOpportunities > 0
                  ? `${stats.activeOpportunities} action-ready opportunity${stats.activeOpportunities === 1 ? '' : 'ies'} are open.`
                  : 'No high-confidence action opportunities are currently open.'}
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Modeled impact</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {stats.predictedImpact > 0
                  ? `Current modeled upside is approximately $${(stats.predictedImpact / 1000).toFixed(0)}K annually.`
                  : 'Modeled impact will strengthen as more recommendations and projects accumulate.'}
              </div>
            </div>
          </div>
        </AIMPanel>
      </div>
    </div>
  );
}
