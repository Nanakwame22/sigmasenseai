
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';
import { addToast } from '../../../../hooks/useToast';
import { useAuth } from '../../../../contexts/AuthContext';

interface Metric {
  id: string;
  name: string;
  unit: string | null;
}

interface CreateAlertModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'medium', label: 'Medium', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'high', label: 'High', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: 'critical', label: 'Critical', color: 'text-red-600 bg-red-50 border-red-200' },
];

const ALERT_TYPE_OPTIONS = [
  { value: 'threshold', label: 'Threshold Breach', icon: 'ri-alarm-warning-line' },
  { value: 'anomaly', label: 'Anomaly Detected', icon: 'ri-radar-line' },
  { value: 'trend', label: 'Trend Alert', icon: 'ri-line-chart-line' },
  { value: 'forecast', label: 'Forecast Alert', icon: 'ri-crystal-ball-line' },
  { value: 'info', label: 'Informational', icon: 'ri-information-line' },
];

const CATEGORY_OPTIONS = [
  'Quality', 'Performance', 'Safety', 'Compliance', 'Financial', 'Operational', 'Customer', 'Other',
];

export default function CreateAlertModal({ onClose, onCreated }: CreateAlertModalProps) {
  const { organization, user } = useAuth();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    message: '',
    description: '',
    severity: 'medium',
    alert_type: 'threshold',
    category: '',
    metric_id: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!organization?.id) return;
      const { data } = await supabase
        .from('metrics')
        .select('id, name, unit')
        .eq('organization_id', organization.id)
        .order('name');
      setMetrics(data || []);
    };
    fetchMetrics();
  }, [organization]);

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

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.title.trim()) newErrors.title = 'Title is required';
    if (!form.message.trim()) newErrors.message = 'Message is required';
    if (!form.severity) newErrors.severity = 'Severity is required';
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        organization_id: organization?.id,
        title: form.title.trim(),
        message: form.message.trim(),
        description: form.description.trim() || null,
        severity: form.severity,
        alert_type: form.alert_type,
        category: form.category || null,
        metric_id: form.metric_id || null,
        status: 'new',
        is_read: false,
      };

      const { data: newAlert, error } = await supabase
        .from('alerts')
        .insert(payload)
        .select('id')
        .maybeSingle();
      if (error) throw error;

      // Fire-and-forget: send external notifications (email/SMS/Slack)
      if (newAlert?.id && user?.id && organization?.id) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          fetch(
            `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/send-alert-notification`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                alertId: newAlert.id,
                organizationId: organization.id,
                userId: user.id,
              }),
            }
          ).catch(err => console.warn('Notification dispatch error:', err));
        }
      }

      addToast('Alert created successfully', 'success');
      onCreated();
      onClose();
    } catch (err) {
      console.error('Error creating alert:', err);
      addToast('Failed to create alert', 'error');
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
              <i className="ri-alarm-warning-line text-white text-base"></i>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Create New Alert</h2>
              <p className="text-xs text-gray-500">Define alert conditions and notifications</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Alert Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Defect Rate Threshold Exceeded"
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors ${errors.title ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
            />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Severity <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('severity', opt.value)}
                  className={`py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                    form.severity === opt.value ? opt.color + ' ring-2 ring-offset-1 ring-current' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alert Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Alert Type</label>
            <div className="grid grid-cols-2 gap-2">
              {ALERT_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('alert_type', opt.value)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                    form.alert_type === opt.value
                      ? 'border-teal-400 bg-teal-50 text-teal-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <i className={`${opt.icon} text-sm`}></i>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Alert Message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.message}
              onChange={e => set('message', e.target.value)}
              placeholder="Describe what triggered this alert and what action is needed..."
              rows={3}
              maxLength={500}
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors resize-none ${errors.message ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
            />
            <div className="flex justify-between mt-1">
              {errors.message ? <p className="text-xs text-red-500">{errors.message}</p> : <span />}
              <span className="text-xs text-gray-400">{form.message.length}/500</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Additional Details <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Add any additional context or notes..."
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{form.description.length}/500</p>
          </div>

          {/* Row: Category + Metric */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Category</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors cursor-pointer"
              >
                <option value="">Select category</option>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Linked Metric</label>
              <select
                value={form.metric_id}
                onChange={e => set('metric_id', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors cursor-pointer"
              >
                <option value="">None</option>
                {metrics.map(m => (
                  <option key={m.id} value={m.id}>{m.name}{m.unit ? ` (${m.unit})` : ''}</option>
                ))}
              </select>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <i className="ri-add-line"></i>
                Create Alert
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
