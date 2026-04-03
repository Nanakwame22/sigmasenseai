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
    <div className={`bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${accent} rounded-l-xl`}></div>
      <div className="flex items-start justify-between">
        <div className="flex-1 pl-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums leading-none">{value}</p>
          <p className="text-xs text-gray-400 mt-1.5">{subtitle}</p>
        </div>
        <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-200 flex-shrink-0`}>
          <i className={`${icon} text-white text-xl`}></i>
        </div>
      </div>
      {trend && (
        <div className={`mt-3 pl-2 flex items-center gap-1.5 text-xs font-semibold ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
          <i className={`${trend.up ? 'ri-arrow-up-line' : 'ri-arrow-down-line'} text-sm`}></i>
          <span>{trend.value}</span>
        </div>
      )}
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
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-teal-500 rounded-2xl flex items-center justify-center animate-pulse">
            <i className="ri-loader-4-line text-white text-2xl animate-spin"></i>
          </div>
          <p className="text-gray-500 font-medium text-sm">Loading intelligence dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center">
            <i className="ri-error-warning-line text-red-500 text-2xl"></i>
          </div>
          <div>
            <p className="text-red-600 font-semibold">Failed to load dashboard</p>
            <p className="text-gray-400 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const avgPctVsTarget = stats.avgMetricValue > 0
    ? (stats.avgMetricValue - 85)
    : 0;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Operations Intelligence</h1>
            {isRealtimeConnected && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Live</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-gray-400 text-sm mt-1">
            <span>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <i className="ri-time-line"></i>
              Updated {formatLastUpdated(lastUpdated)}
            </span>
          </div>
        </div>
        <Link
          to="/aim"
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-teal-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-teal-700 transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 whitespace-nowrap"
        >
          <i className="ri-brain-line text-lg"></i>
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

      {/* ── Stat Cards Row ── */}
      <div className="grid grid-cols-4 gap-5">
        <StatCard
          title="Total Metrics"
          value={stats.totalMetrics}
          subtitle="Tracked across all processes"
          icon="ri-line-chart-line"
          iconBg="bg-gradient-to-br from-blue-500 to-blue-600"
          accent="bg-blue-500"
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
          subtitle="Average attainment vs metric targets"
          icon="ri-speed-up-line"
          iconBg="bg-gradient-to-br from-teal-500 to-teal-600"
          accent="bg-teal-500"
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

      {/* ── Main Content: Trend Chart + Alerts Panel ── */}
      <div className="grid grid-cols-3 gap-5">

        {/* Trend Chart — 2/3 width */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6" style={{ minHeight: '340px' }}>
          <MetricTrendChart series={stats.metricTrendSeries} />
        </div>

        {/* AI Alerts Panel — 1/3 width */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-5 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-teal-400/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-blue-400/10 rounded-full blur-xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-teal-500 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                <i className="ri-brain-line text-white text-lg"></i>
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">AI Alerts</h2>
                <p className="text-slate-400 text-xs">Live intelligence feed</p>
              </div>
            </div>

            {/* Anomaly / Rec summary pills */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-bold text-white tabular-nums">{stats.activeAnomalies}</p>
                <p className="text-slate-400 text-xs mt-0.5">Anomalies</p>
              </div>
              <div className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-bold text-white tabular-nums">{stats.pendingRecommendations}</p>
                <p className="text-slate-400 text-xs mt-0.5">Pending Recs</p>
              </div>
              <div className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-bold text-white tabular-nums">{stats.completedForecasts}</p>
                <p className="text-slate-400 text-xs mt-0.5">Forecasts</p>
              </div>
            </div>

            {/* Alert list */}
            <div className="flex-1 space-y-2.5 overflow-y-auto">
              {stats.recentAlerts.length > 0 ? (
                stats.recentAlerts.slice(0, 4).map((alert) => {
                  const sev = {
                    critical: { bg: 'bg-red-400/20', text: 'text-red-300', icon: 'ri-alert-line' },
                    high: { bg: 'bg-amber-400/20', text: 'text-amber-300', icon: 'ri-error-warning-line' },
                    medium: { bg: 'bg-sky-400/20', text: 'text-sky-300', icon: 'ri-information-line' },
                    low: { bg: 'bg-emerald-400/20', text: 'text-emerald-300', icon: 'ri-checkbox-circle-line' },
                  }[alert.severity as string] ?? { bg: 'bg-white/10', text: 'text-white', icon: 'ri-notification-line' };

                  return (
                    <div key={alert.id} className="bg-white/10 rounded-lg p-3 border border-white/10 hover:bg-white/15 transition-colors cursor-pointer">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-7 h-7 ${sev.bg} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <i className={`${sev.icon} ${sev.text} text-sm`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-semibold leading-snug line-clamp-2">{alert.title}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`px-1.5 py-0.5 ${sev.bg} ${sev.text} rounded text-xs font-medium capitalize`}>
                              {alert.severity}
                            </span>
                            <span className="text-slate-400 text-xs">
                              {new Date(alert.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-white/10 rounded-lg p-4 border border-white/10 text-center">
                  <div className="w-8 h-8 bg-emerald-400/20 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <i className="ri-checkbox-circle-line text-emerald-300 text-lg"></i>
                  </div>
                  <p className="text-white text-sm font-semibold">All Systems Normal</p>
                  <p className="text-slate-400 text-xs mt-0.5">No active alerts</p>
                </div>
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-white/10">
              <Link
                to="/aim"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all duration-200 text-sm shadow-md whitespace-nowrap"
              >
                <i className="ri-arrow-right-line"></i>
                View All Insights
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Health Grid ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">KPI Health Grid</h2>
            <p className="text-gray-400 text-xs mt-0.5">Real-time status of all tracked metrics vs targets</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                <span className="text-gray-500 font-medium">On Track ≥90%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                <span className="text-gray-500 font-medium">At Risk 70–89%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                <span className="text-gray-500 font-medium">Critical &lt;70%</span>
              </div>
            </div>
            <Link
              to="/dashboard/kpi-scorecards"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-bar-chart-box-line text-sm"></i>
              KPI Scorecards
            </Link>
          </div>
        </div>
        <KPIHealthGrid items={stats.kpiHealthGrid} />
      </div>

      {/* ── Bottom Row: Recent Metrics + Quick Actions ── */}
      <div className="grid grid-cols-2 gap-5">

        {/* Recent Metrics */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Recent Data Points</h2>
            <Link to="/dashboard/metrics" className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer whitespace-nowrap">
              View All →
            </Link>
          </div>
          <div className="space-y-2">
            {stats.recentMetrics.length > 0 ? (
              stats.recentMetrics.map((metric) => (
                <div key={metric.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors truncate">{metric.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(metric.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-lg font-bold text-gray-900 tabular-nums">{metric.value.toFixed(1)}</p>
                    {metric.unit && <p className="text-xs text-gray-400">{metric.unit}</p>}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <i className="ri-line-chart-line text-gray-400 text-xl"></i>
                </div>
                <p className="text-gray-400 text-sm">No metric data yet</p>
                <Link to="/dashboard/metrics" className="text-blue-600 hover:text-blue-700 font-semibold text-sm mt-2 inline-block cursor-pointer">
                  Add your first metric →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { to: '/dashboard/dmaic', icon: 'ri-flow-chart', label: 'New DMAIC Project', bg: 'from-blue-50 to-blue-100/60', iconBg: 'from-blue-500 to-blue-600', text: 'text-blue-700', border: 'border-blue-200/40' },
              { to: '/dashboard/data-integration', icon: 'ri-database-2-line', label: 'Connect Data Source', bg: 'from-teal-50 to-teal-100/60', iconBg: 'from-teal-500 to-teal-600', text: 'text-teal-700', border: 'border-teal-200/40' },
              { to: '/dashboard/advanced-forecasting', icon: 'ri-line-chart-line', label: 'Run Forecast', bg: 'from-violet-50 to-violet-100/60', iconBg: 'from-violet-500 to-violet-600', text: 'text-violet-700', border: 'border-violet-200/40' },
              { to: '/dashboard/anomaly-detection', icon: 'ri-radar-line', label: 'Anomaly Scan', bg: 'from-amber-50 to-amber-100/60', iconBg: 'from-amber-500 to-amber-600', text: 'text-amber-700', border: 'border-amber-200/40' },
              { to: '/dashboard/automation-rules', icon: 'ri-robot-line', label: 'Automation Rules', bg: 'from-emerald-50 to-emerald-100/60', iconBg: 'from-emerald-500 to-emerald-600', text: 'text-emerald-700', border: 'border-emerald-200/40' },
              { to: '/dashboard/benchmarking', icon: 'ri-bar-chart-grouped-line', label: 'Benchmarking', bg: 'from-rose-50 to-rose-100/60', iconBg: 'from-rose-500 to-rose-600', text: 'text-rose-700', border: 'border-rose-200/40' },
            ].map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className={`flex items-center gap-3 p-3.5 bg-gradient-to-br ${action.bg} rounded-xl hover:shadow-sm transition-all duration-200 group border ${action.border} cursor-pointer`}
              >
                <div className={`w-9 h-9 bg-gradient-to-br ${action.iconBg} rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm flex-shrink-0`}>
                  <i className={`${action.icon} text-white text-base`}></i>
                </div>
                <span className={`text-sm font-semibold ${action.text} leading-tight`}>{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
