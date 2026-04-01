import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { MetricTrendSeries } from '../../../hooks/useDashboardData';

interface MetricTrendChartProps {
  series: MetricTrendSeries[];
}

const RANGE_OPTIONS = ['7D', '14D', '30D'] as const;
type Range = typeof RANGE_OPTIONS[number];

const RANGE_DAYS: Record<Range, number> = { '7D': 7, '14D': 14, '30D': 30 };

function buildChartData(series: MetricTrendSeries[], days: number) {
  if (!series.length) return [];

  // Collect all unique dates across all series (last N points)
  const allDates = new Set<string>();
  const sliced = series.map((s) => {
    const pts = s.data.slice(-days);
    pts.forEach((p) => allDates.add(p.date));
    return { ...s, pts };
  });

  const sortedDates = Array.from(allDates).slice(-days);

  return sortedDates.map((date) => {
    const row: Record<string, string | number> = { date };
    sliced.forEach((s) => {
      const pt = s.pts.find((p) => p.date === date);
      if (pt !== undefined) row[s.name] = pt.value;
    });
    return row;
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }}></div>
            <span className="text-gray-600 truncate max-w-[100px]">{entry.name}</span>
          </div>
          <span className="font-bold text-gray-900 tabular-nums">{Number(entry.value).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
};

export default function MetricTrendChart({ series }: MetricTrendChartProps) {
  const [range, setRange] = useState<Range>('14D');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const chartData = buildChartData(series, RANGE_DAYS[range]);
  const avgTarget = series.length
    ? series.reduce((s, m) => s + m.targetValue, 0) / series.length
    : 85;

  const toggleSeries = (name: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  if (!series.length || !chartData.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center">
          <i className="ri-line-chart-line text-gray-400 text-2xl"></i>
        </div>
        <div>
          <p className="text-gray-500 font-medium text-sm">No trend data yet</p>
          <p className="text-gray-400 text-xs mt-1">Add metric data points to see live trends</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">Performance Trends</h2>
          <p className="text-gray-500 text-xs mt-0.5">Live metric data vs targets</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-150 cursor-pointer whitespace-nowrap ${
                range === r
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Legend toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {series.map((s) => (
          <button
            key={s.metricId}
            onClick={() => toggleSeries(s.name)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer whitespace-nowrap ${
              hiddenSeries.has(s.name)
                ? 'border-gray-200 text-gray-400 bg-gray-50'
                : 'border-transparent text-white'
            }`}
            style={
              hiddenSeries.has(s.name)
                ? {}
                : { background: s.color, borderColor: s.color }
            }
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: hiddenSeries.has(s.name) ? '#d1d5db' : 'white' }}
            ></div>
            {s.name}
          </button>
        ))}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-amber-400 text-amber-600 bg-amber-50 whitespace-nowrap">
          <div className="w-2 h-2 rounded-full bg-amber-400"></div>
          Avg Target
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${Number(v).toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={avgTarget}
              stroke="#F59E0B"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{ value: `Target ${avgTarget.toFixed(0)}`, position: 'right', fontSize: 10, fill: '#F59E0B' }}
            />
            {series.map((s) =>
              hiddenSeries.has(s.name) ? null : (
                <Line
                  key={s.metricId}
                  type="monotone"
                  dataKey={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls
                />
              )
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
