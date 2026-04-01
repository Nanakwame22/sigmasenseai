import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

// ── Constants ──────────────────────────────────────────────────────────────

const ICON_OPTIONS = [
  { icon: 'ri-heart-pulse-line',       label: 'Vitals' },
  { icon: 'ri-test-tube-line',         label: 'Lab' },
  { icon: 'ri-hotel-bed-line',         label: 'Capacity' },
  { icon: 'ri-user-2-line',            label: 'Staffing' },
  { icon: 'ri-hospital-line',          label: 'Emergency' },
  { icon: 'ri-refresh-alert-line',     label: 'Readmission' },
  { icon: 'ri-brain-line',             label: 'AI' },
  { icon: 'ri-stethoscope-line',       label: 'Clinical' },
  { icon: 'ri-medicine-bottle-line',   label: 'Pharmacy' },
  { icon: 'ri-surgical-mask-line',     label: 'Infection' },
  { icon: 'ri-pulse-line',             label: 'Monitor' },
  { icon: 'ri-first-aid-kit-line',     label: 'Triage' },
  { icon: 'ri-microscope-line',        label: 'Pathology' },
  { icon: 'ri-lungs-line',             label: 'Respiratory' },
  { icon: 'ri-drop-line',              label: 'Fluid' },
  { icon: 'ri-dashboard-line',         label: 'Metrics' },
  { icon: 'ri-alarm-warning-line',     label: 'Alerts' },
  { icon: 'ri-shield-cross-line',      label: 'Safety' },
  { icon: 'ri-file-chart-line',        label: 'Reports' },
  { icon: 'ri-robot-line',             label: 'Automation' },
];

