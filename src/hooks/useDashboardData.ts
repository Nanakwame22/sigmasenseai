import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface MetricTrendSeries {
  metricId: string;
  name: string;
  unit: string;
  targetValue: number;
  color: string;
  data: Array<{ date: string; value: number }>;
}

export interface KPIHealthItem {
  id: string;
  name: string;
  unit: string;
  currentValue: number;
  targetValue: number;
  trend: 'up' | 'down' | 'stable';
  trendPct: number;
  status: 'on-track' | 'at-risk' | 'critical';
  sparkline: number[];
  category: string;
  historyPoints: number;
  lastTimestamp: string;
  evidenceSummary: string;
  lineageSummary: string;
  provenanceSummary: string;
}

export interface DashboardStats {
  totalMetrics: number;
  activeAlerts: number;
  completedActions: number;
  avgMetricValue: number;
  activeAnomalies: number;
  pendingRecommendations: number;
  completedForecasts: number;
  recentMetrics: Array<{
    id: string;
    name: string;
    value: number;
    timestamp: string;
    unit: string;
  }>;
  recentAlerts: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    created_at: string;
  }>;
  metricTrendSeries: MetricTrendSeries[];
  kpiHealthGrid: KPIHealthItem[];
}

const SERIES_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];
const HEALTHCARE_PRIORITY = [
  'ED Wait Time',
  'Occupied Beds',
  'Available Beds',
  'Patients Per Nurse',
  'Readmission Risk',
  'Discharges Pending',
  'LOS Average Hours',
  'Critical Labs Unacknowledged',
];

function normalizeMetricName(name: string | null | undefined) {
  return (name || '').trim().toLowerCase();
}

function getPriorityIndex(name: string) {
  const idx = HEALTHCARE_PRIORITY.findIndex((metric) => normalizeMetricName(metric) === normalizeMetricName(name));
  return idx === -1 ? HEALTHCARE_PRIORITY.length + 100 : idx;
}

function isLegacyRiskMetric(name: string) {
  const normalized = normalizeMetricName(name);
  return normalized.includes('risk score') && !HEALTHCARE_PRIORITY.some((metric) => normalizeMetricName(metric) === normalized);
}

function getMetricHealthRatio(metricName: string, currentValue: number, targetValue: number) {
  if (!Number.isFinite(currentValue)) return 0;
  if (!Number.isFinite(targetValue) || targetValue <= 0) return 100;

  const lowerIsBetterNames = ['ed wait time', 'readmission risk', 'los average hours', 'critical labs unacknowledged'];
  const lowerIsBetter = lowerIsBetterNames.includes(normalizeMetricName(metricName));

  if (lowerIsBetter) {
    if (currentValue <= targetValue) return 100;
    const overshoot = (currentValue - targetValue) / targetValue;
    return Math.max(0, 100 - overshoot * 100);
  }

  return Math.max(0, (currentValue / targetValue) * 100);
}

