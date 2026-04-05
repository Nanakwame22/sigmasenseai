import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import CPIClinicalPanel from './CPIClinicalPanel';

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
  metrics: 'bg-ai-100 text-ai-700',
  projects: 'bg-sapphire-100 text-sapphire-700',
  recommendations: 'bg-amber-100 text-amber-700',
  forecasts: 'bg-ai-100 text-ai-700',
  'root-cause': 'bg-orange-100 text-orange-700',
  general: 'bg-brand-100 text-brand-700',
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

  useEffect(() => {
    const handler = () => loadRecentQueries();
    window.addEventListener('aim-insight-added', handler);
    return () => window.removeEventListener('aim-insight-added', handler);
  }, [loadRecentQueries]);

  const loadOverviewData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data: userOrg } = await supabase
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();

      const orgId = userOrg?.organization_id;

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

      const allPerformances: number[] = [];

      kpisRes.data?.forEach((kpi) => {
        if (kpi.target_value && kpi.target_value !== 0) {
          allPerformances.push(Math.min((kpi.current_value / kpi.target_value) * 100, 150));
        }
      });

      metricsRes.data?.forEach((metric) => {
        if (metric.target_value && metric.target_value !== 0) {
          allPerformances.push(Math.min((metric.current_value / metric.target_value) * 100, 150));
        }
      });

      const overallPerformance = allPerformances.length > 0
        ? Math.round(allPerformances.reduce((a, b) => a + b, 0) / allPerformances.length)
        : 0;

      const { data: opportunities } = await supabase
        .from('recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('status', ['pending', 'in_progress']);

      const activeOpportunities = opportunities || 0;

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

      const { data: allRecs } = await supabase
        .from('recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId);

      const recommendationCount = allRecs || 0;

      setStats({ overallPerformance, activeOpportunities, predictedImpact, riskLevel, alertCount, recommendationCount });

      const { data: topRecs } = await supabase
        .from('recommendations')
        .select('id, title, description, confidence_score, recommended_actions, category')
        .eq('organization_id', orgId)
        .in('status', ['pending', 'in_progress'])
        .order('impact_score', { ascending: false })
        .limit(4);

      setKeyDrivers(
        (topRecs || []).map((rec) => ({
          id: rec.id,
          title: rec.title || 'Untitled Recommendation',
          description: rec.description || 'No description available',
          confidence: rec.confidence_score || 0,
          actions: Array.isArray(rec.recommended_actions) ? rec.recommended_actions : [],
          category: rec.category || 'general',
        }))
      );
    } catch (error) {
      console.error('Error loading overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskConfig = (level: string) => {
    switch (level) {
      case 'critical': return { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: 'ri-error-warning-line', dot: 'bg-red-500' };
      case 'high':     return { text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', icon: 'ri-alert-line', dot: 'bg-orange-500' };
      case 'medium':   return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: 'ri-information-line', dot: 'bg-amber-500' };
      default:         return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'ri-shield-check-line', dot: 'bg-emerald-500' };
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'quality':    return 'ri-shield-check-line';
      case 'efficiency': return 'ri-speed-line';
      case 'cost':       return 'ri-money-dollar-circle-line';
      case 'customer':   return 'ri-user-heart-line';
      default:           return 'ri-lightbulb-line';
    }
  };

  const formatImpact = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value}`;
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Hero skeleton */}
        <div className="h-36 bg-brand-100 rounded-premium-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-premium p-6 border border-border animate-pulse shadow-elevation-1">
              <div className="h-3 bg-brand-100 rounded w-1/2 mb-4" />
              <div className="h-8 bg-brand-100 rounded w-2/3 mb-3" />
              <div className="h-2 bg-brand-100 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (stats.overallPerformance === 0 && stats.activeOpportunities === 0 && keyDrivers.length === 0) {
    return (
      <div className="bg-white rounded-premium-xl p-12 border border-border text-center shadow-elevation-2 animate-fade-in">
        <div className="w-16 h-16 bg-gradient-to-br from-ai-100 to-ai-200 rounded-premium-lg flex items-center justify-center mx-auto mb-4">
          <i className="ri-bar-chart-box-line text-3xl text-ai-600"></i>
        </div>
        <h3 className="text-xl font-semibold text-brand-900 mb-2">No Data Available Yet</h3>
        <p className="text-brand-500 mb-6 max-w-md mx-auto">
          Start by adding KPIs, metrics, and connecting data sources to see AI-powered insights here.
        </p>
        <button
          onClick={() => window.REACT_APP_NAVIGATE?.('/dashboard/kpi-manager')}
          className="px-6 py-2.5 bg-gradient-to-r from-ai-500 to-ai-600 text-white rounded-premium hover:from-ai-600 hover:to-ai-700 transition-all shadow-glow-sm whitespace-nowrap"
        >
          Set Up KPIs
        </button>
      </div>
    );
  }

  const riskConfig = getRiskConfig(stats.riskLevel);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden rounded-premium-xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-900 p-8 shadow-elevation-5">
        {/* Decorative glow */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-ai-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-sapphire-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-ai-400 uppercase tracking-widest">AIM Workspace</span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-ai-500/20 rounded-full">
                <span className="w-1.5 h-1.5 bg-ai-400 rounded-full animate-pulse" />
                <span className="text-xs text-ai-300 font-medium">Live Intelligence</span>
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-1">
              Actionable Intelligence<br />
              <span className="text-ai-400">Model</span>
            </h1>
            <p className="text-brand-300 text-sm mt-2 max-w-md">
              SigmaSense decision studio for anomalies, recommendations, and operational drivers.
            </p>
          </div>

          {/* KPI strip */}
          <div className="hidden lg:flex items-center gap-6">
            <div className="text-center">
              <div className="text-xs text-brand-400 uppercase tracking-wide mb-1">Recommendations</div>
              <div className="text-2xl font-bold text-white">{stats.recommendationCount}</div>
              <div className="text-xs text-brand-400">Open</div>
            </div>
            <div className="w-px h-10 bg-brand-700" />
            <div className="text-center">
              <div className="text-xs text-brand-400 uppercase tracking-wide mb-1">Tracked Work</div>
              <div className="text-2xl font-bold text-white">{stats.activeOpportunities}</div>
              <div className="text-xs text-brand-400">In progress</div>
            </div>
            <div className="w-px h-10 bg-brand-700" />
            <div className="text-center">
              <div className="text-xs text-brand-400 uppercase tracking-wide mb-1">Predictive Alerts</div>
              <div className="text-2xl font-bold text-white">{stats.alertCount}</div>
              <div className="text-xs text-brand-400">Awaiting review</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">

        {/* Overall Performance */}
        <div className="bg-white rounded-premium p-5 border border-border shadow-elevation-2 hover:shadow-elevation-3 transition-shadow group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Overall Performance</span>
            <div className="w-9 h-9 bg-gradient-to-br from-ai-50 to-ai-100 rounded-premium flex items-center justify-center group-hover:scale-110 transition-transform">
              <i className="ri-line-chart-line text-lg text-ai-600"></i>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-kpi-medium text-brand-900">{stats.overallPerformance}%</span>
            {stats.overallPerformance >= 90 && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-0.5">
                <i className="ri-arrow-up-line text-xs"></i>Excellent
              </span>
            )}
          </div>
          <div className="w-full bg-brand-100 rounded-full h-1.5">
            <div
              className="bg-gradient-to-r from-ai-400 to-ai-500 h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(stats.overallPerformance, 100)}%` }}
            />
          </div>
          <p className="text-xs text-brand-400 mt-2">vs. target baseline</p>
        </div>

        {/* Active Opportunities */}
        <div className="bg-white rounded-premium p-5 border border-border shadow-elevation-2 hover:shadow-elevation-3 transition-shadow group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Active Opportunities</span>
            <div className="w-9 h-9 bg-gradient-to-br from-sapphire-50 to-sapphire-100 rounded-premium flex items-center justify-center group-hover:scale-110 transition-transform">
              <i className="ri-lightbulb-flash-line text-lg text-sapphire-600"></i>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-kpi-medium text-brand-900">{stats.activeOpportunities}</span>
            <span className="text-xs text-brand-400 font-medium">pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-sapphire-400 rounded-full"></span>
            <p className="text-xs text-brand-400">Ready for implementation</p>
          </div>
        </div>

        {/* Predicted Impact */}
        <div className="bg-white rounded-premium p-5 border border-border shadow-elevation-2 hover:shadow-elevation-3 transition-shadow group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Predicted Impact</span>
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-premium flex items-center justify-center group-hover:scale-110 transition-transform">
              <i className="ri-money-dollar-circle-line text-lg text-emerald-600"></i>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-kpi-medium text-brand-900">{formatImpact(stats.predictedImpact)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
            <p className="text-xs text-brand-400">Potential annual savings</p>
          </div>
        </div>

        {/* Risk Level */}
        <div className={`rounded-premium p-5 border shadow-elevation-2 hover:shadow-elevation-3 transition-shadow group ${riskConfig.bg} ${riskConfig.border}`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Risk Level</span>
            <div className={`w-9 h-9 bg-white/60 rounded-premium flex items-center justify-center group-hover:scale-110 transition-transform`}>
              <i className={`${riskConfig.icon} text-lg ${riskConfig.text}`}></i>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-kpi-medium ${riskConfig.text} capitalize`}>{stats.riskLevel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 ${riskConfig.dot} rounded-full animate-pulse`}></span>
            <p className="text-xs text-brand-500">{stats.alertCount} active alert{stats.alertCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* ── AI Performance Narrative ── */}
      <div className="relative overflow-hidden bg-white rounded-premium-lg border border-border shadow-elevation-2 p-6">
        <div className="absolute inset-0 bg-gradient-to-r from-ai-50/60 via-transparent to-sapphire-50/40 pointer-events-none rounded-premium-lg" />
        <div className="relative flex items-start gap-4">
          <div className="w-11 h-11 bg-gradient-to-br from-ai-500 to-ai-600 rounded-premium flex items-center justify-center flex-shrink-0 shadow-glow-sm">
            <i className="ri-robot-line text-xl text-white"></i>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-base font-bold text-brand-900">AI Performance Summary</h3>
              <span className="px-2 py-0.5 bg-ai-100 text-ai-700 text-xs font-semibold rounded-full">Live</span>
            </div>
            <p className="text-brand-600 leading-relaxed text-sm">
              {stats.alertCount === 0 && stats.recommendationCount === 0
                ? 'Your system is being monitored. AI will generate insights as data becomes available.'
                : stats.alertCount > 0
                  ? `The AI has identified ${stats.alertCount} active alert${stats.alertCount !== 1 ? 's' : ''} requiring attention and generated ${stats.recommendationCount} recommendation${stats.recommendationCount !== 1 ? 's' : ''} to optimize performance. ${stats.riskLevel === 'critical' || stats.riskLevel === 'high' ? 'Immediate action is recommended for high-priority items.' : 'Continue monitoring key metrics and implementing suggested improvements.'}`
                  : `The AI has generated ${stats.recommendationCount} recommendation${stats.recommendationCount !== 1 ? 's' : ''} to help achieve your targets. No critical alerts detected — operations are running smoothly.`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Clinical Intelligence Panel ── */}
      <CPIClinicalPanel />

      {/* ── Recent Ask Sigma Queries ── */}
      <div className="bg-white rounded-premium-lg border border-border shadow-elevation-2 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-ai-500 to-ai-600 rounded-premium flex items-center justify-center shadow-glow-sm">
              <i className="ri-chat-voice-line text-base text-white"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-brand-900">Recent Ask Sigma Queries</h3>
              <p className="text-xs text-brand-400">Latest questions surfaced in the insights feed</p>
            </div>
          </div>
          <button
            onClick={() => window.REACT_APP_NAVIGATE?.('/aim')}
            className="text-xs text-ai-600 hover:text-ai-800 flex items-center gap-1 font-medium transition-colors whitespace-nowrap"
          >
            View all <i className="ri-arrow-right-s-line"></i>
          </button>
        </div>

        {queriesLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="w-8 h-8 bg-brand-100 rounded-premium flex-shrink-0"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-brand-100 rounded w-3/4"></div>
                  <div className="h-3 bg-brand-100 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : recentQueries.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 bg-ai-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="ri-chat-3-line text-2xl text-ai-400"></i>
            </div>
            <p className="text-sm text-brand-600 mb-1 font-medium">No queries yet</p>
            <p className="text-xs text-brand-400">Run a query in <strong>Ask AIM</strong> — it will appear here instantly</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentQueries.map((qi) => (
              <div key={qi.id} className="px-6 py-4 hover:bg-background transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-ai-50 rounded-premium flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className="ri-chat-1-line text-ai-600 text-sm"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${CATEGORY_COLORS[qi.category] ?? CATEGORY_COLORS.general}`}>
                        {qi.category}
                      </span>
                      <span className="text-xs text-brand-400">{qi.row_count} rows · {qi.visualization}</span>
                    </div>
                    <p className="text-sm text-brand-800 font-medium truncate italic">&ldquo;{qi.query_text}&rdquo;</p>
                    <p className="text-xs text-brand-400 mt-0.5 line-clamp-1">{qi.summary}</p>
                    <p className="text-xs text-brand-300 mt-1">
                      <i className="ri-time-line mr-1"></i>
                      {new Date(qi.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Key Drivers of Change ── */}
      {keyDrivers.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <h3 className="text-base font-bold text-brand-900">Key Drivers of Change</h3>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-brand-400">{keyDrivers.length} active</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {keyDrivers.map((driver) => (
              <div
                key={driver.id}
                className="bg-white rounded-premium p-5 border border-border shadow-elevation-1 hover:shadow-elevation-3 transition-all group"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-ai-50 to-ai-100 rounded-premium flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <i className={`${getCategoryIcon(driver.category)} text-xl text-ai-600`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-brand-900 mb-1 line-clamp-2">{driver.title}</h4>
                    <p className="text-xs text-brand-500 line-clamp-2 leading-relaxed">{driver.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-medium text-brand-400 whitespace-nowrap">AI Confidence</span>
                  <div className="flex-1 bg-brand-100 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-ai-400 to-ai-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${driver.confidence}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-brand-700 tabular-nums">{driver.confidence}%</span>
                </div>

                {driver.actions.length > 0 && (
                  <div className="space-y-1.5">
                    {driver.actions.slice(0, 2).map((action, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <i className="ri-checkbox-circle-line text-ai-500 mt-0.5 flex-shrink-0 text-sm"></i>
                        <span className="text-xs text-brand-600 line-clamp-1">{action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
