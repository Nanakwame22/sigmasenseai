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
  metrics: 'bg-teal-100 text-teal-700',
  projects: 'bg-indigo-100 text-indigo-700',
  recommendations: 'bg-amber-100 text-amber-700',
  forecasts: 'bg-cyan-100 text-cyan-700',
  'root-cause': 'bg-orange-100 text-orange-700',
  general: 'bg-gray-100 text-gray-700',
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

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-green-600 bg-green-50';
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (stats.overallPerformance === 0 && stats.activeOpportunities === 0 && keyDrivers.length === 0) {
    return (
      <div className="bg-white rounded-xl p-12 border border-gray-200 text-center">
        <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="ri-bar-chart-box-line text-3xl text-teal-600"></i>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Data Available Yet</h3>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          Start by adding KPIs, metrics, and connecting data sources to see AI-powered insights and recommendations here.
        </p>
        <button
          onClick={() => window.REACT_APP_NAVIGATE?.('/dashboard/kpi-manager')}
          className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
        >
          Set Up KPIs
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Overall Performance */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-600">Overall Performance</span>
            <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
              <i className="ri-line-chart-line text-xl text-teal-600"></i>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">{stats.overallPerformance}%</span>
            {stats.overallPerformance >= 90 && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <i className="ri-arrow-up-line"></i>Excellent
              </span>
            )}
          </div>
          <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-teal-600 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(stats.overallPerformance, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Active Opportunities */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-600">Active Opportunities</span>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <i className="ri-lightbulb-flash-line text-xl text-blue-600"></i>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">{stats.activeOpportunities}</span>
            <span className="text-sm text-gray-500">pending</span>
          </div>
          <p className="text-sm text-gray-600 mt-2">Ready for implementation</p>
        </div>

        {/* Predicted Impact */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-600">Predicted Impact</span>
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <i className="ri-money-dollar-circle-line text-xl text-green-600"></i>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">
              ${stats.predictedImpact >= 1000000
                ? `${(stats.predictedImpact / 1000000).toFixed(1)}M`
                : `${(stats.predictedImpact / 1000).toFixed(0)}K`}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-2">Potential annual savings</p>
        </div>

        {/* Risk Level */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-600">Risk Level</span>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getRiskColor(stats.riskLevel)}`}>
              <i className="ri-alert-line text-xl"></i>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${getRiskColor(stats.riskLevel).split(' ')[0]}`}>
              {getRiskLabel(stats.riskLevel)}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-2">{stats.alertCount} active alerts</p>
        </div>
      </div>

      {/* AI Performance Narrative */}
      <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-xl p-6 border border-teal-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
            <i className="ri-robot-line text-2xl text-teal-600"></i>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Performance Summary</h3>
            <p className="text-gray-700 leading-relaxed">
              {stats.alertCount === 0 && stats.recommendationCount === 0
                ? 'Your system is being monitored. AI will generate insights as data becomes available.'
                : stats.alertCount > 0
                  ? `The AI has identified ${stats.alertCount} active alert${stats.alertCount !== 1 ? 's' : ''} requiring attention and generated ${stats.recommendationCount} recommendation${stats.recommendationCount !== 1 ? 's' : ''} to optimize performance. ${stats.riskLevel === 'critical' || stats.riskLevel === 'high' ? 'Immediate action is recommended for high-priority items.' : 'Continue monitoring key metrics and implementing suggested improvements.'}`
                  : `The AI has generated ${stats.recommendationCount} recommendation${stats.recommendationCount !== 1 ? 's' : ''} to help you achieve your performance targets. No critical alerts detected — your operations are running smoothly.`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Clinical Intelligence Panel ── */}
      <CPIClinicalPanel />

      {/* ── Recent Ask Sigma Queries ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
              <i className="ri-chat-voice-line text-lg text-white"></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Recent Ask Sigma Queries</h3>
              <p className="text-xs text-gray-500">Latest questions surfaced in the insights feed</p>
            </div>
          </div>
          <button
            onClick={() => window.REACT_APP_NAVIGATE?.('/aim')}
            className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            View all <i className="ri-arrow-right-s-line"></i>
          </button>
        </div>

        {queriesLoading ? (
          <div className="p-6 space-y-3">
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
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="ri-chat-3-line text-2xl text-teal-400"></i>
            </div>
            <p className="text-sm text-gray-600 mb-1 font-medium">No queries yet</p>
            <p className="text-xs text-gray-400">Run a query in <strong>Ask AIM</strong> — it will appear here instantly</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentQueries.map((qi) => (
              <div key={qi.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
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
      </div>

      {/* Key Drivers of Change */}
      {keyDrivers.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Drivers of Change</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {keyDrivers.map((driver) => (
              <div
                key={driver.id}
                className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className={`${getCategoryIcon(driver.category)} text-2xl text-teal-600`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-gray-900 mb-1 line-clamp-2">{driver.title}</h4>
                    <p className="text-sm text-gray-600 line-clamp-2">{driver.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-gray-500">AI Confidence:</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-teal-600 h-2 rounded-full" style={{ width: `${driver.confidence}%` }}></div>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{driver.confidence}%</span>
                </div>
                {driver.actions.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-gray-500">Recommended Actions:</span>
                    <ul className="space-y-1">
                      {driver.actions.slice(0, 2).map((action, idx) => (
                        <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                          <i className="ri-checkbox-circle-line text-teal-600 mt-0.5 flex-shrink-0"></i>
                          <span className="line-clamp-1">{action}</span>
                        </li>
                      ))}
                    </ul>
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