const CATEGORY_OPTIONS = [
  'Clinical Safety',
  'Diagnostics',
  'Capacity',
  'Workforce',
  'Emergency',
  'Post-Discharge',
  'Pharmacy',
  'Infection Control',
  'Operational',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function toModelKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {ICON_OPTIONS.map(({ icon, label }) => (
        <button
          key={icon}
          type="button"
          title={label}
          onClick={() => onChange(icon)}
          className={`w-full aspect-square flex items-center justify-center rounded-lg border transition-all duration-150 cursor-pointer ${
            value === icon
              ? 'bg-teal-50 border-teal-300 text-teal-600'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          <i className={`${icon} text-base`}></i>
        </button>
      ))}
    </div>
  );
}

interface FeaturesInputProps {
  features: string[];
  onChange: (features: string[]) => void;
}

function FeaturesInput({ features, onChange }: FeaturesInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addFeature = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || features.includes(trimmed)) return;
    onChange([...features, trimmed]);
    setDraft('');
  }, [draft, features, onChange]);

  const removeFeature = useCallback((idx: number) => {
    onChange(features.filter((_, i) => i !== idx));
  }, [features, onChange]);

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }}
          placeholder="e.g. Vital sign trends"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 bg-white"
        />
        <button
          type="button"
          onClick={addFeature}
          disabled={!draft.trim()}
          className="px-3 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40 cursor-pointer whitespace-nowrap transition-colors"
        >
          Add
        </button>
      </div>
      {features.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {features.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center space-x-1.5 text-xs px-2.5 py-1 bg-teal-50 border border-teal-100 text-teal-700 rounded-lg font-medium"
            >
              <span>{f}</span>
              <button
                type="button"
                onClick={() => removeFeature(i)}
                className="text-teal-400 hover:text-teal-700 transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xs"></i>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Form state ─────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  model_key: string;
  category: string;
  customCategory: string;
  icon: string;
  status: 'running' | 'training' | 'paused';
  accuracy: number;
  prediction_confidence: string;
  description: string;
  predictions: string;
  impact: string;
  features: string[];
}

const INITIAL_FORM: FormState = {
  name: '',
  model_key: '',
  category: 'Clinical Safety',
  customCategory: '',
  icon: 'ri-brain-line',
  status: 'training',
  accuracy: 75,
  prediction_confidence: '',
  description: '',
  predictions: '',
  impact: '',
  features: [],
};

// ── Main modal ─────────────────────────────────────────────────────────────

interface AddModelModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddModelModal({ onClose, onAdded }: AddModelModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [keyManual, setKeyManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Auto-generate model_key from name unless manually edited
  useEffect(() => {
    if (!keyManual) {
      setForm((prev) => ({ ...prev, model_key: toModelKey(prev.name) }));
    }
  }, [form.name, keyManual]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    const model_key = form.model_key.trim();
    const resolvedCategory = form.category === '__custom__'
      ? form.customCategory.trim()
      : form.category;

    if (!name) { setError('Model name is required.'); return; }
    if (!model_key) { setError('Model key is required.'); return; }
    if (!resolvedCategory) { setError('Category is required.'); return; }

    setSaving(true);
    const { error: dbError } = await supabase.from('cpi_models').insert({
      name,
      model_key,
      category: resolvedCategory,
      icon: form.icon,
      status: form.status,
      accuracy: form.accuracy,
      prediction_confidence: form.prediction_confidence
        ? parseFloat(form.prediction_confidence)
        : null,
      description: form.description.trim() || null,
      predictions: form.predictions.trim() || null,
      impact: form.impact.trim() || null,
      features: form.features,
      run_count_today: 0,
      alert_count: 0,
      learn_count: 0,
      last_learned_at: null,
      last_run_at: null,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (dbError) {
      if (dbError.message.includes('unique') || dbError.message.includes('duplicate')) {
        setError(`Model key "${model_key}" is already taken — try a different one.`);
      } else {
        setError(dbError.message);
      }
      return;
    }

    setSuccess(true);
    setTimeout(() => { onAdded(); onClose(); }, 1_400);
  }, [form, onAdded, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 flex items-center justify-center bg-teal-50 rounded-lg">
              <i className="ri-add-circle-line text-teal-600 text-base"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Register New Model</h3>
              <p className="text-xs text-slate-400">Add an AI model to the Intelligence Models tab</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer rounded-lg hover:bg-slate-100">
            <i className="ri-close-line text-base"></i>
          </button>
        </div>

        {/* Success state */}
        {success && (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 flex items-center justify-center bg-emerald-100 rounded-full mb-4">
              <i className="ri-checkbox-circle-line text-emerald-600 text-2xl"></i>
            </div>
            <p className="text-sm font-bold text-slate-900 mb-1">Model registered!</p>
            <p className="text-xs text-slate-500">It will appear in the grid now</p>
          </div>
        )}

        {/* Form */}
        {!success && (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="px-6 py-5 space-y-6">

              {/* ── Section 1: Identity ─────────────────────────────────── */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Identity</p>
                <div className="space-y-3">

                  {/* Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Model Name <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      placeholder="e.g. Sepsis Early Warning"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300"
                    />
                  </div>

                  {/* Model Key */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Model Key <span className="text-rose-500">*</span>
                      <span className="ml-1.5 text-slate-400 font-normal">(unique slug used internally)</span>
                    </label>
                    <input
                      type="text"
                      value={form.model_key}
                      onChange={(e) => { setKeyManual(true); set('model_key', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')); }}
                      placeholder="sepsis-early-warning"
                      className="w-full text-sm font-mono border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category <span className="text-rose-500">*</span></label>
                    <select
                      value={form.category}
                      onChange={(e) => set('category', e.target.value as FormState['category'])}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 bg-white cursor-pointer"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__custom__">Custom…</option>
                    </select>
                    {form.category === '__custom__' && (
                      <input
                        type="text"
                        value={form.customCategory}
                        onChange={(e) => set('customCategory', e.target.value)}
                        placeholder="Enter category name"
                        className="mt-2 w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300"
                      />
                    )}
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Icon</label>
                    <div className="p-3 border border-slate-200 rounded-lg">
                      <IconPicker value={form.icon} onChange={(v) => set('icon', v)} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">Selected: <i className={`${form.icon} text-teal-600`}></i> <span className="font-mono">{form.icon}</span></p>
                  </div>
                </div>
              </div>

              {/* ── Section 2: Configuration ────────────────────────────── */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Configuration</p>
                <div className="space-y-3">

                  {/* Status */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2">Initial Status</label>
                    <div className="flex gap-2">
                      {(['training', 'running', 'paused'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set('status', s)}
                          className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                            form.status === s
                              ? s === 'running'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : s === 'training'
                                ? 'bg-amber-50 border-amber-300 text-amber-700'
                                : 'bg-slate-100 border-slate-300 text-slate-600'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            s === 'running' ? 'bg-emerald-500' : s === 'training' ? 'bg-amber-400' : 'bg-slate-400'
                          } ${form.status === s && s !== 'paused' ? 'animate-pulse' : ''}`}></div>
                          <span className="capitalize">{s}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Accuracy */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-600">Initial Accuracy</label>
                      <span className={`text-sm font-bold tabular-nums ${
                        form.accuracy >= 88 ? 'text-teal-600' : form.accuracy >= 80 ? 'text-amber-600' : 'text-rose-500'
                      }`}>{form.accuracy.toFixed(1)}%</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={99}
                      step={0.5}
                      value={form.accuracy}
                      onChange={(e) => set('accuracy', parseFloat(e.target.value))}
                      className="w-full accent-teal-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                      <span>60%</span><span>99%</span>
                    </div>
                  </div>

                  {/* Prediction Confidence */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Prediction Confidence <span className="font-normal text-slate-400">(optional, %)</span></label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={form.prediction_confidence}
                      onChange={(e) => set('prediction_confidence', e.target.value)}
                      placeholder="e.g. 87.5"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300"
                    />
                  </div>
                </div>
              </div>

              {/* ── Section 3: Details ──────────────────────────────────── */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Details</p>
                <div className="space-y-3">

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description <span className="font-normal text-slate-400">(optional)</span></label>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      placeholder="What does this model do? What clinical signal does it detect?"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 resize-none"
                    />
                  </div>

                  {/* Current Prediction */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Current Prediction <span className="font-normal text-slate-400">(optional)</span></label>
                    <input
                      type="text"
                      value={form.predictions}
                      onChange={(e) => set('predictions', e.target.value)}
                      placeholder="e.g. 2 patients — sepsis risk score > 8.0"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300"
                    />
                  </div>

                  {/* Impact */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Expected Impact <span className="font-normal text-slate-400">(optional)</span></label>
                    <input
                      type="text"
                      value={form.impact}
                      onChange={(e) => set('impact', e.target.value)}
                      placeholder="e.g. Reduces ICU transfers by ~30%"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300"
                    />
                  </div>

                  {/* Features */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Input Features <span className="font-normal text-slate-400">(optional — press Enter to add)</span></label>
                    <FeaturesInput features={form.features} onChange={(v) => set('features', v)} />
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center space-x-2 px-3 py-2.5 bg-rose-50 border border-rose-100 rounded-lg">
                  <i className="ri-error-warning-line text-rose-500 text-sm flex-shrink-0"></i>
                  <p className="text-xs text-rose-700 font-medium">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-white">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !form.name.trim() || !form.model_key.trim()}
                className="flex items-center space-x-2 px-5 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                {saving ? (
                  <>
                    <i className="ri-loader-4-line text-xs animate-spin"></i>
                    <span>Registering…</span>
                  </>
                ) : (
                  <>
                    <i className="ri-add-circle-line text-xs"></i>
                    <span>Register Model</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
