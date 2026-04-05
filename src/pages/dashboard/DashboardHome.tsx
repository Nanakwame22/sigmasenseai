import { Link } from 'react-router-dom';
import { useDashboardData } from '../../hooks/useDashboardData';
import MetricTrendChart from './components/MetricTrendChart';
import KPIHealthGrid from './components/KPIHealthGrid';
import OperationalTrustPanel from '../../components/common/OperationalTrustPanel';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  iconBg: string;
  trend?: { value: string; up: boolean } | null;
  accent: string;
}

function StatCard({ title, value, subtitle, icon, iconBg, trend, accent }: StatCardProps) {
  return (
    <div className="bg-white rounded-premium border border-border shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-200 relative overflow-hidden group">
      <div className={`absolute top-0 left-0 w-1 h-full ${accent}`}></div>
      <div className="p-5 pl-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-bold text-brand-400 uppercase tracking-widest">{title}</p>
            <p className="text-kpi-medium text-brand-900 mt-1 tabular-nums leading-none">{value}</p>
            <p className="text-xs text-brand-400 mt-1.5">{subtitle}</p>
          </div>
          <div className={`w-10 h-10 ${iconBg} rounded-premium flex items-center justify-center shadow-elevation-1 group-hover:scale-105 transition-transform duration-200 flex-shrink-0`}>
            <i className={`${icon} text-white text-lg`}></i>
          </div>
        </div>
        {trend && (
          <div className={`mt-3 flex items-center gap-1.5 text-xs font-bold ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
            <i className={`${trend.up ? 'ri-arrow-up-line' : 'ri-arrow-down-line'} text-sm`}></i>
            <span>{trend.value}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatLastUpdated(date: Date) {
  const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function DashboardHome() {
  const { stats, loading, error, isRealtimeConnected, lastUpdated } = useDashboardData();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-ai-500 to-sapphire-600 rounded-premium-lg flex items-center justify-center shadow-glow-md">
            <i className="ri-loader-4-line text-white text-2xl animate-spin"></i>
          </div>
          <p className="text-brand-400 font-medium text-sm">Loading intelligence dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-premium-lg flex items-center justify-center border border-red-100">
            <i className="ri-error-warning-line text-red-500 text-2xl"></i>
          </div>
          <div>
            <p className="text-red-600 font-semibold">Failed to load dashboard</p>
            <p className="text-brand-400 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const avgPctVsTarget = stats.avgMetricValue > 0 ? (stats.avgMetricValue - 85) : 0;

  const dedupedRecentAlerts = stats.recentAlerts.reduce<Array<(typeof stats.recentAlerts[number]) & { repeatCount: number }>>((acc, alert) => {
    const key = `${alert.title.trim().toLowerCase()}::${alert.severity.toLowerCase()}::${alert.status.toLowerCase()}`;
    const existing = acc.find(
      (item) => `${item.title.trim().toLowerCase()}::${item.severity.toLowerCase()}::${item.status.toLowerCase()}` === key
    );
    if (existing) {
      existing.repeatCount += 1;
      if (new Date(alert.created_at).getTime() > new Date(existing.created_at).getTime()) {
        existing.created_at = alert.created_at;
        existing.id = alert.id;
      }
      return acc;
    }
    acc.push({ ...alert, repeatCount: 1 });
    return acc;
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-brand-900 tracking-tight">Operations Intelligence</h1>
            {isRealtimeConnected && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Live</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-brand-400 text-xs mt-1">
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <i className="ri-time-line"></i>
              Updated {formatLastUpdated(lastUpdated)}
            </span>
          </div>
        </div>
        <Link
          to="/dashboard/aim"
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-ai-500 to-ai-600 text-white font-bold rounded-premium hover:from-ai-600 hover:to-ai-700 transition-all shadow-glow-sm hover:shadow-glow-md hover:-translate-y-0.5 whitespace-nowrap text-sm"
        >
          <i className="ri-brain-line text-base"></i>
          Launch AIM
        </Link>
      </div>

      <OperationalTrustPanel
        title="Dashboard signals are based on live metric history"
        subtitle="Use this panel to verify freshness and understand what is feeding the operating view before acting on alerts or KPI movement."
        chips={[
          { label: 'Updated', value: formatLastUpdated(lastUpdated), tone: 'teal' },
          { label: 'Trend Series', value: `${stats.metricTrendSeries.length} live`, tone: 'emerald' },
          { label: 'KPI Grid', value: `${stats.kpiHealthGrid.length} tracked`, tone: 'slate' },
        ]}
        note="Lineage for the primary dashboard metrics follows the live SigmaSense path: Data Integration → Data Mapping → ETL Pipelines → Metrics → Dashboard. If a widget is empty, it usually means there is not enough recent metric history yet."
      />

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Metrics"
          value={stats.totalMetrics}
          subtitle="Tracked across all processes"
          icon="ri-line-chart-line"
          iconBg="bg-gradient-to-br from-sapphire-500 to-sapphire-600"
          accent="bg-sapphire-500"
          trend={stats.totalMetrics > 0 ? { value: `${stats.totalMetrics} active`, up: true } : null}
        />
        <StatCard
          title="Active Alerts"
          value={stats.activeAlerts}
          subtitle={stats.activeAlerts === 0 ? 'All systems normal' : 'Require attention'}
          icon="ri-alert-line"
          iconBg={stats.activeAlerts > 0 ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-emerald-500 to-emerald-600'}
          accent={stats.activeAlerts > 0 ? 'bg-red-500' : 'bg-emerald-500'}
          trend={null}
        />
        <StatCard
          title="Avg KPI Health"
          value={`${stats.avgMetricValue.toFixed(1)}%`}
          subtitle="Average attainment vs targets"
          icon="ri-speed-up-line"
          iconBg="bg-gradient-to-br from-ai-500 to-ai-600"
          accent="bg-ai-500"
          trend={stats.avgMetricValue > 0 ? {
            value: `${avgPctVsTarget >= 0 ? '+' : ''}${avgPctVsTarget.toFixed(1)}% vs target`,
            up: avgPctVsTarget >= 0,
          } : null}
        />
        <StatCard
          title="Completed Actions"
          value={stats.completedActions}
          subtitle={`${stats.completedForecasts} forecasts · ${stats.pendingRecommendations} pending recs`}
          icon="ri-checkbox-circle-line"
          iconBg="bg-gradient-to-br from-violet-500 to-violet-600"
          accent="bg-violet-500"
          trend={stats.completedActions > 0 ? { value: `${stats.completedActions} resolved`, up: true } : null}
        />
      </div>

      {/* ── Trend Chart + AI Alert Panel ── */}
      <div className="grid grid-cols-3 gap-5">

        {/* Trend Chart — 2/3 */}
        <div className="col-span-2 bg-white rounded-premium-lg border border-border shadow-elevation-2 p-6" style={{ minHeight: '340px' }}>
          <MetricTrendChart series={stats.metricTrendSeries} />
        </div>

        {/* AI Alert Panel — 1/3 */}
        <div className="bg-gradient-to-br from-brand-900 via-brand-800 to-brand-900 rounded-premium-lg shadow-elevation-4 p-5 flex flex-col relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-ai-400/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-sapphire-400/10 rounded-full blur-2xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 bg-gradient-to-br from-ai-400 to-ai-500 rounded-premium flex items-center justify-center shadow-glow-sm flex-shrink-0">
                <i className="ri-brain-line text-white text-base"></i>
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">AI Alerts</h2>
                <p className="text-brand-400 text-xs">Live intelligence feed</p>
              </div>
            </div>

            {/* Summary pills */}
            <div className="flex gap-2 mb-4">
              {[
                { count: stats.activeAnomalies, label: 'Anomalies' },
                { count: stats.pendingRecommendations, label: 'Pending Recs' },
                { count: stats.completedForecasts, label: 'Forecasts' },
              ].map((item) => (
                <div key={item.label} className="flex-1 bg-white/8 rounded-premium px-2 py-2 text-center border border-white/10">
                  <p className="text-lg font-bold text-white tabular-nums">{item.count}</p>
                  <p className="text-brand-400 text-xs mt-0.5 leading-tight">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Alert list */}
            <div className="flex-1 space-y-2 overflow-y-auto">
              {dedupedRecentAlerts.length > 0 ? (
                dedupedRecentAlerts.slice(0, 4).map((alert) => {
                  const sev = {
                    critical: { bg: 'bg-red-400/20', text: 'text-red-300', icon: 'ri-alert-line' },
                    high:     { bg: 'bg-amber-400/20', text: 'text-amber-300', icon: 'ri-error-warning-line' },
                    medium:   { bg: 'bg-ai-400/20', text: 'text-ai-300', icon: 'ri-information-line' },
                    low:      { bg: 'bg-emerald-400/20', text: 'text-emerald-300', icon: 'ri-checkbox-circle-line' },
                  }[alert.severity as string] ?? { bg: 'bg-white/10', text: 'text-white', icon: 'ri-notification-line' };

                  return (
                    <div key={alert.id} className="bg-white/8 rounded-premium p-3 border border-white/10 hover:bg-white/12 transition-colors cursor-pointer">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-7 h-7 ${sev.bg} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <i className={`${sev.icon} ${sev.text} text-sm`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-semibold leading-snug line-clamp-2">{alert.title}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.5 ${sev.bg} ${sev.text} rounded text-xs font-semibold capitalize`}>
                              {alert.severity}
                            </span>
                            {alert.repeatCount > 1 && (
                              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-white/10 text-brand-300">
                                {alert.repeatCount}×
                              </span>
                            )}
                            <span className="text-brand-500 text-xs">
                              {new Date(alert.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-white/8 rounded-premium p-4 border border-white/10 text-center">
                  <div className="w-8 h-8 bg-emerald-400/20 rounded-premium flex items-center justify-center mx-auto mb-2">
                    <i className="ri-checkbox-circle-line text-emerald-300 text-lg"></i>
                  </div>
                  <p className="text-white text-xs font-bold">All Systems Normal</p>
                  <p className="text-brand-400 text-xs mt-0.5">No active alerts</p>
                </div>
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-white/10">
              <Link
                to="/dashboard/aim"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-ai-500 to-ai-600 text-white font-bold rounded-premium hover:from-ai-600 hover:to-ai-700 transition-all text-xs shadow-glow-sm whitespace-nowrap"
              >
                <i className="ri-arrow-right-line"></i>
                View All Insights
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Health Grid ── */}
      <div className="bg-white rounded-premium-lg border border-border shadow-elevation-2 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-brand-900 tracking-tight">KPI Health Grid</h2>
            <p className="text-brand-400 text-xs mt-0.5">Real-time status of all tracked metrics vs targets</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-xs">
              {[
                { dot: 'bg-emerald-500', label: 'On Track ≥90%' },
                { dot: 'bg-amber-500', label: 'At Risk 70–89%' },
                { dot: 'bg-red-500', label: 'Critical <70%' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${item.dot}`}></div>
                  <span className="text-brand-400 font-medium">{item.label}</span>
                </div>
              ))}
            </div>
            <Link
              to="/dashboard/kpi-scorecards"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-background hover:bg-brand-50 border border-border rounded-premium text-xs font-semibold text-brand-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-bar-chart-box-line text-sm"></i>
              KPI Scorecards
            </Link>
          </div>
        </div>
        <KPIHealthGrid items={stats.kpiHealthGrid} />
      </div>

      {/* ── Recent Metrics + Quick Actions ── */}
      <div className="grid grid-cols-2 gap-5">

        {/* Recent Metrics */}
        <div className="bg-white rounded-premium-lg border border-border shadow-elevation-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-brand-900">Recent Data Points</h2>
            <Link to="/dashboard/metrics" className="text-xs font-bold text-ai-600 hover:text-ai-700 cursor-pointer whitespace-nowrap">
              View All →
            </Link>
          </div>
          <div className="space-y-2">
            {stats.recentMetrics.length > 0 ? (
              stats.recentMetrics.map((metric) => (
                <div key={metric.id} className="flex items-center justify-between p-3 bg-background rounded-premium hover:bg-brand-50 transition-colors cursor-pointer group border border-transparent hover:border-border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-800 group-hover:text-ai-600 transition-colors truncate">{metric.name}</p>
                    <p className="text-xs text-brand-400 mt-0.5">
                      {new Date(metric.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-base font-bold text-brand-900 tabular-nums">{metric.value.toFixed(1)}</p>
                    {metric.unit && <p className="text-xs text-brand-400">{metric.unit}</p>}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-brand-50 rounded-premium-lg flex items-center justify-center mx-auto mb-3 border border-border">
                  <i className="ri-line-chart-line text-brand-300 text-xl"></i>
                </div>
                <p className="text-brand-400 text-sm">No metric data yet</p>
                <Link to="/dashboard/metrics" className="text-ai-600 hover:text-ai-700 font-bold text-xs mt-2 inline-block cursor-pointer">
                  Add your first metric →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-premium-lg border border-border shadow-elevation-2 p-5">
          <h2 className="text-sm font-bold text-brand-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { to: '/dashboard/dmaic',              icon: 'ri-flow-chart',            label: 'New DMAIC Project',   bg: 'from-sapphire-50 to-sapphire-100/60', iconBg: 'from-sapphire-500 to-sapphire-600', text: 'text-sapphire-700', border: 'border-sapphire-200/40' },
              { to: '/dashboard/data-integration',   icon: 'ri-database-2-line',       label: 'Connect Data Source', bg: 'from-ai-50 to-ai-100/60',              iconBg: 'from-ai-500 to-ai-600',            text: 'text-ai-700',       border: 'border-ai-200/40' },
              { to: '/dashboard/advanced-forecasting', icon: 'ri-line-chart-line',     label: 'Run Forecast',        bg: 'from-violet-50 to-violet-100/60',      iconBg: 'from-violet-500 to-violet-600',    text: 'text-violet-700',   border: 'border-violet-200/40' },
              { to: '/dashboard/anomaly-detection',  icon: 'ri-radar-line',            label: 'Anomaly Scan',        bg: 'from-amber-50 to-amber-100/60',        iconBg: 'from-amber-500 to-amber-600',      text: 'text-amber-700',    border: 'border-amber-200/40' },
              { to: '/dashboard/automation-rules',   icon: 'ri-robot-line',            label: 'Automation Rules',    bg: 'from-emerald-50 to-emerald-100/60',    iconBg: 'from-emerald-500 to-emerald-600',  text: 'text-emerald-700',  border: 'border-emerald-200/40' },
              { to: '/dashboard/benchmarking',       icon: 'ri-bar-chart-grouped-line', label: 'Benchmarking',       bg: 'from-rose-50 to-rose-100/60',          iconBg: 'from-rose-500 to-rose-600',        text: 'text-rose-700',     border: 'border-rose-200/40' },
            ].map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className={`flex items-center gap-3 p-3.5 bg-gradient-to-br ${action.bg} rounded-premium hover:shadow-elevation-2 transition-all duration-200 group border ${action.border} cursor-pointer`}
              >
                <div className={`w-9 h-9 bg-gradient-to-br ${action.iconBg} rounded-premium flex items-center justify-center group-hover:scale-105 transition-transform shadow-elevation-1 flex-shrink-0`}>
                  <i className={`${action.icon} text-white text-base`}></i>
                </div>
                <span className={`text-xs font-bold ${action.text} leading-tight`}>{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
