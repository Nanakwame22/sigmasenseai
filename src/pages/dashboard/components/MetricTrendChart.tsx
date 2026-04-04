import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MetricTrendSeries } from '../../../hooks/useDashboardData';

interface MetricTrendChartProps {
  series: MetricTrendSeries[];
}

const RANGE_OPTIONS = ['7D', '14D', '30D'] as const;
type Range = typeof RANGE_OPTIONS[number];

const RANGE_DAYS: Record<Range, number> = { '7D': 7, '14D': 14, '30D': 30 };

function buildChartData(series: MetricTrendSeries[], days: number) {
  if (!series.length) return [];

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

function formatMetricValue(value: number, unit: string) {
  const safeValue = Number.isFinite(value) ? value : 0;

  if (!unit || unit === 'score') return safeValue.toFixed(1);
  if (unit === 'count' || unit === 'beds') return `${safeValue.toFixed(0)} ${unit}`;
  if (unit === 'minutes') return `${safeValue.toFixed(1)} min`;
  if (unit === 'hours') return `${safeValue.toFixed(1)} h`;
  if (unit === 'ratio') return `${safeValue.toFixed(1)}x`;
  if (unit === '%') return `${safeValue.toFixed(1)}%`;

  return `${safeValue.toFixed(1)} ${unit}`;
}

function formatDelta(delta: number, unit: string) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return 'No movement';
  const prefix = delta > 0 ? '+' : '';
  return `${prefix}${formatMetricValue(delta, unit)}`;
}

function formatTargetGap(value: number, targetValue: number, unit: string) {
  if (!Number.isFinite(targetValue)) return 'No target';
  const delta = value - targetValue;
  if (Math.abs(delta) < 0.0001) return 'On target';
  return `${delta > 0 ? '+' : ''}${formatMetricValue(delta, unit)} vs target`;
}

