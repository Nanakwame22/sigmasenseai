import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/AuthContext';
import { createAlertsFromAnomalies } from '../../../../services/anomalyAlertBridge';
import { addToast } from '../../../../hooks/useToast';

interface AnomalyFeedItem {
  id: string;
  metric_id: string | null;
  anomaly_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detected_at: string;
  value: number;
  expected_value: number | null;
  deviation: number | null;
  confidence_score: number | null;
  status: string;
  hasAlert: boolean;
  metric?: { name: string; unit: string | null };
}

interface AnomalyFeedPanelProps {
  onAlertsCreated: () => void;
}

const SEV_CONFIG = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', icon: 'ri-alarm-warning-line' },
  high:     { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500', icon: 'ri-alert-line' },
  medium:   { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', icon: 'ri-error-warning-line' },
  low:      { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-500', icon: 'ri-information-line' },
};

export default function AnomalyFeedPanel({ onAlertsCreated }: AnomalyFeedPanelProps) {
  const { organization } = useAuth();
  const [anomalies, setAnomalies] = useState<AnomalyFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const fetchAnomalies = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return; }

    try {
      // Fetch active anomalies
      const { data: rawAnomalies, error } = await supabase
        .from('anomalies')
        .select('*, metric:metrics(name, unit)')
        .eq('organization_id', organization.id)
        .in('status', ['new', 'acknowledged'])
        .order('detected_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      if (!rawAnomalies?.length) { setAnomalies([]); setLoading(false); return; }

      // Check which ones already have alerts
      const ids = rawAnomalies.map(a => a.id);
      const { data: existingAlerts } = await supabase
        .from('alerts')
        .select('anomaly_source_id')
        .in('anomaly_source_id', ids);

      const alertedSet = new Set((existingAlerts || []).map(a => a.anomaly_source_id));

      const items: AnomalyFeedItem[] = rawAnomalies.map(a => ({
        ...a,
        hasAlert: alertedSet.has(a.id),
      }));

      setAnomalies(items);
    } catch (err) {
      console.error('AnomalyFeedPanel fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => { fetchAnomalies(); }, [fetchAnomalies]);

  // Real-time: re-fetch when anomalies table changes
  useEffect(() => {
    if (!organization?.id) return;
    const channel = supabase
      .channel('anomaly-feed-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'anomalies',
        filter: `organization_id=eq.${organization.id}`,
      }, () => { fetchAnomalies(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organization, fetchAnomalies]);

  const handleCreateSingle = async (anomaly: AnomalyFeedItem) => {
    if (!organization?.id) return;
    setCreatingId(anomaly.id);
    try {
      const result = await createAlertsFromAnomalies(organization.id, [anomaly.id]);
      if (result.created > 0) {
        addToast('Alert created from anomaly', 'success');
        onAlertsCreated();
        await fetchAnomalies();
      } else if (result.skipped > 0) {
        addToast('Alert already exists for this anomaly', 'info');
      } else {
        addToast('Failed to create alert', 'error');
      }
    } catch {
      addToast('Failed to create alert', 'error');
    } finally {
      setCreatingId(null);
    }
  };

  const handleSyncAll = async () => {
    if (!organization?.id) return;
    const unalerted = anomalies.filter(a => !a.hasAlert).map(a => a.id);
    if (!unalerted.length) { addToast('All anomalies already have alerts', 'info'); return; }

    setSyncing(true);
    try {
      const result = await createAlertsFromAnomalies(organization.id, unalerted);
      if (result.created > 0) {
        addToast(`${result.created} alert${result.created > 1 ? 's' : ''} created from anomalies`, 'success');
        onAlertsCreated();
        await fetchAnomalies();
      } else {
        addToast('No new alerts to create', 'info');
      }
    } catch {
      addToast('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const unalertedCount = anomalies.filter(a => !a.hasAlert).length;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!anomalies.length) return null;

  return (
    <div className="bg-white rounded-xl border border-amber-200 mb-4 overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <i className="ri-radar-line text-amber-600 text-base"></i>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-amber-900">Live Anomaly Feed</span>
              {unalertedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-200 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
                  {unalertedCount} without alert
                </span>
              )}
            </div>
            <p className="text-xs text-amber-700">{anomalies.length} active anomal{anomalies.length === 1 ? 'y' : 'ies'} — alerts auto-created on detection</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unalertedCount > 0 && (
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {syncing
                ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Syncing...</>
                : <><i className="ri-refresh-line text-sm" />Sync All ({unalertedCount})</>
              }
            </button>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
          >
            <i className={`ri-arrow-${collapsed ? 'down' : 'up'}-s-line text-amber-700 text-base`}></i>
          </button>
        </div>
      </div>

      {/* Anomaly List */}
      {!collapsed && (
        <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {anomalies.map(anomaly => {
            const sev = SEV_CONFIG[anomaly.severity] || SEV_CONFIG.medium;
            const deviationPct = anomaly.deviation != null && anomaly.expected_value
              ? Math.abs((anomaly.deviation / anomaly.expected_value) * 100).toFixed(1)
              : null;
            const isCreating = creatingId === anomaly.id;

            return (
              <div key={anomaly.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                {/* Severity dot */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sev.bg} border ${sev.border}`}>
                  <i className={`${sev.icon} ${sev.text} text-sm`}></i>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {anomaly.metric?.name ?? 'Unknown Metric'}
                    </span>
                    <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${sev.bg} ${sev.text} border ${sev.border}`}>
                      {anomaly.severity}
                    </span>
                    <span className="text-xs text-gray-500 capitalize bg-gray-100 px-1.5 py-0.5 rounded">
                      {anomaly.anomaly_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500">
                      Value: <strong className="text-gray-700">{anomaly.value.toFixed(2)}</strong>
                      {anomaly.metric?.unit ? ` ${anomaly.metric.unit}` : ''}
                    </span>
                    {deviationPct && (
                      <span className={`text-xs font-medium ${anomaly.deviation! > 0 ? 'text-red-600' : 'text-teal-600'}`}>
                        {anomaly.deviation! > 0 ? '+' : '-'}{deviationPct}% deviation
                      </span>
                    )}
                    {anomaly.confidence_score != null && (
                      <span className="text-xs text-gray-400">
                        {Math.round(anomaly.confidence_score * 100)}% confidence
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(anomaly.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Alert status / action */}
                <div className="flex-shrink-0">
                  {anomaly.hasAlert ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                      <i className="ri-checkbox-circle-fill text-sm"></i>
                      Alert created
                    </span>
                  ) : (
                    <button
                      onClick={() => handleCreateSingle(anomaly)}
                      disabled={isCreating}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      {isCreating
                        ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating...</>
                        : <><i className="ri-alarm-warning-line text-sm" />Create Alert</>
                      }
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
