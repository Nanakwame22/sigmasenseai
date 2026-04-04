import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { summarizeAIMAlerts, dedupeAIMAlerts } from '../services/aimAlertSummary';
import { summarizeAIMTrackedWorkRecords } from '../services/aimTrackedWorkSummary';

interface AIMStats {
  dataSourcesCount: number;
  lastRefreshTime: Date | null;
  recommendationsCount: number;
  actionCenterCount: number;
  predictiveAlertsCount: number;
  predictiveAlertsNewCount: number;
  aiConfidence: number;
  evidenceCoverage: number;
  evidenceSignals: number;
  decisionReadiness: 'Monitor only' | 'Directional' | 'Needs review' | 'Action-ready';
  predictedImpact: number;
  alertLeadTime: number;
  loading: boolean;
  error: string | null;
  // real-time pulse flags — flip true briefly when a new item arrives
  recommendationsPulse: boolean;
  alertsPulse: boolean;
  actionPulse: boolean;
}

export const useAIMData = () => {
  const { user, organization } = useAuth();
  const [stats, setStats] = useState<AIMStats>({
    dataSourcesCount: 0,
    lastRefreshTime: null,
    recommendationsCount: 0,
    actionCenterCount: 0,
    predictiveAlertsCount: 0,
    predictiveAlertsNewCount: 0,
    aiConfidence: 0,
    evidenceCoverage: 0,
    evidenceSignals: 0,
    decisionReadiness: 'Monitor only',
    predictedImpact: 0,
    alertLeadTime: 0,
    loading: true,
    error: null,
    recommendationsPulse: false,
    alertsPulse: false,
    actionPulse: false,
  });

  const triggerPulse = useCallback((key: 'recommendationsPulse' | 'alertsPulse' | 'actionPulse') => {
    setStats(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setStats(prev => ({ ...prev, [key]: false })), 1500);
  }, []);

  const fetchAIMStats = useCallback(async (orgId: string) => {
    try {
      setStats(prev => ({ ...prev, loading: true, error: null }));

      const [
        { count: dataSourcesCount },
        { data: latestMetricData },
        { count: recommendationsCount },
        { data: actionItemsData },
        { data: dmaicProjectsData },
        { data: kaizenItemsData },
        { data: recommendationsData },
        { data: impactRecommendations },
        { data: projectSavings },
        { data: alertsData },
        { data: forecastAccuracies },
      ] = await Promise.all([
        supabase
          .from('data_sources')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'active'),
        supabase
          .from('metric_data')
          .select('timestamp')
          .eq('organization_id', orgId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('recommendations')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .in('status', ['pending', 'in_progress']),
        supabase
          .from('action_items')
          .select('id, status, impact_score')
          .eq('organization_id', orgId),
        supabase
          .from('dmaic_projects')
          .select('id, status, expected_savings')
          .eq('organization_id', orgId),
        supabase
          .from('kaizen_items')
          .select('id, status, estimated_savings')
          .eq('organization_id', orgId),
        supabase
          .from('recommendations')
          .select('confidence_score')
          .eq('organization_id', orgId)
          .in('status', ['pending', 'in_progress', 'completed']),
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
        supabase
          .from('alerts')
          .select('id, metric_id, title, description, severity, alert_type, status, category, actions, confidence, days_until, created_at')
          .eq('organization_id', orgId)
          .in('status', ['new', 'acknowledged', 'resolved', 'dismissed', 'snoozed']),
        supabase
          .from('forecasts')
          .select('accuracy')
          .eq('organization_id', orgId)
          .not('accuracy', 'is', null)
          .order('created_at', { ascending: false })
          .limit(12),
      ]);

      const trackedWorkSummary = summarizeAIMTrackedWorkRecords({
        actionItems: actionItemsData || [],
        dmaicProjects: dmaicProjectsData || [],
        kaizenItems: kaizenItemsData || [],
      });

      const avgRecommendationConfidence =
        recommendationsData && recommendationsData.length > 0
          ? recommendationsData.reduce((sum, r) => sum + (r.confidence_score || 0), 0) /
            recommendationsData.length
          : 0;

      const avgForecastConfidence =
        forecastAccuracies && forecastAccuracies.length > 0
          ? forecastAccuracies.reduce((sum, forecast) => sum + (forecast.accuracy || 0), 0) /
            forecastAccuracies.length
          : 0;

      const avgConfidence = avgRecommendationConfidence || avgForecastConfidence || 0;

      const recommendationsImpact =
        impactRecommendations?.reduce((sum, r) => sum + (r.impact_score || 0), 0) || 0;
      const projectsImpact =
        projectSavings?.reduce((sum, p) => sum + (p.expected_savings || 0), 0) || 0;
      const totalPredictedImpact = recommendationsImpact * 1000 + projectsImpact;

      const alertSummary = summarizeAIMAlerts((alertsData as any[]) || []);
      const groupedAlerts = dedupeAIMAlerts((alertsData as any[]) || []);
      const activeLeadWindowAlerts = groupedAlerts.filter(
        (alert) =>
          alert.status !== 'resolved' &&
          alert.status !== 'dismissed' &&
          typeof alert.days_until === 'number' &&
          Number.isFinite(alert.days_until)
      );

      const avgLeadTime =
        activeLeadWindowAlerts.length > 0
          ? activeLeadWindowAlerts.reduce((sum, a) => sum + (a.days_until || 0), 0) / activeLeadWindowAlerts.length
          : 0;

      const hasFreshMetrics = Boolean(latestMetricData?.timestamp);
      const liveSignalCount = [
        (dataSourcesCount || 0) > 0,
        hasFreshMetrics,
        (recommendationsCount || 0) > 0,
        trackedWorkSummary.total > 0,
        alertSummary.active > 0,
      ].filter(Boolean).length;

      const evidenceCoverage = Math.round((liveSignalCount / 5) * 100);
      const freshnessAgeHours = latestMetricData?.timestamp
        ? (Date.now() - new Date(latestMetricData.timestamp).getTime()) / 3600000
        : Number.POSITIVE_INFINITY;

      const decisionReadiness: AIMStats['decisionReadiness'] =
        avgConfidence >= 80 && freshnessAgeHours <= 24 && ((recommendationsCount || 0) > 0 || alertSummary.active > 0)
          ? 'Action-ready'
          : avgConfidence >= 65 && ((recommendationsCount || 0) > 0 || alertSummary.active > 0)
            ? 'Needs review'
            : liveSignalCount >= 3
              ? 'Directional'
              : 'Monitor only';

      setStats(prev => ({
        ...prev,
        dataSourcesCount: dataSourcesCount || 0,
        lastRefreshTime: latestMetricData?.timestamp
          ? new Date(latestMetricData.timestamp)
          : null,
        recommendationsCount: recommendationsCount || 0,
        actionCenterCount: trackedWorkSummary.total,
        predictiveAlertsCount: alertSummary.active,
        predictiveAlertsNewCount: alertSummary.new,
        aiConfidence: Math.round(avgConfidence),
        evidenceCoverage,
        evidenceSignals: liveSignalCount,
        decisionReadiness,
        predictedImpact: Math.round(totalPredictedImpact),
        alertLeadTime: Math.round(avgLeadTime),
        loading: false,
        error: null,
      }));
    } catch (error) {
      console.error('Error fetching AIM stats:', error);
      setStats(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load AIM statistics',
      }));
    }
  }, []);

  useEffect(() => {
    const orgId = organization?.id;
    if (!orgId) {
      setStats(prev => ({ ...prev, loading: false }));
      return;
    }

    fetchAIMStats(orgId);

    // ── Real-time subscriptions ──────────────────────────────────────────────

    // Alerts channel
    const alertsChannel = supabase
      .channel('aim-alerts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts', filter: `organization_id=eq.${orgId}` },
        () => {
          fetchAIMStats(orgId);
          triggerPulse('alertsPulse');
        }
      )
      .subscribe();

    // Recommendations channel
    const recsChannel = supabase
      .channel('aim-recommendations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recommendations' },
        () => {
          fetchAIMStats(orgId);
          triggerPulse('recommendationsPulse');
        }
      )
      .subscribe();

    // Action items channel
    const actionChannel = supabase
      .channel('aim-action-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_items', filter: `organization_id=eq.${orgId}` },
        () => {
          fetchAIMStats(orgId);
          triggerPulse('actionPulse');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dmaic_projects', filter: `organization_id=eq.${orgId}` },
        () => {
          fetchAIMStats(orgId);
          triggerPulse('actionPulse');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kaizen_items', filter: `organization_id=eq.${orgId}` },
        () => {
          fetchAIMStats(orgId);
          triggerPulse('actionPulse');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(recsChannel);
      supabase.removeChannel(actionChannel);
    };
  }, [organization?.id, fetchAIMStats, triggerPulse]);

  return stats;
};
