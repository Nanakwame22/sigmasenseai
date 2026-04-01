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
      const { data: metricData } = await supabase
        .from('metric_data')
        .select('value')
        .eq('organization_id', organizationId)
        .order('timestamp', { ascending: false })
        .limit(100);

      const avgValue = metricData && metricData.length > 0
        ? metricData.reduce((sum, d) => sum + (d.value || 0), 0) / metricData.length
        : 0;

      // --- Recent metrics ---
      const { data: recentMetricsData } = await supabase
        .from('metric_data')
        .select('id, value, timestamp, metrics(id, name, unit)')
        .eq('organization_id', organizationId)
        .order('timestamp', { ascending: false })
        .limit(5);

      const recentMetrics = (recentMetricsData || []).map((d: any) => ({
        id: d.id,
        name: d.metrics?.name || 'Unknown',
        value: d.value,
        timestamp: d.timestamp,
        unit: d.metrics?.unit || '',
      }));

      // --- Recent alerts ---
      const { data: recentAlertsData } = await supabase
        .from('alerts')
        .select('id, title, severity, status, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(5);

      // --- Metrics with data for trend chart & KPI grid ---
      const { data: metricsWithData } = await supabase
        .from('metrics')
        .select('id, name, unit, target_value, category')
        .eq('organization_id', organizationId);

      const metricTrendSeries: MetricTrendSeries[] = [];
      const kpiHealthGrid: KPIHealthItem[] = [];

      if (metricsWithData && metricsWithData.length > 0) {
        // Pick up to 4 metrics that have data
        const metricsToFetch = metricsWithData.slice(0, 8);

        await Promise.all(
          metricsToFetch.map(async (metric: any, idx: number) => {
            const { data: points } = await supabase
              .from('metric_data')
              .select('value, timestamp')
              .eq('metric_id', metric.id)
              .eq('organization_id', organizationId)
              .order('timestamp', { ascending: true })
              .limit(30);

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
            const pctOfTarget = target !== 0 ? (currentValue / target) * 100 : 100;
            const status: KPIHealthItem['status'] = pctOfTarget >= 90 ? 'on-track' : pctOfTarget >= 70 ? 'at-risk' : 'critical';

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
            });
          })
        );
      }

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

    const actionsChannel = supabase
      .channel('actions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items', filter: `organization_id=eq.${organizationId}` }, () => fetchDashboardData())
      .subscribe();

    return () => {
      supabase.removeChannel(metricDataChannel);
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(actionsChannel);
      setIsRealtimeConnected(false);
    };
  }, [organizationId]);

  return {
    stats,
    loading,
    error,
    refetch: fetchDashboardData,
    isRealtimeConnected,
    lastUpdated,
  };
}
