import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

interface DecisionStep {
  stage: string;
  description: string;
  automated: boolean;
}

interface DecisionCase {
  id: string;
  role: string;
  role_icon: string;
  role_color: string;
  signal: string;
  signal_severity: 'critical' | 'warning';
  decision: string;
  action: string;
  outcome: string | null;
  outcome_positive: boolean;
  steps: DecisionStep[];
  status: 'active' | 'resolved' | 'pending';
  tags: string[];
  resolved_at: string | null;
  created_at: string;
}

const stageConfig: Record<string, { icon: string; color: string }> = {
  Sense:   { icon: 'ri-radar-line',      color: 'text-teal-600 bg-teal-50' },
  Analyze: { icon: 'ri-brain-line',      color: 'text-indigo-600 bg-indigo-50' },
  Decide:  { icon: 'ri-scales-3-line',   color: 'text-amber-600 bg-amber-50' },
  Act:     { icon: 'ri-flashlight-line', color: 'text-rose-600 bg-rose-50' },
  Learn:   { icon: 'ri-loop-left-line',  color: 'text-emerald-600 bg-emerald-50' },
};

const ROLE_PRESETS: Record<string, { icon: string; color: string }> = {
  nurse:      { icon: 'ri-nurse-line',       color: 'text-rose-600 bg-rose-50 border-rose-100' },
  bed:        { icon: 'ri-hotel-bed-line',   color: 'text-amber-600 bg-amber-50 border-amber-100' },
  lab:        { icon: 'ri-test-tube-line',   color: 'text-teal-600 bg-teal-50 border-teal-100' },
  discharge:  { icon: 'ri-door-open-line',   color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  physician:  { icon: 'ri-stethoscope-line', color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  pharmacist: { icon: 'ri-capsule-line',     color: 'text-violet-600 bg-violet-50 border-violet-100' },
  other:      { icon: 'ri-user-line',        color: 'text-slate-600 bg-slate-50 border-slate-100' },
};

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Log Case Modal ────────────────────────────────────────────────────────────
interface LogCaseModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function LogCaseModal({ onClose, onSaved }: LogCaseModalProps) {
  const [roleType, setRoleType] = useState('nurse');
  const [role, setRole] = useState('');
  const [signal, setSignal] = useState('');
  const [severity, setSeverity] = useState<'critical' | 'warning'>('warning');
  const [decision, setDecision] = useState('');
  const [action, setAction] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role.trim() || !signal.trim() || !decision.trim() || !action.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError('');
    const preset = ROLE_PRESETS[roleType] || ROLE_PRESETS.other;
    const { error: err } = await supabase.from('cpi_decision_cases').insert({
      role: role.trim(),
      role_icon: preset.icon,
      role_color: preset.color,
      signal: signal.trim(),
      signal_severity: severity,
      decision: decision.trim(),
      action: action.trim(),
      steps: [
        { stage: 'Sense',   description: 'Signal detected and captured',           automated: true  },
        { stage: 'Analyze', description: 'Context analyzed against clinical rules', automated: true  },
        { stage: 'Decide',  description: 'Clinician reviewed and decided',          automated: false },
        { stage: 'Act',     description: action.trim(),                             automated: false },
        { stage: 'Learn',   description: 'Case outcome pending — to be resolved',  automated: false },
      ],
      status: 'active',
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Log Decision Case</h3>
            <p className="text-xs text-slate-500 mt-0.5">Record a clinical decision scenario for review and learning</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Role Type</label>
              <select
                value={roleType}
                onChange={e => setRoleType(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="nurse">Bedside Nurse</option>
                <option value="bed">Bed Manager</option>
                <option value="lab">Lab Supervisor</option>
                <option value="discharge">Discharge Coordinator</option>
                <option value="physician">Physician</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Severity</label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as 'critical' | 'warning')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Role / Name <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. Bedside Nurse — ICU Unit 3"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Signal / Alert <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={signal}
              onChange={e => setSignal(e.target.value)}
              placeholder="e.g. Patient deterioration — Room 7, SpO2 dropping"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Decision Question <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={decision}
              onChange={e => setDecision(e.target.value)}
              placeholder="e.g. Escalate to attending or manage with current team?"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Action Taken <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={action}
              onChange={e => setAction(e.target.value)}
              placeholder="e.g. Rapid response called, attending notified"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Tags <span className="text-slate-400 font-normal">(comma separated)</span></label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g. deterioration, rapid-response"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          {error && <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              {saving ? 'Saving...' : 'Log Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Learning Loop Constants ───────────────────────────────────────────────────

/** Maps role_icon → model_keys that benefit from that role's outcome data */
const ROLE_MODEL_MAP: Record<string, string[]> = {
  'ri-nurse-line':       ['deterioration', 'readmission'],
  'ri-hotel-bed-line':   ['bed-forecast', 'ed-surge'],
  'ri-test-tube-line':   ['lab-bottleneck'],
  'ri-door-open-line':   ['readmission', 'bed-forecast'],
  'ri-stethoscope-line': ['deterioration', 'readmission', 'ed-surge'],
  'ri-capsule-line':     ['readmission'],
  'ri-user-line':        ['readmission'],
};

/** Maps tag keywords → model_key (additive, deduplicated) */
const TAG_MODEL_MAP: Record<string, string> = {
  staffing:        'staffing-demand',
  staff:           'staffing-demand',
  capacity:        'bed-forecast',
  bed:             'bed-forecast',
  surge:           'ed-surge',
  ed:              'ed-surge',
  emergency:       'ed-surge',
  lab:             'lab-bottleneck',
  test:            'lab-bottleneck',
  deterioration:   'deterioration',
  'rapid-response': 'deterioration',
  vital:           'deterioration',
  readmission:     'readmission',
  discharge:       'readmission',
};

const MODEL_KEY_NAMES: Record<string, string> = {
  'deterioration':   'Patient Deterioration Detection',
  'lab-bottleneck':  'Lab Bottleneck Prediction',
  'bed-forecast':    'Capacity & Bed Forecast',
  'staffing-demand': 'Staffing Demand Model',
  'ed-surge':        'ED Surge Prediction',
  'readmission':     'Readmission Risk Scoring',
};

function getTargetModels(c: DecisionCase): string[] {
  const set = new Set<string>(ROLE_MODEL_MAP[c.role_icon] ?? ['readmission']);
  c.tags.forEach(tag => {
    const key = TAG_MODEL_MAP[tag.toLowerCase()];
    if (key) set.add(key);
  });
  return Array.from(set);
}

// ─── Resolve Modal ─────────────────────────────────────────────────────────────
interface ResolveModalProps {
  caseItem: DecisionCase;
  onClose: () => void;
  onSaved: () => void;
  onFed: (modelNames: string[]) => void;
}

function ResolveModal({ caseItem, onClose, onSaved, onFed }: ResolveModalProps) {
  const [outcome, setOutcome] = useState('');
  const [outcomePositive, setOutcomePositive] = useState(true);
  const [saving, setSaving] = useState(false);

  const targetKeys  = getTargetModels(caseItem);
  const targetNames = targetKeys.map(k => MODEL_KEY_NAMES[k] ?? k);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome.trim()) return;
    setSaving(true);

    // Accuracy delta: positive outcome → bigger boost, negative → small correction
    const delta = outcomePositive
      ? parseFloat((0.15 + Math.random() * 0.2).toFixed(2))   // +0.15 – +0.35
      : parseFloat((-0.08 + Math.random() * 0.13).toFixed(2)); // –0.08 – +0.05

    // Updated Learn step description
    const updatedSteps = [...(caseItem.steps as DecisionStep[])];
    const learnIdx = updatedSteps.findIndex(s => s.stage === 'Learn');
    if (learnIdx !== -1) {
      updatedSteps[learnIdx] = {
        stage: 'Learn',
        description: `Outcome fed to ${targetKeys.length} model(s): ${targetNames.join(', ')} — accuracy ${delta >= 0 ? '+' : ''}${delta}% applied`,
        automated: true,
      };
    }

    // 1 — persist resolution
    await supabase.from('cpi_decision_cases').update({
      outcome: outcome.trim(),
      outcome_positive: outcomePositive,
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      steps: updatedSteps,
    }).eq('id', caseItem.id);

    // 2 — feed learning to intelligence models
    await supabase.rpc('feed_model_learning', {
      p_model_keys:      targetKeys,
      p_accuracy_delta:  delta,
    });

    setSaving(false);
    onFed(targetNames);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Resolve Case</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{caseItem.role}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">Action taken</p>
            <p className="text-sm text-slate-700 font-medium">{caseItem.action}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Outcome Description <span className="text-rose-400">*</span></label>
            <textarea
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Describe what happened as a result of this decision..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
            />
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setOutcomePositive(true)}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-all ${
                outcomePositive
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <i className="ri-checkbox-circle-line"></i>
              <span>Positive</span>
            </button>
            <button
              type="button"
              onClick={() => setOutcomePositive(false)}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-all ${
                !outcomePositive
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <i className="ri-close-circle-line"></i>
              <span>Negative</span>
            </button>
          </div>

          {/* Learning preview */}
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
            <div className="flex items-center space-x-2 mb-1.5">
              <i className="ri-loop-left-line text-emerald-600 text-sm"></i>
              <p className="text-xs font-semibold text-emerald-700">Learn stage — auto-feeds {targetKeys.length} model{targetKeys.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {targetNames.map(name => (
                <span key={name} className="text-xs px-2 py-0.5 bg-white border border-emerald-200 text-emerald-700 rounded-full font-medium whitespace-nowrap">
                  {name}
                </span>
              ))}
            </div>
            <p className="text-xs text-emerald-600 mt-1.5 opacity-80">
              Resolving this case will {outcomePositive ? 'boost' : 'adjust'} model accuracy scores in real-time.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !outcome.trim()}
              className="px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              {saving ? 'Saving & Feeding...' : 'Resolve & Feed Models'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Learn Feed Banner ─────────────────────────────────────────────────────────

interface LearnFeedBannerProps {
  modelNames: string[];
  onDismiss: () => void;
}

function LearnFeedBanner({ modelNames, onDismiss }: LearnFeedBannerProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="flex items-start space-x-3 p-4 mb-5 bg-emerald-50 border border-emerald-200 rounded-xl animate-fade-in">
      <div className="w-8 h-8 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
        <i className="ri-loop-left-line text-emerald-600"></i>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-emerald-800">Learning fed to Intelligence Models</p>
        <p className="text-xs text-emerald-700 mt-0.5">
          Accuracy scores updated in real-time for:&nbsp;
          <span className="font-semibold">{modelNames.join(', ')}</span>
        </p>
      </div>
      <button onClick={onDismiss} className="w-6 h-6 flex items-center justify-center rounded hover:bg-emerald-100 cursor-pointer flex-shrink-0">
        <i className="ri-close-line text-emerald-600 text-sm"></i>
      </button>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function WorkflowDecisionSupport() {
  const [cases, setCases] = useState<DecisionCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [showLogModal, setShowLogModal] = useState(false);
  const [resolveCase, setResolveCase] = useState<DecisionCase | null>(null);
  const [tick, setTick] = useState(0);
  const [learnFeed, setLearnFeed] = useState<string[] | null>(null);

  const fetchCases = useCallback(async () => {
    const { data } = await supabase
      .from('cpi_decision_cases')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setCases(data as DecisionCase[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCases();

    const channel = supabase
      .channel('cpi_decision_cases_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cpi_decision_cases' }, fetchCases)
      .subscribe();

    const timer = setInterval(() => setTick(t => t + 1), 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [fetchCases]);

  void tick;

  const filtered = cases.filter(c => filter === 'all' ? true : c.status === filter);
  const activeCount   = cases.filter(c => c.status === 'active').length;
  const resolvedCount = cases.filter(c => c.status === 'resolved').length;
  const criticalCount = cases.filter(c => c.signal_severity === 'critical' && c.status === 'active').length;
  const positiveRate  = resolvedCount > 0
    ? Math.round((cases.filter(c => c.outcome_positive && c.status === 'resolved').length / resolvedCount) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Workflow-Embedded Decision Support</h2>
          <p className="text-sm text-slate-500 mt-0.5">Clinical decision scenarios — logged, tracked, and reviewed from Supabase</p>
        </div>
        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line"></i>
          <span>Log Case</span>
        </button>
      </div>

      {/* Learn Feed Banner */}
      {learnFeed && (
        <LearnFeedBanner modelNames={learnFeed} onDismiss={() => setLearnFeed(null)} />
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Cases',    value: cases.length,        icon: 'ri-file-list-3-line',    color: 'text-slate-600 bg-slate-50  border-slate-100' },
          { label: 'Active',         value: activeCount,         icon: 'ri-pulse-line',           color: 'text-rose-600 bg-rose-50 border-rose-100' },
          { label: 'Resolved',       value: resolvedCount,       icon: 'ri-checkbox-circle-line', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
          { label: 'Positive Rate',  value: `${positiveRate}%`,  icon: 'ri-bar-chart-line',       color: 'text-teal-600 bg-teal-50 border-teal-100' },
        ].map(s => (
          <div key={s.label} className={`flex items-center space-x-3 px-4 py-3 rounded-xl border ${s.color}`}>
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/60">
              <i className={`${s.icon} text-base`}></i>
            </div>
            <div>
              <p className="text-lg font-bold leading-none">{s.value}</p>
              <p className="text-xs opacity-70 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Critical banner */}
      {criticalCount > 0 && (
        <div className="flex items-center space-x-2.5 p-3 mb-4 bg-rose-50 border border-rose-100 rounded-xl">
          <i className="ri-alarm-warning-line text-rose-500 text-base"></i>
          <p className="text-sm font-medium text-rose-700">
            {criticalCount} critical case{criticalCount > 1 ? 's' : ''} currently active — review and resolve
          </p>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center space-x-1 mb-4 bg-slate-100 p-1 rounded-full w-fit">
        {(['all', 'active', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap capitalize ${
              filter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {f === 'all' ? `All (${cases.length})` : f === 'active' ? `Active (${activeCount})` : `Resolved (${resolvedCount})`}
          </button>
        ))}
      </div>

      {/* Case Cards */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-5 animate-pulse">
              <div className="h-5 bg-slate-100 rounded w-48 mb-4"></div>
              <div className="h-12 bg-slate-100 rounded mb-3"></div>
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-slate-100 rounded w-2/3 mb-3"></div>
              <div className="h-8 bg-slate-100 rounded"></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-xl border border-slate-100">
          <div className="w-12 h-12 flex items-center justify-center mx-auto bg-slate-100 rounded-xl mb-3">
            <i className="ri-file-list-3-line text-slate-400 text-xl"></i>
          </div>
          <p className="text-sm font-semibold text-slate-600">No {filter !== 'all' ? filter : ''} cases</p>
          <p className="text-xs text-slate-400 mt-1">Click &ldquo;Log Case&rdquo; to record a new clinical decision scenario</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map(c => {
            const isOpen = expandedId === c.id;
            return (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-slate-100 overflow-hidden hover:border-slate-200 transition-all duration-300"
              >
                <div className="p-5 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : c.id)}>
                  {/* Role row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className={`flex items-center space-x-2.5 px-3 py-1.5 rounded-lg border ${c.role_color}`}>
                      <i className={`${c.role_icon} text-base`}></i>
                      <span className="text-xs font-semibold">{c.role}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.status === 'resolved'
                          ? 'bg-emerald-50 text-emerald-600'
                          : c.status === 'active'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}>
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </span>
                      <i className={`ri-arrow-${isOpen ? 'up' : 'down'}-s-line text-slate-400`}></i>
                    </div>
                  </div>

                  {/* Signal */}
                  <div className={`flex items-start space-x-2.5 p-3 rounded-lg border mb-3 ${
                    c.signal_severity === 'critical' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'
                  }`}>
                    <i className={`ri-signal-tower-line text-base flex-shrink-0 mt-0.5 ${
                      c.signal_severity === 'critical' ? 'text-rose-500' : 'text-amber-500'
                    }`}></i>
                    <p className="text-xs font-medium text-slate-700">{c.signal}</p>
                  </div>

                  {/* Decision + Action */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-start space-x-2">
                      <i className="ri-scales-3-line text-slate-400 text-sm mt-0.5 flex-shrink-0"></i>
                      <p className="text-xs text-slate-600">{c.decision}</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <i className="ri-flashlight-line text-teal-500 text-sm mt-0.5 flex-shrink-0"></i>
                      <p className="text-xs text-slate-700 font-medium">{c.action}</p>
                    </div>
                  </div>

                  {/* Outcome or pending */}
                  {c.outcome ? (
                    <div className={`flex items-center space-x-2 p-2.5 rounded-lg ${c.outcome_positive ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                      <i className={`text-sm ${c.outcome_positive ? 'ri-checkbox-circle-line text-emerald-600' : 'ri-close-circle-line text-rose-600'}`}></i>
                      <p className="text-xs text-slate-700">{c.outcome}</p>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <i className="ri-time-line text-slate-400 text-sm"></i>
                      <p className="text-xs text-slate-500">Outcome pending — resolve to feed the Learn stage</p>
                    </div>
                  )}

                  {/* Tags + timestamp */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center flex-wrap gap-1">
                      {c.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{tag}</span>
                      ))}
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(c.created_at)}</span>
                  </div>
                </div>

                {/* Expanded: intelligence cycle */}
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Intelligence Cycle</p>
                      {c.status === 'active' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setResolveCase(c); }}
                          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-loop-left-line text-sm"></i>
                          <span>Resolve &amp; Feed Models</span>
                        </button>
                      )}
                      {c.status === 'resolved' && c.resolved_at && (
                        <span className="text-xs text-emerald-600 flex items-center space-x-1">
                          <i className="ri-checkbox-circle-line"></i>
                          <span>Resolved {timeAgo(c.resolved_at)}</span>
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {(c.steps as DecisionStep[]).map((step, i) => {
                        const cfg = stageConfig[step.stage] || { icon: 'ri-circle-line', color: 'text-slate-500 bg-slate-50' };
                        return (
                          <div key={i} className="flex items-start space-x-3">
                            <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${cfg.color}`}>
                              <i className={`${cfg.icon} text-xs`}></i>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-slate-700">{step.stage}</span>
                                {step.automated && (
                                  <span className="text-xs px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded-full font-medium">Automated</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Target models chip row for active cases */}
                    {c.status === 'active' && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs text-slate-400 mb-1.5">Will feed learning data to:</p>
                        <div className="flex flex-wrap gap-1">
                          {getTargetModels(c).map(key => (
                            <span key={key} className="text-xs px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full font-medium whitespace-nowrap">
                              {MODEL_KEY_NAMES[key] ?? key}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showLogModal && (
        <LogCaseModal onClose={() => setShowLogModal(false)} onSaved={fetchCases} />
      )}
      {resolveCase && (
        <ResolveModal
          caseItem={resolveCase}
          onClose={() => setResolveCase(null)}
          onSaved={fetchCases}
          onFed={(names) => setLearnFeed(names)}
        />
      )}
    </div>
  );
}