function formatDateLabel(label: string) {
  const date = new Date(label);
  if (Number.isNaN(date.getTime())) return label;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface TooltipPayloadItem {
  name: string;
  color: string;
  value: number;
  payload: Record<string, string | number>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  chartData: Array<Record<string, string | number>>;
  seriesMeta: Map<string, MetricTrendSeries>;
  selectedSeries: string | null;
}

function CustomTooltip({ active, payload, label, chartData, seriesMeta, selectedSeries }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const currentIndex = chartData.findIndex((row) => row.date === label);
  const previousRow = currentIndex > 0 ? chartData[currentIndex - 1] : null;
  const orderedPayload = [...payload].sort((a, b) => {
    if (a.name === selectedSeries) return -1;
    if (b.name === selectedSeries) return 1;
    return 0;
  });

  return (
    <div className="min-w-[220px] rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Trend Snapshot</p>
        <p className="text-sm font-semibold text-slate-700">{label ? formatDateLabel(label) : ''}</p>
      </div>
      <div className="space-y-2.5">
        {orderedPayload.map((entry) => {
          const meta = seriesMeta.get(entry.name);
          const currentValue = Number(entry.value);
          const previousValue = previousRow ? Number(previousRow[entry.name] ?? currentValue) : currentValue;
          const delta = currentValue - previousValue;
          const targetValue = meta?.targetValue ?? 0;
          const isSelected = entry.name === selectedSeries;

          return (
            <div
              key={entry.name}
              className={`rounded-2xl border px-3 py-2.5 transition-all ${
                isSelected ? 'border-slate-900/10 bg-slate-50' : 'border-slate-200/70 bg-white'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }}></div>
                  <span className="text-sm font-semibold text-slate-800">{entry.name}</span>
                </div>
                <span className="text-sm font-bold tabular-nums text-slate-900">
                  {formatMetricValue(currentValue, meta?.unit || '')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className={`${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                  {formatDelta(delta, meta?.unit || '')}
                </span>
                <span className="text-slate-500">{formatTargetGap(currentValue, targetValue, meta?.unit || '')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MetricTrendChart({ series }: MetricTrendChartProps) {
  const [range, setRange] = useState<Range>('14D');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [selectedSeries, setSelectedSeries] = useState<string | null>(series[0]?.name ?? null);

  const chartData = buildChartData(series, RANGE_DAYS[range]);
  const avgTarget = series.length
    ? series.reduce((sum, item) => sum + item.targetValue, 0) / series.length
    : 0;
  const seriesMeta = useMemo(() => new Map(series.map((item) => [item.name, item])), [series]);
  const visibleSeries = series.filter((item) => !hiddenSeries.has(item.name));
  const leadSeries = visibleSeries.find((item) => item.name === selectedSeries) ?? visibleSeries[0] ?? null;
  const leadLatestPoint = leadSeries?.data.at(-1)?.value ?? 0;
  const leadPreviousPoint = leadSeries && leadSeries.data.length > 1 ? leadSeries.data.at(-2)?.value ?? leadLatestPoint : leadLatestPoint;
  const leadDelta = leadLatestPoint - leadPreviousPoint;
  const yAxisDomain = useMemo(() => {
    const values = visibleSeries.flatMap((item) => item.data.map((point) => point.value));
    if (Number.isFinite(avgTarget)) values.push(avgTarget);
    if (!values.length) return [0, 100] as [number, number];

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const spread = Math.max(maxValue - minValue, Math.abs(maxValue) * 0.08, 1);
    const padding = spread * 0.35;
    const lowerBound = Math.max(0, minValue - padding);
    const upperBound = maxValue + padding;

    return [lowerBound, upperBound] as [number, number];
  }, [avgTarget, visibleSeries]);

  useEffect(() => {
    if (!series.length) {
      setSelectedSeries(null);
      return;
    }

    if (!selectedSeries || !series.some((item) => item.name === selectedSeries)) {
      setSelectedSeries(series[0].name);
    }
  }, [selectedSeries, series]);

  useEffect(() => {
    if (!selectedSeries || !hiddenSeries.has(selectedSeries)) return;
    const nextVisible = series.find((item) => !hiddenSeries.has(item.name));
    setSelectedSeries(nextVisible?.name ?? null);
  }, [hiddenSeries, selectedSeries, series]);

  const toggleSeries = (name: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (!series.length || !chartData.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100">
          <i className="ri-line-chart-line text-2xl text-gray-400"></i>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">No trend data yet</p>
          <p className="mt-1 text-xs text-gray-400">Add metric data points to see live trends</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Performance Trends</p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Operational metric movement vs target</h2>
            <p className="mt-1 text-xs text-slate-500">Primary signal stays emphasized while supporting KPIs remain visible for context.</p>
          </div>
          {leadSeries ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Lead Metric</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-base font-bold text-slate-900">{leadSeries.name}</span>
                  <span className="text-sm font-semibold" style={{ color: leadSeries.color }}>
                    {formatMetricValue(leadLatestPoint, leadSeries.unit)}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Session Delta</div>
                <div className={`mt-1 text-sm font-semibold ${leadDelta > 0 ? 'text-emerald-600' : leadDelta < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                  {formatDelta(leadDelta, leadSeries.unit)}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Target Watch</div>
                <div className="mt-1 text-sm font-semibold text-amber-700">{formatMetricValue(avgTarget, leadSeries.unit)}</div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                range === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {series.map((s) => {
          const isHidden = hiddenSeries.has(s.name);
          const isSelected = s.name === leadSeries?.name;
          const latestValue = s.data.at(-1)?.value ?? 0;

          return (
            <button
              key={s.metricId}
              onClick={() => {
                toggleSeries(s.name);

                if (isHidden) {
                  setSelectedSeries(s.name);
                } else if (isSelected && visibleSeries.length > 1) {
                  const fallback = visibleSeries.find((item) => item.name !== s.name);
                  setSelectedSeries(fallback?.name ?? s.name);
                } else if (!isHidden) {
                  setSelectedSeries(s.name);
                }
              }}
              className={`cursor-pointer rounded-2xl border px-3 py-2 text-left transition-all ${
                isHidden
                  ? 'border-slate-200 bg-slate-50 text-slate-400'
                  : isSelected
                    ? 'border-slate-900/10 bg-slate-900 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: isHidden ? '#cbd5e1' : s.color }}
                ></div>
                <span className="text-[11px] font-semibold">{s.name}</span>
              </div>
              <div className={`mt-1 text-xs font-bold tabular-nums ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                {formatMetricValue(latestValue, s.unit)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 14, right: 10, left: 2, bottom: 6 }}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              tickFormatter={formatDateLabel}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={yAxisDomain}
              width={38}
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${Number(v).toFixed(0)}`}
            />
            <Tooltip
              content={
                <CustomTooltip
                  chartData={chartData}
                  seriesMeta={seriesMeta}
                  selectedSeries={leadSeries?.name ?? null}
                />
              }
            />
            <ReferenceLine y={avgTarget} stroke="#F59E0B" strokeDasharray="4 6" strokeWidth={1.5} />
            {series.map((s) =>
              hiddenSeries.has(s.name) ? null : (
                <Line
                  key={s.metricId}
                  type="monotone"
                  dataKey={s.name}
                  stroke={s.color}
                  strokeWidth={leadSeries?.name === s.name ? 3.25 : 1.9}
                  strokeOpacity={leadSeries?.name === s.name ? 1 : 0.26}
                  dot={false}
                  activeDot={{
                    r: leadSeries?.name === s.name ? 5 : 3,
                    strokeWidth: 3,
                    stroke: '#fff',
                    fill: s.color,
                  }}
                  connectNulls
                />
              )
            )}
          </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
