import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getAlerts,
  acknowledgeAlert,
  snoozeAlert,
  resolveAlert,
  dismissAlert,
  getAlertStats,
  monitorMetricsForAlerts,
  saveAlerts,
  reactivateSnoozedAlerts,
  getAlertPreferences,
  saveAlertPreferences,
} from '../../../services/alertMonitoring';
import type { Alert, AlertPreferences } from '../../../services/alertMonitoring';
import { addToast } from '../../../hooks/useToast';

export default function PredictiveAlertsPanel() {
  const { organization, organizationId } = useAuth();
  const orgId = organization?.id ?? organizationId ?? null;

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'new' | 'acknowledged' | 'resolved'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [stats, setStats] = useState({ total: 0, new: 0, acknowledged: 0, resolved: 0, critical: 0, high: 0, medium: 0, low: 0 });
  const [showPreferences, setShowPreferences] = useState(false);
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

  useEffect(() => {
    if (orgId) {
      loadData();
      loadPreferences();
      setPreferences(prev => ({ ...prev, organization_id: orgId }));
      const interval = setInterval(loadData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      await reactivateSnoozedAlerts(orgId);
      const newAlerts = await monitorMetricsForAlerts(orgId);
      if (newAlerts.length > 0) await saveAlerts(newAlerts);
      const fetchedAlerts = await getAlerts(orgId, {
        status: filter !== 'all' ? filter : undefined,
        severity: severityFilter !== 'all' ? severityFilter : undefined
      });
      setAlerts(fetchedAlerts);
      setStats(await getAlertStats(orgId));
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPreferences = async () => {
    if (!orgId) return;
    try {
      const prefs = await getAlertPreferences(orgId);
      if (prefs) setPreferences(prefs);
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const handleRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };
  const handleAcknowledge = async (id: string) => { try { await acknowledgeAlert(id); await loadData(); } catch { addToast('Failed to acknowledge alert', 'error'); } };
  const handleSnooze = async (id: string, hours = 24) => { try { await snoozeAlert(id, hours); await loadData(); } catch { addToast('Failed to snooze alert', 'error'); } };
  const handleResolve = async (id: string, notes?: string) => { try { await resolveAlert(id, notes); setSelectedAlert(null); await loadData(); } catch { addToast('Failed to resolve alert', 'error'); } };
  const handleDismiss = async (id: string) => { try { await dismissAlert(id); await loadData(); } catch { addToast('Failed to dismiss alert', 'error'); } };
  const handleSavePreferences = async () => { try { await saveAlertPreferences(preferences); setShowPreferences(false); addToast('Preferences saved!', 'success'); } catch { addToast('Failed to save preferences', 'error'); } };

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case 'critical': return { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700', accent: 'border-l-red-500', icon: 'ri-error-warning-line text-red-500' };
      case 'high':     return { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', accent: 'border-l-orange-500', icon: 'ri-alert-line text-orange-500' };
      case 'medium':   return { bar: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700', accent: 'border-l-amber-400', icon: 'ri-information-line text-amber-500' };
      default:         return { bar: 'bg-sapphire-400', badge: 'bg-sapphire-100 text-sapphire-700', accent: 'border-l-sapphire-400', icon: 'ri-notification-3-line text-sapphire-500' };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':          return 'bg-sapphire-100 text-sapphire-700';
      case 'acknowledged': return 'bg-amber-100 text-amber-700';
      case 'resolved':     return 'bg-emerald-100 text-emerald-700';
      default:             return 'bg-brand-100 text-brand-600';
    }
  };

  const filteredAlerts = alerts.filter(a => {
    const matchesStatus = filter === 'all' || a.status === filter;
    const matchesSeverity = severityFilter === 'all' || a.severity === severityFilter;
    return matchesStatus && matchesSeverity;
  });

  if (loading && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 animate-fade-in">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-ai-400 border-t-transparent rounded-full animate-spin mx-auto mb-4 shadow-glow-sm"></div>
          <p className="text-brand-500 text-sm font-medium">Analyzing data and generating alerts...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Critical', count: stats.critical, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', icon: 'ri-error-warning-line', sub: 'Immediate action' },
    { label: 'High Priority', count: stats.high, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', icon: 'ri-alert-line', sub: 'Plan preventive action' },
    { label: 'New Alerts', count: stats.new, color: 'text-sapphire-600', bg: 'bg-sapphire-50', border: 'border-sapphire-100', icon: 'ri-notification-3-line', sub: 'Unacknowledged' },
    { label: 'Resolved', count: stats.resolved, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', icon: 'ri-checkbox-circle-line', sub: 'Successfully handled' },
  ];

  const filterTabs: { id: typeof filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'new', label: 'New', count: stats.new },
    { id: 'acknowledged', label: 'Acknowledged', count: stats.acknowledged },
    { id: 'resolved', label: 'Resolved', count: stats.resolved },
  ];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header Card ── */}
      <div className="bg-white rounded-premium-lg border border-border shadow-elevation-2 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-red-500 to-orange-500 rounded-premium shadow-elevation-2">
              <i className="ri-alarm-warning-line text-2xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-brand-900 tracking-tight">Predictive Alerts</h2>
              <p className="text-sm text-brand-400">Real-time monitoring and early warnings</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-background border border-border text-brand-600 rounded-premium hover:bg-white hover:border-brand-300 transition-all text-sm font-medium shadow-elevation-1 whitespace-nowrap"
            >
              <i className={`ri-refresh-line ${refreshing ? 'animate-spin' : ''}`}></i>
              Refresh
            </button>
            <button
              onClick={() => setShowPreferences(true)}
              className="flex items-center gap-2 px-4 py-2 bg-background border border-border text-brand-600 rounded-premium hover:bg-white hover:border-brand-300 transition-all text-sm font-medium shadow-elevation-1 whitespace-nowrap"
            >
              <i className="ri-settings-3-line"></i>
              Settings
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {statCards.map((s) => (
            <div key={s.label} className={`${s.bg} rounded-premium p-4 border ${s.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <i className={`${s.icon} ${s.color} text-base`}></i>
                <span className={`text-xs font-semibold ${s.color}`}>{s.label}</span>
              </div>
              <div className={`text-kpi-medium ${s.color} leading-none mb-1`}>{s.count}</div>
              <div className="text-xs text-brand-400">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 rounded-premium text-sm font-medium transition-all whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-brand-900 text-white shadow-elevation-2'
                  : 'bg-background text-brand-500 hover:bg-brand-100 hover:text-brand-700 border border-border'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs ${filter === tab.id ? 'text-brand-300' : 'text-brand-400'}`}>
                ({tab.count})
              </span>
            </button>
          ))}
          <div className="flex-1" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
            className="px-3 py-2 border border-border rounded-premium bg-background focus:ring-2 focus:ring-ai-400 focus:border-transparent text-sm text-brand-700"
          >
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* ── Alert List ── */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-white rounded-premium-lg border border-border shadow-elevation-2 p-12 text-center animate-scale-in">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-checkbox-circle-line text-3xl text-emerald-600"></i>
          </div>
          <h3 className="text-lg font-bold text-brand-900 mb-2">All Clear</h3>
          <p className="text-brand-400 text-sm">No {filter !== 'all' ? filter : ''} alerts at this time. Your operations are running smoothly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const sc = getSeverityConfig(alert.severity);
            return (
              <div
                key={alert.id}
                className={`bg-white rounded-premium-lg border border-border border-l-4 ${sc.accent} shadow-elevation-1 hover:shadow-elevation-3 transition-all p-5`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left content */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 flex items-center justify-center bg-background rounded-premium flex-shrink-0 border border-border">
                      <i className={`${sc.icon} text-xl`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="text-sm font-bold text-brand-900">{alert.title}</h3>
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full uppercase ${sc.badge}`}>
                          {alert.severity}
                        </span>
                        {alert.category && (
                          <span className="px-2 py-0.5 bg-brand-100 text-brand-600 text-xs font-semibold rounded-full">
                            {alert.category}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full uppercase ${getStatusBadge(alert.status)}`}>
                          {alert.status}
                        </span>
                      </div>

                      <p className="text-xs text-brand-500 leading-relaxed mb-3">{alert.description}</p>

                      {(alert.predicted_date || alert.days_until !== undefined || alert.confidence) && (
                        <div className="flex items-center gap-3 mb-3">
                          {alert.predicted_date && (
                            <div className="px-3 py-2 bg-background rounded-premium border border-border">
                              <div className="text-xs text-brand-400 mb-0.5">Predicted Date</div>
                              <div className="text-xs font-bold text-brand-800">{new Date(alert.predicted_date).toLocaleDateString()}</div>
                            </div>
                          )}
                          {alert.days_until !== undefined && (
                            <div className="px-3 py-2 bg-background rounded-premium border border-border">
                              <div className="text-xs text-brand-400 mb-0.5">Days Until</div>
                              <div className="text-xs font-bold text-red-600">{alert.days_until}d</div>
                            </div>
                          )}
                          {alert.confidence && (
                            <div className="px-3 py-2 bg-background rounded-premium border border-border flex items-center gap-2 min-w-[120px]">
                              <div>
                                <div className="text-xs text-brand-400 mb-0.5">Confidence</div>
                                <div className="text-xs font-bold text-brand-800">{Math.round(alert.confidence)}%</div>
                              </div>
                              <div className="flex-1 bg-brand-100 rounded-full h-1.5 ml-1">
                                <div
                                  className="bg-gradient-to-r from-ai-400 to-ai-500 h-1.5 rounded-full"
                                  style={{ width: `${alert.confidence}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {alert.actions && alert.actions.length > 0 && (
                        <div className="bg-background rounded-premium p-3 border border-border">
                          <div className="text-xs font-semibold text-brand-600 mb-2 uppercase tracking-wide">Recommended Actions</div>
                          <div className="space-y-1.5">
                            {alert.actions.map((action, index) => {
                              const label = typeof action === 'string' ? action : (action as any)?.label ?? '';
                              if (!label) return null;
                              return (
                                <div key={index} className="flex items-center gap-2">
                                  <i className="ri-checkbox-circle-line text-ai-500 text-sm flex-shrink-0"></i>
                                  <span className="text-xs text-brand-600">{label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {alert.resolution_notes && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-premium p-3 mt-3">
                          <div className="text-xs font-semibold text-emerald-800 mb-1">Resolution Notes</div>
                          <div className="text-xs text-emerald-700">{alert.resolution_notes}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {alert.status === 'new' && (
                      <>
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="px-4 py-2 bg-gradient-to-r from-ai-500 to-ai-600 text-white rounded-premium hover:from-ai-600 hover:to-ai-700 transition-all text-xs font-semibold shadow-elevation-1 whitespace-nowrap"
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => handleSnooze(alert.id, 24)}
                          className="px-4 py-2 bg-background border border-border text-brand-600 rounded-premium hover:bg-white hover:border-brand-300 transition-all text-xs font-medium whitespace-nowrap"
                        >
                          Snooze 24h
                        </button>
                      </>
                    )}
                    {(alert.status === 'new' || alert.status === 'acknowledged') && (
                      <button
                        onClick={() => setSelectedAlert(alert)}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-premium hover:bg-emerald-700 transition-colors text-xs font-semibold whitespace-nowrap"
                      >
                        Resolve
                      </button>
                    )}
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="px-4 py-2 bg-background border border-border text-brand-400 rounded-premium hover:text-brand-700 hover:border-brand-300 transition-all text-xs font-medium whitespace-nowrap"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Resolve Modal ── */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-premium-xl shadow-elevation-5 max-w-md w-full p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-premium flex items-center justify-center">
                  <i className="ri-checkbox-circle-line text-emerald-600 text-lg"></i>
                </div>
                <h2 className="text-base font-bold text-brand-900">Resolve Alert</h2>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="w-8 h-8 flex items-center justify-center text-brand-400 hover:text-brand-700 hover:bg-background rounded-premium transition-colors"
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <p className="text-xs text-brand-500 mb-4 bg-background rounded-premium px-3 py-2 border border-border">{selectedAlert.title}</p>
            <label className="block text-xs font-semibold text-brand-700 mb-2">Resolution Notes</label>
            <textarea
              id="resolution-notes"
              rows={4}
              className="w-full px-3 py-2.5 border border-border rounded-premium focus:ring-2 focus:ring-ai-400 focus:border-transparent text-sm text-brand-800 bg-background resize-none mb-5"
              placeholder="Describe how this alert was resolved..."
            />
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedAlert(null)}
                className="flex-1 px-4 py-2.5 border border-border text-brand-600 rounded-premium hover:bg-background transition-colors text-sm font-medium whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const notes = (document.getElementById('resolution-notes') as HTMLTextAreaElement)?.value;
                  handleResolve(selectedAlert.id, notes);
                }}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-premium hover:bg-emerald-700 transition-colors text-sm font-semibold whitespace-nowrap"
              >
                Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preferences Modal ── */}
      {showPreferences && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-premium-xl shadow-elevation-5 max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-ai-500 to-ai-600 rounded-premium shadow-glow-sm">
                  <i className="ri-notification-3-line text-xl text-white"></i>
                </div>
                <div>
                  <h3 className="text-base font-bold text-brand-900">Notification Preferences</h3>
                  <p className="text-xs text-brand-400">Configure how you receive alerts</p>
                </div>
              </div>
              <button
                onClick={() => setShowPreferences(false)}
                className="w-8 h-8 flex items-center justify-center text-brand-400 hover:text-brand-700 hover:bg-background rounded-premium transition-colors"
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-brand-700 uppercase tracking-wide">Alert Channels</h4>
                {[
                  { key: 'email_enabled', icon: 'ri-mail-line', label: 'Email notifications' },
                  { key: 'in_app_enabled', icon: 'ri-notification-line', label: 'In-app notifications' },
                  { key: 'sms_enabled', icon: 'ri-message-3-line', label: 'SMS alerts (critical only)' },
                  { key: 'slack_enabled', icon: 'ri-slack-line', label: 'Slack integration' },
                ].map(({ key, icon, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={preferences[key as keyof AlertPreferences] as boolean}
                      onChange={(e) => setPreferences({ ...preferences, [key]: e.target.checked })}
                      className="w-4 h-4 text-ai-600 rounded border-border cursor-pointer accent-ai-500"
                    />
                    <div className="flex items-center gap-2 text-sm text-brand-600 group-hover:text-brand-800">
                      <i className={`${icon} text-brand-400 group-hover:text-ai-500 transition-colors`}></i>
                      {label}
                    </div>
                  </label>
                ))}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-brand-700 uppercase tracking-wide">Alert Frequency</h4>
                {[
                  { value: 'realtime', label: 'Real-time (as they occur)' },
                  { value: 'daily', label: 'Daily digest (9:00 AM)' },
                  { value: 'weekly', label: 'Weekly summary (Monday)' },
                ].map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="frequency"
                      checked={preferences.frequency === value}
                      onChange={() => setPreferences({ ...preferences, frequency: value as AlertPreferences['frequency'] })}
                      className="w-4 h-4 text-ai-600 border-border cursor-pointer accent-ai-500"
                    />
                    <span className="text-sm text-brand-600 group-hover:text-brand-800">{label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-3 cursor-pointer mt-3 group">
                  <input
                    type="checkbox"
                    checked={preferences.critical_always}
                    onChange={(e) => setPreferences({ ...preferences, critical_always: e.target.checked })}
                    className="w-4 h-4 text-ai-600 rounded border-border cursor-pointer accent-ai-500"
                  />
                  <span className="text-sm text-brand-600 group-hover:text-brand-800">Always notify for critical alerts</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-5 border-t border-border">
              <button
                onClick={() => setShowPreferences(false)}
                className="flex-1 px-5 py-2.5 border border-border text-brand-600 rounded-premium hover:bg-background transition-colors text-sm font-medium whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreferences}
                className="flex-1 px-5 py-2.5 bg-gradient-to-r from-ai-500 to-ai-600 text-white rounded-premium hover:from-ai-600 hover:to-ai-700 transition-all shadow-glow-sm text-sm font-semibold whitespace-nowrap"
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
