import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getAlerts,
  acknowledgeAlert,
  snoozeAlert,
  resolveAlert,
  dismissAlert,
  monitorMetricsForAlerts,
  saveAlerts,
  reactivateSnoozedAlerts,
  getAlertPreferences,
  saveAlertPreferences,
} from '../../../services/alertMonitoring';
import type { Alert, AlertPreferences } from '../../../services/alertMonitoring';
import {
  dedupeAIMAlerts,
  getAIMAlertReadiness,
  normalizeAIMAlert,
  summarizeAIMAlerts,
} from '../../../services/aimAlertSummary';
import { getIntelligenceConfidenceState } from '../../../services/intelligenceContract';
import { addToast } from '../../../hooks/useToast';
import { AIMEmptyState, AIMMetricTiles, AIMPanel, AIMSectionIntro } from './AIMSectionSystem';

function formatRelativeTime(timestamp?: string) {
  if (!timestamp) return 'Freshness pending';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just updated';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just updated';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

const alertLineage: Record<string, string> = {
  critical: 'Metric thresholds/anomaly pressure → alert engine → response queue',
  high: 'Emerging metric pressure → alert engine → response queue',
  medium: 'Watch-range signal movement → alert engine → response queue',
  low: 'Informational monitoring signal → alert engine → response queue',
};

const getAlertReadiness = (alert: Alert) => {
  const readiness = getAIMAlertReadiness(alert);
  if (readiness === 'Action-ready') {
    return { label: 'Action-ready', tone: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }
  if (readiness === 'Needs review') {
    return { label: 'Needs review', tone: 'bg-amber-100 text-amber-700 border-amber-200' };
  }
  return {
    label: readiness,
    tone: 'bg-sky-100 text-sky-700 border-sky-200',
  };
};

export default function PredictiveAlertsPanel() {
  const { organization, organizationId } = useAuth();

  // Resolve org ID from either source — whichever is available first
  const orgId = organization?.id ?? organizationId ?? null;

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'new' | 'acknowledged' | 'resolved'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    acknowledged: 0,
    resolved: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    actionReady: 0,
    needsReview: 0,
    unacknowledged: 0,
    active: 0,
  });
  const [showPreferences, setShowPreferences] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [preferences, setPreferences] = useState<AlertPreferences>({
    organization_id: orgId || '',
    email_enabled: true,
    in_app_enabled: true,
    sms_enabled: false,
    slack_enabled: false,
    frequency: 'realtime',
    critical_always: true
  });
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [evidenceAlertId, setEvidenceAlertId] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) {
      void loadData();
      loadPreferences();

      // Sync preferences org_id once resolved
      setPreferences(prev => ({ ...prev, organization_id: orgId }));

      const interval = setInterval(() => {
        void loadData();
      }, 5 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;

    try {
      setLoading(true);

      const fetchedAlerts = await getAlerts(orgId);
      const canonicalAlerts = dedupeAIMAlerts((fetchedAlerts || []).map(normalizeAIMAlert));

      setAlerts(canonicalAlerts);
      setStats(summarizeAIMAlerts(canonicalAlerts));
      setLoading(false);

      void refreshAlertSignals();
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshAlertSignals = async () => {
    if (!orgId) return;

    try {
      await reactivateSnoozedAlerts(orgId);

      const newAlerts = await monitorMetricsForAlerts(orgId);
      if (newAlerts.length > 0) {
        await saveAlerts(newAlerts);

        const refreshedAlerts = await getAlerts(orgId);
        const canonicalAlerts = dedupeAIMAlerts((refreshedAlerts || []).map(normalizeAIMAlert));

        setAlerts(canonicalAlerts);
        setStats(summarizeAIMAlerts(canonicalAlerts));
      }
    } catch (error) {
      console.error('Error refreshing predictive alert signals:', error);
    }
  };

  const loadPreferences = async () => {
    if (!orgId) return;

    try {
      const prefs = await getAlertPreferences(orgId);
      if (prefs) {
        setPreferences(prefs);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
      await loadData();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      addToast('Failed to acknowledge alert', 'error');
    }
  };

  const handleSnooze = async (alertId: string, hours: number = 24) => {
    try {
      await snoozeAlert(alertId, hours);
      await loadData();
    } catch (error) {
      console.error('Error snoozing alert:', error);
      addToast('Failed to snooze alert', 'error');
    }
  };

  const handleResolve = async (alertId: string, notes?: string) => {
    try {
      await resolveAlert(alertId, notes);
      setSelectedAlert(null);
      setResolutionNotes('');
      await loadData();
    } catch (error) {
      console.error('Error resolving alert:', error);
      addToast('Failed to resolve alert', 'error');
    }
  };

  const handleDismiss = async (alertId: string) => {
    try {
      await dismissAlert(alertId);
      await loadData();
    } catch (error) {
      console.error('Error dismissing alert:', error);
      addToast('Failed to dismiss alert', 'error');
    }
  };

  const handleSavePreferences = async () => {
    try {
      if (!orgId) {
        addToast('Organization not found for alert preferences', 'error');
        return;
      }

      if (!preferences.email_enabled && !preferences.in_app_enabled && !preferences.sms_enabled && !preferences.slack_enabled) {
        addToast('Enable at least one notification channel before saving preferences', 'warning');
        return;
      }

      await saveAlertPreferences(preferences);
      setShowPreferences(false);
      addToast('Preferences saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving preferences:', error);
      addToast('Failed to save preferences', 'error');
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'critical':
        return 'from-red-500 to-orange-500';
      case 'warning':
        return 'from-orange-500 to-yellow-500';
      case 'info':
        return 'from-blue-500 to-cyan-500';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getAlertBg = (type: string) => {
    switch (type) {
      case 'critical':
        return 'from-red-50 to-orange-50 border-red-200';
      case 'warning':
        return 'from-orange-50 to-yellow-50 border-orange-200';
      case 'info':
        return 'from-blue-50 to-cyan-50 border-blue-200';
      default:
        return 'from-gray-50 to-gray-100 border-gray-200';
    }
  };

  const filteredAlerts = alerts.filter(a => {
    const matchesStatus = filter === 'all' || a.status === filter;
    const matchesSeverity = severityFilter === 'all' || a.severity === severityFilter;
    return matchesStatus && matchesSeverity;
  });

  const filterTheme = (value: typeof filter, activeClass: string) =>
    filter === value ? activeClass : 'bg-slate-100 text-slate-700 hover:bg-slate-200';

  const severityTheme = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
  } as const;

  const statusTheme = {
    new: 'bg-blue-100 text-blue-700',
    acknowledged: 'bg-amber-100 text-amber-700',
    resolved: 'bg-emerald-100 text-emerald-700',
    dismissed: 'bg-slate-100 text-slate-700',
  } as const;

  const hasLeadTime = (alert: Alert) => typeof alert.days_until === 'number' && Number.isFinite(alert.days_until);

  const getLeadWindow = (alert: Alert) => hasLeadTime(alert) ? `${alert.days_until} days` : 'Monitoring';

  const getEvidenceSummary = (alert: Alert) => {
    const parts = [
      alert.confidence ? `${Math.round(alert.confidence)}% confidence` : null,
      hasLeadTime(alert) ? `${alert.days_until} day lead time` : null,
      alert.actions?.length ? `${alert.actions.length} recommended actions` : null,
    ].filter(Boolean);

    return parts.length > 0
      ? parts.join(' • ')
      : 'Confidence and lead-time evidence will strengthen as more operational history accumulates.';
  };

  return (
    <div className="space-y-6">
      <AIMSectionIntro
        eyebrow="Predictive Alerts"
        title="Operational Early Warning Center"
        description="Monitor emerging risk, manage notification posture, and act on high-confidence signals before they become operational incidents."
        actions={
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium whitespace-nowrap flex items-center gap-2"
            >
              <i className={`ri-refresh-line ${refreshing ? 'animate-spin' : ''}`}></i>
              Refresh
            </button>
            <button
              onClick={() => setShowPreferences(true)}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium whitespace-nowrap flex items-center gap-2"
            >
              <i className="ri-settings-3-line"></i>
              Settings
            </button>
          </div>
        }
      />

      <AIMMetricTiles
        items={[
          { label: 'Active Alert Groups', value: stats.active, detail: `${stats.total} grouped signals in the visible queue`, accent: 'text-red-600' },
          { label: 'Needs Review', value: stats.needsReview, detail: 'Signals that should be reviewed before response', accent: 'text-orange-600' },
          { label: 'Unacknowledged', value: stats.unacknowledged, detail: 'Still waiting for review', accent: 'text-blue-600' },
          { label: 'Resolved', value: stats.resolved, detail: 'Closed successfully', accent: 'text-emerald-600' },
        ]}
      />

      <AIMPanel
        title="Alert Stream"
        description="Filter by workflow state and severity to focus response effort where it matters most."
        icon="ri-radar-line"
        accentClass="from-red-500 to-orange-600"
      >
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterTheme('all', 'bg-slate-900 text-white')}`}
              >
                All ({stats.total})
              </button>
              <button
                onClick={() => setFilter('new')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterTheme('new', 'bg-blue-600 text-white')}`}
              >
                New ({stats.new})
              </button>
              <button
                onClick={() => setFilter('acknowledged')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterTheme('acknowledged', 'bg-amber-500 text-white')}`}
              >
                Acknowledged ({stats.acknowledged})
              </button>
              <button
                onClick={() => setFilter('resolved')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterTheme('resolved', 'bg-emerald-600 text-white')}`}
              >
                Resolved ({stats.resolved})
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {severityFilter === 'all' ? 'All severities' : `${severityFilter} only`}
              </div>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              >
                <option value="all">All Severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {loading && filteredAlerts.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/90 p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-teal-500 border-t-transparent animate-spin"></div>
              <div className="mt-5 text-base font-semibold text-slate-900">Analyzing data and generating alerts</div>
              <p className="mt-2 text-sm text-slate-600">
                AIM is checking live metrics, anomalies, and recent alert history. Existing alerts will appear here as soon as the stream is ready.
              </p>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <AIMEmptyState
              icon="ri-checkbox-circle-line"
              title="All clear"
              description={`No ${filter !== 'all' ? filter : ''} alerts are active right now. AIM is not seeing any immediate operating pressure in the monitored signal set.`}
            />
          ) : (
            <div className="space-y-4">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-gradient-to-br ${getAlertBg(alert.alert_type)} rounded-[24px] border p-6 shadow-sm transition-all hover:shadow-md`}
                >
                  {(() => {
                    const readiness = getAlertReadiness(alert);
                    const showEvidence = evidenceAlertId === alert.id;
                    return (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),220px]">
                    <div className="min-w-0">
                      <div className="flex items-start gap-4">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${getAlertColor(alert.alert_type)}`}>
                          <i className={`${
                            alert.alert_type === 'critical' ? 'ri-error-warning-line' :
                            alert.alert_type === 'warning' ? 'ri-alert-line' :
                            'ri-information-line'
                          } text-2xl text-white`}></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-900">{alert.title}</h3>
                            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${severityTheme[alert.severity]}`}>
                              {alert.severity.toUpperCase()}
                            </span>
                            {alert.category && (
                              <span className="px-3 py-1 bg-white text-slate-700 text-xs font-semibold rounded-full border border-slate-300">
                                {alert.category}
                              </span>
                            )}
                            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusTheme[alert.status]}`}>
                              {alert.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm leading-7 text-slate-700">{alert.description}</p>
                        </div>
                      </div>

                      {(alert.predicted_date || hasLeadTime(alert) || alert.confidence) && (
                        <div className={`mt-4 grid gap-3 ${alert.predicted_date && hasLeadTime(alert) && alert.confidence ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                          {alert.predicted_date && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <div className="text-xs text-slate-600 mb-1">Predicted Date</div>
                              <div className="text-sm font-bold text-slate-900">
                                {new Date(alert.predicted_date).toLocaleDateString()}
                              </div>
                            </div>
                          )}
                          {hasLeadTime(alert) && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <div className="text-xs text-slate-600 mb-1">Days Until</div>
                              <div className="text-sm font-bold text-red-600">{getLeadWindow(alert)}</div>
                            </div>
                          )}
                          {alert.confidence && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <div className="text-xs text-slate-600 mb-1">Confidence</div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-bold text-slate-900">{Math.round(alert.confidence)}%</div>
                                <div className="flex-1 rounded-full bg-slate-200 h-2">
                                  <div
                                    className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500"
                                    style={{ width: `${alert.confidence}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                            Freshness: {formatRelativeTime((alert as any).updated_at || alert.created_at)}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${readiness.tone}`}>
                            {readiness.label}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                            Trigger: {alert.category || alert.severity}
                          </span>
                          <button
                            onClick={() => setEvidenceAlertId(showEvidence ? null : alert.id)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            {showEvidence ? 'Hide evidence' : 'Open evidence'}
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-slate-500">
                          Evidence: {getEvidenceSummary(alert)}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-400">
                          Lineage: {alertLineage[alert.severity] || 'Metric monitoring → alert engine → response queue'}
                        </p>
                      </div>

                      {showEvidence && (
                        <div className="mt-4 rounded-[24px] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-5 space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${readiness.tone}`}>
                              Decision Readiness: {readiness.label}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                              Confidence basis: {getIntelligenceConfidenceState(alert.confidence || 0)} ({Math.round(alert.confidence || 0)}%)
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                              Lead window: {getLeadWindow(alert)}
                            </span>
                          </div>
                          <div className="grid gap-4 lg:grid-cols-3">
                            <div className="rounded-2xl border border-white/70 bg-white/90 p-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Why AIM raised this</div>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                AIM detected a threshold or directional signal change that suggests this condition may worsen if the current trend continues.
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/70 bg-white/90 p-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Evidence window</div>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                Latest alert evidence refreshed {formatRelativeTime((alert as any).updated_at || alert.created_at)} with lineage from the alert engine, monitored metric movement, and response-state tracking.
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/70 bg-white/90 p-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Operator guidance</div>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                {readiness.label === 'Action-ready'
                                  ? 'This signal is strong enough to move into response actions immediately.'
                                  : readiness.label === 'Needs review'
                                    ? 'Review the local operating context and acknowledge or route this signal before acting.'
                                    : 'Use this as an early warning while AIM gathers more confirming evidence.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {alert.actions && alert.actions.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-2 text-xs font-semibold text-slate-700 uppercase tracking-[0.16em]">Recommended Actions</div>
                          <div className="space-y-2">
                            {alert.actions.map((action, index) => (
                              <div key={index} className="flex items-center space-x-2">
                                <i className="ri-checkbox-circle-line text-green-600"></i>
                                <span className="text-sm text-slate-700">{action}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {alert.resolution_notes && (
                        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-3">
                          <div className="text-xs font-semibold text-green-900 mb-1 uppercase tracking-[0.16em]">Resolution Notes</div>
                          <div className="text-sm text-green-700">{alert.resolution_notes}</div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Response actions</div>
                      <div className="mt-4 flex flex-col gap-2">
                        {alert.status === 'new' && (
                          <>
                            <button 
                              onClick={() => handleAcknowledge(alert.id)}
                              className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl hover:from-teal-700 hover:to-cyan-700 transition-all text-sm font-medium whitespace-nowrap"
                            >
                              Acknowledge
                            </button>
                            <button 
                              onClick={() => handleSnooze(alert.id, 24)}
                              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium whitespace-nowrap"
                            >
                              Snooze 24h
                            </button>
                          </>
                        )}
                        {(alert.status === 'new' || alert.status === 'acknowledged') && (
                          <button 
                            onClick={() => setSelectedAlert(alert)}
                            className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-medium whitespace-nowrap"
                          >
                            Resolve
                          </button>
                        )}
                        <button 
                          onClick={() => handleDismiss(alert.id)}
                          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium whitespace-nowrap"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      </AIMPanel>

      {/* Resolve Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Resolve Alert</h2>
              <button
                onClick={() => setSelectedAlert(null)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">{selectedAlert.title}</p>
              <label className="block text-sm font-medium text-gray-700 mb-2">Resolution Notes</label>
              <textarea
                rows={4}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                placeholder="Describe how this alert was resolved..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedAlert(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleResolve(selectedAlert.id, resolutionNotes);
                }}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preferences Modal */}
      {showPreferences && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-teal-500 to-cyan-500 rounded-lg">
                  <i className="ri-notification-3-line text-xl text-white"></i>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Notification Preferences</h3>
                  <p className="text-sm text-gray-600">Configure how you receive alerts</p>
                </div>
              </div>
              <button
                onClick={() => setShowPreferences(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Alert Channels</h4>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={preferences.email_enabled}
                    onChange={(e) => setPreferences({ ...preferences, email_enabled: e.target.checked })}
                    className="w-5 h-5 text-teal-600 rounded cursor-pointer" 
                  />
                  <div className="flex items-center space-x-2">
                    <i className="ri-mail-line text-gray-600"></i>
                    <span className="text-sm text-gray-700">Email notifications</span>
                  </div>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={preferences.in_app_enabled}
                    onChange={(e) => setPreferences({ ...preferences, in_app_enabled: e.target.checked })}
                    className="w-5 h-5 text-teal-600 rounded cursor-pointer" 
                  />
                  <div className="flex items-center space-x-2">
                    <i className="ri-notification-line text-gray-600"></i>
                    <span className="text-sm text-gray-700">In-app notifications</span>
                  </div>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={preferences.sms_enabled}
                    onChange={(e) => setPreferences({ ...preferences, sms_enabled: e.target.checked })}
                    className="w-5 h-5 text-teal-600 rounded cursor-pointer" 
                  />
                  <div className="flex items-center space-x-2">
                    <i className="ri-message-3-line text-gray-600"></i>
                    <span className="text-sm text-gray-700">SMS alerts (critical only)</span>
                  </div>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={preferences.slack_enabled}
                    onChange={(e) => setPreferences({ ...preferences, slack_enabled: e.target.checked })}
                    className="w-5 h-5 text-teal-600 rounded cursor-pointer" 
                  />
                  <div className="flex items-center space-x-2">
                    <i className="ri-slack-line text-gray-600"></i>
                    <span className="text-sm text-gray-700">Slack integration</span>
                  </div>
                </label>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Alert Frequency</h4>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="radio" 
                    name="frequency" 
                    checked={preferences.frequency === 'realtime'}
                    onChange={() => setPreferences({ ...preferences, frequency: 'realtime' })}
                    className="w-5 h-5 text-teal-600 cursor-pointer" 
                  />
                  <span className="text-sm text-gray-700">Real-time (as they occur)</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="radio" 
                    name="frequency" 
                    checked={preferences.frequency === 'daily'}
                    onChange={() => setPreferences({ ...preferences, frequency: 'daily' })}
                    className="w-5 h-5 text-teal-600 cursor-pointer" 
                  />
                  <span className="text-sm text-gray-700">Daily digest (9:00 AM)</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="radio" 
                    name="frequency" 
                    checked={preferences.frequency === 'weekly'}
                    onChange={() => setPreferences({ ...preferences, frequency: 'weekly' })}
                    className="w-5 h-5 text-teal-600 cursor-pointer" 
                  />
                  <span className="text-sm text-gray-700">Weekly summary (Monday)</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={preferences.critical_always}
                    onChange={(e) => setPreferences({ ...preferences, critical_always: e.target.checked })}
                    className="w-5 h-5 text-teal-600 rounded cursor-pointer" 
                  />
                  <span className="text-sm text-gray-700">Always notify for critical alerts</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-6 border-t border-gray-200">
              <button 
                onClick={() => setShowPreferences(false)}
                className="flex-1 px-6 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium whitespace-nowrap"
              >
                Cancel
              </button>
              <button 
                onClick={handleSavePreferences}
                className="flex-1 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium whitespace-nowrap"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
