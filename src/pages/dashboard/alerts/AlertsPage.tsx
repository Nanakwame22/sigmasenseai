import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { addToast } from '../../../hooks/useToast';
import CreateAlertModal from './components/CreateAlertModal';
import ResolveAlertModal from './components/ResolveAlertModal';
import AlertDetailModal from './components/AlertDetailModal';
import AlertSettingsModal from './components/AlertSettingsModal';
import AnomalyFeedPanel from './components/AnomalyFeedPanel';
import { syncAnomalyAlerts } from '../../../services/anomalyAlertBridge';

interface AlertItem {
  id: string;
  title?: string;
  message: string;
  description?: string;
  severity: string;
  alert_type?: string;
  category?: string;
  status?: string;
  is_read: boolean;
  created_at: string;
  resolved_at?: string;
  resolution_notes?: string;
  acknowledged_at?: string;
  snoozed_until?: string;
  confidence?: number;
  metric_id?: string;
}

const SEVERITY_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string; icon: string; ring: string }> = {
  low: { label: 'Low', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', icon: 'ri-checkbox-circle-line', ring: 'ring-emerald-200' },
  medium: { label: 'Medium', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', icon: 'ri-error-warning-line', ring: 'ring-amber-200' },
  high: { label: 'High', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500', icon: 'ri-alert-line', ring: 'ring-orange-200' },
  critical: { label: 'Critical', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', icon: 'ri-alarm-warning-line', ring: 'ring-red-200' },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: 'bg-sky-50', text: 'text-sky-700' },
  acknowledged: { label: 'Acknowledged', bg: 'bg-amber-50', text: 'text-amber-700' },
  snoozed: { label: 'Snoozed', bg: 'bg-slate-100', text: 'text-slate-600' },
  resolved: { label: 'Resolved', bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

const FILTER_TABS = [
  { key: 'all', label: 'All Alerts', icon: 'ri-list-check' },
  { key: 'active', label: 'Active', icon: 'ri-pulse-line' },
  { key: 'critical', label: 'Critical', icon: 'ri-alarm-warning-line' },
  { key: 'resolved', label: 'Resolved', icon: 'ri-checkbox-circle-line' },
];

export default function AlertsPage() {
  const { organization } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [syncing, setSyncing] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAlerts(data || []);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      addToast('Failed to load alerts', 'error');
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // ── Real-time subscription: new alerts appear instantly ──
  useEffect(() => {
    if (!organization?.id) return;
    const channel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alerts',
        filter: `organization_id=eq.${organization.id}`,
      }, () => { fetchAlerts(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organization, fetchAlerts]);

  const handleMarkAllRead = async () => {
    const unread = alerts.filter(a => !a.is_read).map(a => a.id);
    if (unread.length === 0) { addToast('All alerts are already read', 'info'); return; }
    try {
      const { error } = await supabase.from('alerts').update({ is_read: true }).in('id', unread);
      if (error) throw error;
      addToast(`Marked ${unread.length} alert${unread.length > 1 ? 's' : ''} as read`, 'success');
      fetchAlerts();
    } catch {
      addToast('Failed to mark alerts as read', 'error');
    }
  };

  const handleSyncAnomalies = async () => {
    if (!organization?.id) return;
    setSyncing(true);
    try {
      const result = await syncAnomalyAlerts(organization.id);
      if (result.created > 0) {
        addToast(`${result.created} new alert${result.created > 1 ? 's' : ''} synced from anomalies`, 'success');
        fetchAlerts();
      } else if (result.errors > 0) {
        addToast('Some alerts failed to sync', 'error');
      } else {
        addToast('All anomalies already have alerts', 'info');
      }
    } catch {
      addToast('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'active' && alert.status !== 'resolved') ||
      (activeTab === 'critical' && alert.severity === 'critical') ||
      (activeTab === 'resolved' && alert.status === 'resolved');

    const matchesSeverity = severityFilter === 'all' || alert.severity === severityFilter;

    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      (alert.title || '').toLowerCase().includes(q) ||
      alert.message.toLowerCase().includes(q) ||
      (alert.category || '').toLowerCase().includes(q);

    return matchesTab && matchesSeverity && matchesSearch;
  });

  const counts = {
    all: alerts.length,
    active: alerts.filter(a => a.status !== 'resolved').length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    resolved: alerts.filter(a => a.status === 'resolved').length,
    unread: alerts.filter(a => !a.is_read).length,
  };

  // Separate auto-generated anomaly alerts for a subtle badge
  const autoCount = alerts.filter(a => (a as any).auto_generated && a.status !== 'resolved').length;

  const statCards = [
    { label: 'Total Alerts', value: counts.all, icon: 'ri-list-check', color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
    { label: 'Active', value: counts.active, icon: 'ri-pulse-line', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
    { label: 'Critical', value: counts.critical, icon: 'ri-alarm-warning-line', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
    { label: 'Resolved', value: counts.resolved, icon: 'ri-checkbox-circle-line', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Monitor and manage operational alerts across your organization
            {counts.unread > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse inline-block"></span>
                {counts.unread} unread
              </span>
            )}
            {autoCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                <i className="ri-radar-line text-xs"></i>
                {autoCount} from anomalies
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {counts.unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <i className="ri-eye-line text-sm"></i>
              Mark all read
            </button>
          )}
          <button
            onClick={handleSyncAnomalies}
            disabled={syncing}
            className="px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 disabled:opacity-60"
            title="Create alerts for any anomalies that don't have one yet"
          >
            {syncing
              ? <><div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-600 rounded-full animate-spin" />Syncing...</>
              : <><i className="ri-radar-line text-sm" />Sync Anomalies</>
            }
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
          >
            <i className="ri-settings-3-line text-sm"></i>
            Settings
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-sm"
          >
            <i className="ri-add-line text-base"></i>
            Create Alert
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {statCards.map(card => (
          <div key={card.label} className={`rounded-xl p-4 border ${card.bg} ${card.border} flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/70 border ${card.border}`}>
              <i className={`${card.icon} ${card.color} text-lg`}></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className={`text-xs font-medium ${card.color}`}>{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Live Anomaly Feed Panel ── */}
      <AnomalyFeedPanel onAlertsCreated={fetchAlerts} />

      {/* Filters Row */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-4 flex-wrap">
        {/* Tab Filters */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <i className={`${tab.icon} text-sm`}></i>
              {tab.label}
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-teal-100 text-teal-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {counts[tab.key as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>

        {/* Severity Filter */}
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white cursor-pointer text-gray-700"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search alerts..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-gray-50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <i className="ri-close-line text-sm"></i>
            </button>
          )}
        </div>

        <button
          onClick={fetchAlerts}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer text-gray-500"
          title="Refresh"
        >
          <i className="ri-refresh-line text-sm"></i>
        </button>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <i className="ri-notification-off-line text-gray-400 text-2xl"></i>
          </div>
          <p className="text-base font-semibold text-gray-700 mb-1">
            {searchQuery || severityFilter !== 'all' ? 'No matching alerts' : 'No alerts yet'}
          </p>
          <p className="text-sm text-gray-400 max-w-xs">
            {searchQuery || severityFilter !== 'all'
              ? 'Try adjusting your filters or search query.'
              : 'Alerts are created automatically when anomalies are detected, or you can create one manually.'}
          </p>
          {!searchQuery && severityFilter === 'all' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <i className="ri-add-line"></i>
              Create Alert
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAlerts.map(alert => {
            const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.medium;
            const statusCfg = STATUS_CONFIG[alert.status || 'new'] || STATUS_CONFIG.new;
            const isResolved = alert.status === 'resolved';
            const isAutoGenerated = (alert as any).auto_generated;

            return (
              <div
                key={alert.id}
                onClick={() => { setSelectedAlert(alert); setShowDetailModal(true); }}
                className={`bg-white rounded-xl border transition-all duration-200 cursor-pointer group hover:shadow-md ${
                  !alert.is_read ? 'border-l-4 ' + sev.border : 'border-gray-200'
                } ${isResolved ? 'opacity-70' : ''}`}
              >
                <div className="p-4 flex items-start gap-4">
                  {/* Severity Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${sev.bg} border ${sev.border}`}>
                    <i className={`${sev.icon} ${sev.text} text-lg`}></i>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          {!alert.is_read && (
                            <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0"></span>
                          )}
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {alert.title || 'Untitled Alert'}
                          </h3>
                          <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${sev.bg} ${sev.text} border ${sev.border} flex-shrink-0`}>
                            {sev.label}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${statusCfg.bg} ${statusCfg.text} flex-shrink-0`}>
                            {statusCfg.label}
                          </span>
                          {isAutoGenerated && (
                            <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex-shrink-0 flex items-center gap-1">
                              <i className="ri-radar-line text-xs"></i>
                              Auto-detected
                            </span>
                          )}
                          {alert.category && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md flex-shrink-0">
                              {alert.category}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{alert.message}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isResolved && (
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedAlert(alert); setShowResolveModal(true); }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
                          >
                            <i className="ri-checkbox-circle-line text-sm"></i>
                            Resolve
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedAlert(alert); setShowDetailModal(true); }}
                          className="px-2.5 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
                        >
                          <i className="ri-eye-line text-sm"></i>
                          View
                        </button>
                      </div>
                    </div>

                    {/* Footer Meta */}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <i className="ri-time-line text-xs"></i>
                        {new Date(alert.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {alert.alert_type && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <i className="ri-tag-line text-xs"></i>
                          {alert.alert_type.charAt(0).toUpperCase() + alert.alert_type.slice(1)}
                        </span>
                      )}
                      {alert.confidence && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <i className="ri-shield-check-line text-xs"></i>
                          {Math.round(alert.confidence * 100)}% confidence
                        </span>
                      )}
                      {isResolved && alert.resolved_at && (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <i className="ri-checkbox-circle-line text-xs"></i>
                          Resolved {new Date(alert.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Results count */}
      {!loading && filteredAlerts.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          Showing {filteredAlerts.length} of {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateAlertModal onClose={() => setShowCreateModal(false)} onCreated={fetchAlerts} />
      )}
      {showDetailModal && selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => { setShowDetailModal(false); setSelectedAlert(null); }}
          onUpdated={fetchAlerts}
          onResolveClick={() => { setShowResolveModal(true); }}
        />
      )}
      {showResolveModal && selectedAlert && (
        <ResolveAlertModal
          alert={selectedAlert}
          onClose={() => { setShowResolveModal(false); setSelectedAlert(null); }}
          onResolved={fetchAlerts}
        />
      )}
      {showSettingsModal && (
        <AlertSettingsModal onClose={() => setShowSettingsModal(false)} />
      )}
    </div>
  );
}
