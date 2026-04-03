import type { KPIHealthItem } from '../../../hooks/useDashboardData';
import { Link } from 'react-router-dom';

interface KPIHealthGridProps {
  items: KPIHealthItem[];
}

function formatRelativeTime(timestamp: string) {
  if (!timestamp) return 'No recent data';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just updated';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just updated';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 64;
  const h = 28;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const areaPath = `M${pts[0]} L${pts.join(' L')} L${w},${h} L0,${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sg-${color.replace('#', '')})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const STATUS_CONFIG = {
  'on-track': {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    label: 'On Track',
    icon: 'ri-checkbox-circle-line',
    iconColor: 'text-emerald-500',
    sparkColor: '#10B981',
  },
  'at-risk': {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    label: 'At Risk',
    icon: 'ri-error-warning-line',
    iconColor: 'text-amber-500',
    sparkColor: '#F59E0B',
  },
  critical: {
    badge: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
    label: 'Critical',
    icon: 'ri-alert-line',
    iconColor: 'text-red-500',
    sparkColor: '#EF4444',
  },
};

function KPICard({ item }: { item: KPIHealthItem }) {
  const cfg = STATUS_CONFIG[item.status];
  const pctOfTarget = item.targetValue > 0
    ? Math.min(100, (item.currentValue / item.targetValue) * 100)
    : 100;
  const trendUp = item.trend === 'up';
  const trendStable = item.trend === 'stable';
  const freshness = formatRelativeTime(item.lastTimestamp);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-all duration-200 group cursor-pointer">
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">{item.category}</p>
          <h3 className="text-sm font-bold text-gray-900 mt-0.5 leading-tight line-clamp-2">{item.name}</h3>
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cfg.badge}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></div>
          {cfg.label}
        </div>
      </div>

      {/* Value + Sparkline */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-900 tabular-nums leading-none">
              {item.currentValue.toFixed(1)}
            </span>
            {item.unit && <span className="text-xs text-gray-400 font-medium">{item.unit}</span>}
          </div>
          <div className={`flex items-center gap-1 mt-1 text-xs font-semibold ${
            trendStable ? 'text-gray-400' : trendUp ? 'text-emerald-600' : 'text-red-500'
          }`}>
            <i className={`${trendStable ? 'ri-subtract-line' : trendUp ? 'ri-arrow-up-line' : 'ri-arrow-down-line'} text-sm`}></i>
            {trendStable ? 'Stable' : `${Math.abs(item.trendPct).toFixed(1)}%`}
          </div>
        </div>
        <Sparkline values={item.sparkline} color={cfg.sparkColor} />
      </div>

      {/* Progress bar vs target */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">vs target {item.targetValue.toFixed(0)}{item.unit}</span>
          <span className={`text-xs font-bold ${pctOfTarget >= 90 ? 'text-emerald-600' : pctOfTarget >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
            {pctOfTarget.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${pctOfTarget}%` }}
          ></div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            Freshness: {freshness}
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            History: {item.historyPoints} points
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">{item.evidenceSummary}</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">{item.lineageSummary}</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">Provenance: {item.provenanceSummary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to={`/dashboard/metrics?metric=${item.id}`}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-200 hover:text-teal-700"
          >
            <i className="ri-line-chart-line"></i>
            Metric
          </Link>
          <Link
            to={`/dashboard/etl-pipelines?metric=${item.id}`}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-200 hover:text-teal-700"
          >
            <i className="ri-git-branch-line"></i>
            ETL
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function KPIHealthGrid({ items }: KPIHealthGridProps) {
  const onTrack = items.filter((i) => i.status === 'on-track').length;
  const atRisk = items.filter((i) => i.status === 'at-risk').length;
  const critical = items.filter((i) => i.status === 'critical').length;

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
        <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center">
          <i className="ri-bar-chart-box-line text-gray-400 text-2xl"></i>
        </div>
        <div>
          <p className="text-gray-500 font-medium text-sm">No KPI data yet</p>
          <p className="text-gray-400 text-xs mt-1">Add metrics with targets to see health status</p>
        </div>
        <Link
          to="/dashboard/metrics"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 mt-1 cursor-pointer"
        >
          Go to Metrics →
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
          <span className="text-xs font-semibold text-gray-600">{onTrack} On Track</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
          <span className="text-xs font-semibold text-gray-600">{atRisk} At Risk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
          <span className="text-xs font-semibold text-gray-600">{critical} Critical</span>
        </div>
        <Link
          to="/dashboard/metrics"
          className="ml-auto text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          View All →
        </Link>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <KPICard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
