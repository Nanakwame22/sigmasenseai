
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';
import { addToast } from '../../../../hooks/useToast';

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

interface AlertDetailModalProps {
  alert: AlertItem;
  onClose: () => void;
  onUpdated: () => void;
  onResolveClick: () => void;
}

const SEVERITY_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string; icon: string }> = {
  low: { label: 'Low', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', icon: 'ri-checkbox-circle-line' },
  medium: { label: 'Medium', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', icon: 'ri-error-warning-line' },
  high: { label: 'High', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500', icon: 'ri-alert-line' },
  critical: { label: 'Critical', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', icon: 'ri-alarm-warning-line' },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: 'bg-sky-50', text: 'text-sky-700' },
  acknowledged: { label: 'Acknowledged', bg: 'bg-amber-50', text: 'text-amber-700' },
  snoozed: { label: 'Snoozed', bg: 'bg-slate-100', text: 'text-slate-600' },
  resolved: { label: 'Resolved', bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

const TYPE_ICONS: Record<string, string> = {
  threshold: 'ri-alarm-warning-line',
  anomaly: 'ri-radar-line',
  trend: 'ri-line-chart-line',
  forecast: 'ri-crystal-ball-line',
  info: 'ri-information-line',
};

export default function AlertDetailModal({ alert, onClose, onUpdated, onResolveClick }: AlertDetailModalProps) {
  const [acknowledging, setAcknowledging] = useState(false);
  const [snoozeMinutes, setSnoozeMinutes] = useState('60');
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozing, setSnoozing] = useState(false);

  const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.medium;
  const statusCfg = STATUS_CONFIG[alert.status || 'new'] || STATUS_CONFIG.new;
  const isResolved = alert.status === 'resolved';

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [handleEscape]);

  const handleAcknowledge = async () => {
    if (alert.status === 'acknowledged' || isResolved) return;
    setAcknowledging(true);
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString(), is_read: true })
        .eq('id', alert.id);
      if (error) throw error;
      addToast('Alert acknowledged', 'success');
      onUpdated();
      onClose();
    } catch {
      addToast('Failed to acknowledge alert', 'error');
    } finally {
      setAcknowledging(false);
    }
  };

  const handleSnooze = async () => {
    setSnoozing(true);
    try {
      const until = new Date(Date.now() + parseInt(snoozeMinutes) * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('alerts')
        .update({ status: 'snoozed', snoozed_until: until, is_read: true })
        .eq('id', alert.id);
      if (error) throw error;
      addToast(`Alert snoozed for ${snoozeMinutes} minutes`, 'info');
      onUpdated();
      onClose();
    } catch {
      addToast('Failed to snooze alert', 'error');
    } finally {
      setSnoozing(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col animate-scaleIn">
        {/* Header */}
        <div className={`px-6 py-4 rounded-t-2xl border-b ${sev.bg} ${sev.border}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className={`${sev.icon} ${sev.text} text-2xl`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${sev.bg} ${sev.text} border ${sev.border}`}>
                    {sev.label}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${statusCfg.bg} ${statusCfg.text}`}>
                    {statusCfg.label}
                  </span>
                  {alert.category && (
                    <span className="text-xs text-gray-500 bg-white/70 px-2 py-0.5 rounded-md border border-gray-200">
                      {alert.category}
                    </span>
                  )}
                </div>
                <h2 className={`text-base font-bold ${sev.text} leading-snug`}>
                  {alert.title || 'Untitled Alert'}
                </h2>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 transition-colors cursor-pointer flex-shrink-0">
              <i className="ri-close-line text-gray-600 text-lg"></i>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Message */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Alert Message</p>
            <p className="text-sm text-gray-800 leading-relaxed">{alert.message}</p>
          </div>

          {/* Description */}
          {alert.description && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Additional Details</p>
              <p className="text-sm text-gray-600 leading-relaxed">{alert.description}</p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Alert Type', value: alert.alert_type ? alert.alert_type.charAt(0).toUpperCase() + alert.alert_type.slice(1) : 'Info', icon: TYPE_ICONS[alert.alert_type || 'info'] || 'ri-information-line' },
              { label: 'Confidence', value: alert.confidence ? `${Math.round(alert.confidence * 100)}%` : '—', icon: 'ri-shield-check-line' },
              { label: 'Created', value: formatDate(alert.created_at), icon: 'ri-calendar-line' },
              { label: 'Acknowledged', value: formatDate(alert.acknowledged_at), icon: 'ri-eye-line' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <i className={`${item.icon} text-gray-400 text-xs`}></i>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{item.label}</span>
                </div>
                <p className="text-sm font-medium text-gray-800">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Resolution Info */}
          {isResolved && (
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
              <div className="flex items-center gap-2 mb-2">
                <i className="ri-checkbox-circle-fill text-emerald-600"></i>
                <span className="text-sm font-semibold text-emerald-800">Resolved</span>
                <span className="text-xs text-emerald-600 ml-auto">{formatDate(alert.resolved_at)}</span>
              </div>
              {alert.resolution_notes && (
                <p className="text-xs text-emerald-700 leading-relaxed">{alert.resolution_notes}</p>
              )}
            </div>
          )}

          {/* Snooze Panel */}
          {!isResolved && showSnooze && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs font-semibold text-gray-600 mb-2">Snooze for how long?</p>
              <div className="flex items-center gap-2">
                <select
                  value={snoozeMinutes}
                  onChange={e => setSnoozeMinutes(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white cursor-pointer"
                >
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="180">3 hours</option>
                  <option value="480">8 hours</option>
                  <option value="1440">24 hours</option>
                </select>
                <button
                  onClick={handleSnooze}
                  disabled={snoozing}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-600 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
                >
                  {snoozing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <i className="ri-time-line"></i>}
                  Snooze
                </button>
                <button onClick={() => setShowSnooze(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
                  <i className="ri-close-line text-gray-500"></i>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isResolved && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSnooze(v => !v)}
                className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <i className="ri-time-line"></i>
                Snooze
              </button>
              {alert.status !== 'acknowledged' && (
                <button
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                  className="px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
                >
                  {acknowledging ? <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-600 rounded-full animate-spin" /> : <i className="ri-eye-line"></i>}
                  Acknowledge
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                Close
              </button>
              <button
                onClick={() => { onClose(); onResolveClick(); }}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <i className="ri-checkbox-circle-line"></i>
                Resolve
              </button>
            </div>
          </div>
        )}
        {isResolved && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
