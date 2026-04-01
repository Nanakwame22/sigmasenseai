import { useState, useCallback, useRef, KeyboardEvent } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface CPIModelFields {
  id: string;
  predictions: string | null;
  impact: string | null;
  description: string | null;
  features: string[];
}

export interface ModelEditFields {
  predictions: string;
  impact: string;
  description: string;
  features: string[];
}

interface EditModelPanelProps {
  model: CPIModelFields;
  onSave: (id: string, updates: ModelEditFields) => Promise<void>;
  onCancel: () => void;
}

// ── Features tag input ─────────────────────────────────────────────────────

interface FeaturesInputProps {
  features: string[];
  onChange: (next: string[]) => void;
}

function FeaturesInput({ features, onChange }: FeaturesInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = useCallback(() => {
    const v = draft.trim();
    if (!v || features.includes(v)) { setDraft(''); return; }
    onChange([...features, v]);
    setDraft('');
  }, [draft, features, onChange]);

  const remove = useCallback((idx: number) => {
    onChange(features.filter((_, i) => i !== idx));
  }, [features, onChange]);

  const onKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !draft && features.length > 0) {
      remove(features.length - 1);
    }
  }, [add, draft, features, remove]);

  return (
    <div
      className="min-h-[38px] w-full flex flex-wrap gap-1.5 px-2.5 py-2 border border-slate-200 rounded-lg bg-white cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {features.map((f, i) => (
        <span
          key={i}
          className="inline-flex items-center space-x-1 text-xs px-2 py-0.5 bg-teal-50 border border-teal-100 text-teal-700 rounded-md font-medium"
        >
          <span>{f}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); remove(i); }}
            className="text-teal-400 hover:text-teal-700 transition-colors cursor-pointer leading-none"
          >
            <i className="ri-close-line text-xs"></i>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={features.length === 0 ? 'Type a feature and press Enter…' : ''}
        className="flex-1 min-w-[120px] text-xs outline-none bg-transparent text-slate-700 placeholder-slate-400"
      />
    </div>
  );
}

// ── Field label ────────────────────────────────────────────────────────────

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="block mb-1.5">
      <span className="text-xs font-semibold text-slate-600">{children}</span>
      {hint && <span className="ml-1.5 text-xs text-slate-400 font-normal">{hint}</span>}
    </label>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export default function EditModelPanel({ model, onSave, onCancel }: EditModelPanelProps) {
  const [predictions, setPredictions] = useState(model.predictions ?? '');
  const [impact, setImpact] = useState(model.impact ?? '');
  const [description, setDescription] = useState(model.description ?? '');
  const [features, setFeatures] = useState<string[]>(model.features ?? []);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    predictions !== (model.predictions ?? '') ||
    impact !== (model.impact ?? '') ||
    description !== (model.description ?? '') ||
    JSON.stringify(features) !== JSON.stringify(model.features ?? []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(model.id, { predictions, impact, description, features });
      setSaved(true);
      setTimeout(() => onCancel(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  }, [model.id, predictions, impact, description, features, onSave, onCancel]);

  // ── Saved flash ──────────────────────────────────────────────────────────
  if (saved) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-100">
        <div className="flex items-center space-x-2.5 px-3 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
          <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
            <i className="ri-checkbox-circle-line text-emerald-600 text-base"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-800">Changes saved</p>
            <p className="text-xs text-emerald-600 mt-0.5">Model updated — card will refresh automatically</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>

      {/* Panel header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-lg">
            <i className="ri-edit-2-line text-slate-500 text-xs"></i>
          </div>
          <span className="text-xs font-bold text-slate-700">Edit Model</span>
          {isDirty && (
            <span className="text-xs px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-full font-semibold">
              Unsaved changes
            </span>
          )}
        </div>
        <button
          onClick={onCancel}
          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <i className="ri-close-line text-sm"></i>
        </button>
      </div>

      <div className="space-y-4">

        {/* Current Prediction */}
        <div>
          <Label hint="(shown on the model card)">Current Prediction</Label>
          <input
            type="text"
            value={predictions}
            onChange={(e) => setPredictions(e.target.value)}
            placeholder="e.g. 3 patients — deterioration risk score &gt; 7.5"
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 bg-white text-slate-700 placeholder-slate-400"
          />
        </div>

        {/* Impact */}
        <div>
          <Label hint="(shown in footer)">Expected Impact</Label>
          <input
            type="text"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            placeholder="e.g. Reduces code blue events by ~38%"
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 bg-white text-slate-700 placeholder-slate-400"
          />
        </div>

        {/* Description */}
        <div>
          <Label hint="(shown when card is expanded)">Description</Label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this model detect, and how does it work?"
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 bg-white text-slate-700 placeholder-slate-400 resize-none"
          />
        </div>

        {/* Features */}
        <div>
          <Label hint="(press Enter or Tab to add, Backspace to remove last)">Input Features</Label>
          <FeaturesInput features={features} onChange={setFeatures} />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center space-x-2 px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg">
            <i className="ri-error-warning-line text-rose-500 text-xs flex-shrink-0"></i>
            <p className="text-xs text-rose-700">{error}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end space-x-2 mt-4 pt-3 border-t border-slate-100">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center space-x-1.5 px-4 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
        >
          {saving ? (
            <>
              <i className="ri-loader-4-line text-xs animate-spin"></i>
              <span>Saving…</span>
            </>
          ) : (
            <>
              <i className="ri-save-line text-xs"></i>
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