export function useDashboardData() {
  const { user, organizationId } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalMetrics: 0,
    activeAlerts: 0,
    completedActions: 0,
    avgMetricValue: 0,
    activeAnomalies: 0,
    pendingRecommendations: 0,
    completedForecasts: 0,
    recentMetrics: [],
    recentAlerts: [],
    metricTrendSeries: [],
    kpiHealthGrid: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchDashboardData = async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      // --- Counts ---
      const [
        { count: metricsCount },
        { count: alertsCount },
        { count: actionsCount },
        { count: anomaliesCount },
        { count: pendingRecsCount },
        { count: forecastsCount },
      ] = await Promise.all([
        supabase.from('metrics').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId),
        supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', ['active', 'acknowledged']),
        supabase.from('action_items').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'completed'),
        supabase.from('anomalies').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'active'),
        supabase.from('recommendations').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'pending'),
        supabase.from('forecasts').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'completed'),
      ]);

      // --- Avg metric value ---
      const { data: metricsWithData } = await supabase
        .from('metrics')
        .select('id, name, unit, target_value, category')
        .eq('organization_id', organizationId);

      const metricTrendSeries: MetricTrendSeries[] = [];
      const kpiHealthGrid: KPIHealthItem[] = [];
      const recentMetrics: DashboardStats['recentMetrics'] = [];
      let avgValue = 0;

      if (metricsWithData && metricsWithData.length > 0) {
        const prioritizedMetrics = [...metricsWithData].sort((a: any, b: any) => {
          const priorityDiff = getPriorityIndex(a.name) - getPriorityIndex(b.name);
          if (priorityDiff !== 0) return priorityDiff;
          return a.name.localeCompare(b.name);
        });
        const metricIds = prioritizedMetrics.map((metric: any) => metric.id);

        const { data: allRecentMetricData } = await supabase
          .from('metric_data')
          .select('id, metric_id, value, timestamp, source')
          .in('metric_id', metricIds)
          .order('timestamp', { ascending: false })
          .limit(400);

        const metricPointsById = new Map<string, Array<{ id: string; value: number; timestamp: string; source?: string }>>();
        (allRecentMetricData || []).forEach((row: any) => {
          const existing = metricPointsById.get(row.metric_id) || [];
          existing.push({
            id: row.id,
            value: Number(row.value) || 0,
            timestamp: row.timestamp,
            source: row.source || undefined,
          });
          metricPointsById.set(row.metric_id, existing);
        });

        const recentMetricEntries = prioritizedMetrics
          .flatMap((metric: any) =>
            (metricPointsById.get(metric.id) || []).slice(0, 2).map((point) => ({
              id: point.id,
              name: metric.name,
              value: point.value,
              timestamp: point.timestamp,
              unit: metric.unit || '',
              priority: getPriorityIndex(metric.name),
            }))
          )
          .sort((a, b) => {
            const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            if (timeDiff !== 0) return timeDiff;
            return a.priority - b.priority;
          })
          .slice(0, 5);

        recentMetrics.push(
          ...recentMetricEntries.map(({ priority: _priority, ...metric }) => metric)
        );

        const healthRatios: number[] = [];
        const rankedMetricsForDisplay = prioritizedMetrics
          .map((metric: any) => {
            const rawPoints = metricPointsById.get(metric.id) || [];
            const sortedPoints = [...rawPoints]
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
              .slice(-120);

            const byDate: Record<string, number> = {};
            sortedPoints.forEach((point: any) => {
              const date = new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              byDate[date] = point.value;
            });
            const dedupedCount = Object.keys(byDate).length;
            const latestTimestamp = sortedPoints[sortedPoints.length - 1]?.timestamp || '';

            return {
              metric,
              points: sortedPoints,
              dedupedCount,
              latestTimestamp,
              priorityIndex: getPriorityIndex(metric.name),
              isHealthcarePriority: getPriorityIndex(metric.name) < HEALTHCARE_PRIORITY.length,
              isLegacyRisk: isLegacyRiskMetric(metric.name),
            };
          })
          .sort((a, b) => {
            const aUsable = a.dedupedCount >= 2 ? 1 : 0;
            const bUsable = b.dedupedCount >= 2 ? 1 : 0;
            if (aUsable !== bUsable) return bUsable - aUsable;

            if (a.isHealthcarePriority !== b.isHealthcarePriority) {
              return a.isHealthcarePriority ? -1 : 1;
            }

            if (a.isLegacyRisk !== b.isLegacyRisk) {
              return a.isLegacyRisk ? 1 : -1;
            }

            const timeDiff = new Date(b.latestTimestamp || 0).getTime() - new Date(a.latestTimestamp || 0).getTime();
            if (timeDiff !== 0) return timeDiff;

            if (a.priorityIndex !== b.priorityIndex) return a.priorityIndex - b.priorityIndex;
            return a.metric.name.localeCompare(b.metric.name);
          });

        const usableOperationalMetrics = rankedMetricsForDisplay.filter(
          (entry) => entry.isHealthcarePriority && entry.dedupedCount >= 2
        );

        const usableNonLegacyMetrics = rankedMetricsForDisplay.filter(
          (entry) => !entry.isLegacyRisk && entry.dedupedCount >= 2
        );

        const metricsForDashboard =
          usableOperationalMetrics.length > 0
            ? usableOperationalMetrics
            : usableNonLegacyMetrics.length > 0
              ? usableNonLegacyMetrics
              : rankedMetricsForDisplay.filter((entry) => entry.dedupedCount >= 2);

        await Promise.all(
          metricsForDashboard.slice(0, 8).map(async ({ metric, points }, idx: number) => {

            if (!points || points.length < 2) return;

            // Deduplicate by date (take last value per day)
            const byDate: Record<string, number> = {};
            points.forEach((p: any) => {
              const date = new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              byDate[date] = p.value;
            });
            const dedupedData = Object.entries(byDate).map(([date, value]) => ({ date, value }));

            if (dedupedData.length < 2) return;

            const values = dedupedData.map(d => d.value);
            const currentValue = values[values.length - 1];
            const prevValue = values[values.length - 2];
            const firstValue = values[0];
            const trendPct = firstValue !== 0 ? ((currentValue - firstValue) / Math.abs(firstValue)) * 100 : 0;
            const trend: 'up' | 'down' | 'stable' = Math.abs(trendPct) < 1 ? 'stable' : trendPct > 0 ? 'up' : 'down';
            const target = Number(metric.target_value) || 85;
            const pctOfTarget = getMetricHealthRatio(metric.name, currentValue, target);
            const status: KPIHealthItem['status'] = pctOfTarget >= 90 ? 'on-track' : pctOfTarget >= 70 ? 'at-risk' : 'critical';
            healthRatios.push(pctOfTarget);

            // Only add to trend series if idx < 4
            if (idx < 4) {
              metricTrendSeries.push({
                metricId: metric.id,
                name: metric.name,
                unit: metric.unit || '',
                targetValue: target,
                color: SERIES_COLORS[idx % SERIES_COLORS.length],
                data: dedupedData,
              });
            }

            const latestProvenance = points[points.length - 1]?.source
              ? String(points[points.length - 1].source)
              : '';
            kpiHealthGrid.push({
              id: metric.id,
              name: metric.name,
              unit: metric.unit || '',
              currentValue,
              targetValue: target,
              trend,
              trendPct,
              status,
              sparkline: values.slice(-8),
              category: metric.category || 'General',
              historyPoints: points.length,
              lastTimestamp: points[points.length - 1]?.timestamp || '',
              evidenceSummary: `${points.length} recent points across ${dedupedData.length} tracked intervals`,
              lineageSummary: metric.category
                ? `Metric history from ${metric.category} KPI tracking`
                : 'Metric history from live SigmaSense tracking',
              provenanceSummary: latestProvenance
                ? latestProvenance
                    .replace('etl:', '')
                    .replace(/:source:[^:]+/, '')
                    .replace(':mapping:', ' · mapping ')
                    .replace(':run:', ' · run ')
                    .replace('pipeline:', 'pipeline ')
                : 'Legacy or manual provenance',
            });
          })
        );

        avgValue = healthRatios.length > 0
          ? healthRatios.reduce((sum, value) => sum + value, 0) / healthRatios.length
          : 0;
      }

      // --- Recent alerts ---
      const { data: recentAlertsData } = await supabase
        .from('alerts')
        .select('id, title, severity, status, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        totalMetrics: metricsCount || 0,
        activeAlerts: alertsCount || 0,
        completedActions: actionsCount || 0,
        avgMetricValue: avgValue,
        activeAnomalies: anomaliesCount || 0,
        pendingRecommendations: pendingRecsCount || 0,
        completedForecasts: forecastsCount || 0,
        recentMetrics,
        recentAlerts: recentAlertsData || [],
        metricTrendSeries,
        kpiHealthGrid,
      });

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    if (!organizationId) return;

    const metricDataChannel = supabase
      .channel('metric_data_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'metric_data', filter: `organization_id=eq.${organizationId}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'metric_data', filter: `organization_id=eq.${organizationId}` }, () => fetchDashboardData())
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      });

    const alertsChannel = supabase
      .channel('alerts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: `organization_id=eq.${organizationId}` }, () => fetchDashboardData())
      .subscribe();

    const 