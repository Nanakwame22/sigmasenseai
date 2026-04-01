
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';
import { addToast } from '../../../../hooks/useToast';

interface AlertItem {
  id: string;
  title?: string;
  message: string;
  severity: string;
  status?: string;
  created_at: string;
}

interface ResolveAlertModalProps {
  alert: AlertItem;
  onClose: () => void;
  onResolved: () => void;
}

export default function ResolveAlertModal({ alert, onClose, onResolved }: ResolveAlertModalProps) {
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);

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

  const severityConfig: Record<string, { label: string; bg: string; text: string; border: string; icon: string }> = {
    low: { label: 'Low', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: 'ri-checkbox-circle-line' },
    medium: { label: 'Medium', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'ri-error-warning-line' },
    high: { label: 'High', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: 'ri-alert-line' },
    critical: { label: 'Critical', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'ri-alarm-warning-line' },
  };

  const sev = severityConfig[alert.severity] || severityConfig.medium;

  const handleResolve = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes.trim() || null,
          is_read: true,
        })
        .eq('id', alert.id);

      if (error) throw error;

      addToast('Alert resolved successfully', 'success');
      onResolved();
      onClose();
    } catch (err) {
      console.error('Error resolving alert:', err);
      addToast('Failed to resolve alert', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-white text-base"></i>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Resolve Alert</h2>
              <p className="text-xs text-gray-500">Mark this alert as resolved</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Alert Summary */}
          <div className={`rounded-xl p-4 border ${sev.bg} ${sev.border}`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 flex items-center justify-center flex-shrink-0`}>
                <i className={`${sev.icon} ${sev.text} text-xl`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold uppercase tracking-wide ${sev.text}`}>{sev.label} Severity</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 truncate">{alert.title || 'Untitled Alert'}</p>
                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{alert.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Created {new Date(alert.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>

          {/* Resolution Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Resolution Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={resolutionNotes}
              onChange={e => setResolutionNotes(e.target.value)}
              placeholder="Describe how this alert was resolved, what actions were taken, or any relevant notes..."
              rows={4}
              maxLength={500}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{resolutionNotes.length}/500</p>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
            <i className="ri-information-line text-gray-400 text-sm mt-0.5 flex-shrink-0"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              Resolving this alert will mark it as closed and record the resolution timestamp. This action can be reviewed in the audit log.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            onClick={handleResolve}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Resolving...
              </>
            ) : (
              <>
                <i className="ri-checkbox-circle-line"></i>
                Mark as Resolved
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
