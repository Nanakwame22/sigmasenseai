import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

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
  updated_at?: string | null;
}

interface LinkedActionMeta {
  id: string;
  status: 'open' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  progress: number;
}

interface MetricRecord {
  id: string;
  name: string;
  unit: string | null;
  current_value: number | null;
  target_value: number | null;
}

interface MetricPointRecord {
  metric_id: string;
  value: number;
  timestamp: string;
}

const LIVE_METRIC_PRIORITY = [
  'ED Wait Time',
  'Available Beds',
  'Occupied Beds',
  'Patients Per Nurse',
  'Readmission Risk',
  'Discharges Pending',
  'LOS Average Hours',
  'Critical Labs Unacknowledged',
];

const stageConfig: Record<string, { icon: string; color: string }> = {
  Sense:   { icon: 'ri-radar-line',      color: 'text-ai-600 bg-ai-50' },
  Analyze: { icon: 'ri-brain-line',      color: 'text-indigo-600 bg-indigo-50' },
  Decide:  { icon: 'ri-scales-3-line',   color: 'text-amber-600 bg-amber-50' },
  Act:     { icon: 'ri-flashlight-line', color: 'text-rose-600 bg-rose-50' },
  Learn:   { icon: 'ri-loop-left-line',  color: 'text-emerald-600 bg-emerald-50' },
};

const ROLE_PRESETS: Record<string, { icon: string; color: string }> = {
  nurse:      { icon: 'ri-nurse-line',       color: 'text-rose-600 bg-rose-50 border-rose-100' },
  bed:        { icon: 'ri-hotel-bed-line',   color: 'text-amber-600 bg-amber-50 border-amber-100' },
  lab:        { icon: 'ri-test-tube-line',   color: 'text-ai-600 bg-ai-50 border-ai-100' },
  discharge:  { icon: 'ri-door-open-line',   color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  physician:  { icon: 'ri-stethoscope-line', color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  pharmacist: { icon: 'ri-capsule-line',     color: 'text-violet-600 bg-violet-50 border-violet-100' },
  other:      { icon: 'ri-user-line',        color: 'text-brand-600 bg-brand-50 border-brand-100' },
};

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function formatMetricValue(value: number | null | undefined, unit: string | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const normalizedUnit = (unit || '').toLowerCase();
  if (normalizedUnit === 'minutes' || normalizedUnit === 'min') return `${value.toFixed(1)} minutes`;
  if (normalizedUnit === 'hours' || normalizedUnit === 'hour' || normalizedUnit === 'h') return `${value.toFixed(1)} hours`;
  if (normalizedUnit === 'beds' || normalizedUnit === 'count') return `${Math.round(value)}`;
  if (normalizedUnit === 'ratio') return `${value.toFixed(1)}`;
  if (normalizedUnit === 'probability') return `${Math.round(value * 100)}%`;
  return `${value.toFixed(1)}`;
}

function getCaseOwner(caseItem: DecisionCase) {
  return caseItem.role.split('—')[0]?.trim() || caseItem.role;
}

function getCaseDueMeta(caseItem: DecisionCase) {
  if (caseItem.status === 'resolved') {
    return {
      label: 'Closed',
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      icon: 'ri-checkbox-circle-line',
    };
  }

  if (caseItem.signal_severity === 'critical') {
    return {
      label: 'Due now',
      tone: 'bg-rose-50 text-rose-700 border-rose-100',
      icon: 'ri-alarm-warning-line',
    };
  }

  if (caseItem.tags.some(tag => ['capacity', 'discharge', 'beds', 'staffing'].includes(tag.toLowerCase()))) {
    return {
      label: 'Due this shift',
      tone: 'bg-amber-50 text-amber-700 border-amber-100',
      icon: 'ri-time-line',
    };
  }

  return {
    label: 'Due < 1h',
    tone: 'bg-sky-50 text-sky-700 border-sky-100',
    icon: 'ri-timer-line',
  };
}

function getCaseAuditMeta(caseItem: DecisionCase) {
  const lastTouched = caseItem.resolved_at || caseItem.updated_at || caseItem.created_at;
  const stateLabel = caseItem.resolved_at
    ? `Resolved ${timeAgo(caseItem.resolved_at)}`
    : caseItem.updated_at && caseItem.updated_at !== caseItem.created_at
      ? `Updated ${timeAgo(caseItem.updated_at)}`
      : `Logged ${timeAgo(caseItem.created_at)}`;

  return {
    label: stateLabel,
    timestamp: lastTouched,
  };
}

function calculateLearningDelta(caseItem: DecisionCase, outcomePositive: boolean) {
  const severityWeight = caseItem.signal_severity === 'critical' ? 0.2 : 0.12;
  const automationWeight = caseItem.steps.filter((step) => step.automated).length * 0.02;
  const complexityWeight = Math.min(caseItem.tags.length, 4) * 0.015;
  const baseDelta = severityWeight + automationWeight + complexityWeight;

  if (outcomePositive) {
    return parseFloat(baseDelta.toFixed(2));
  }

  return parseFloat((-Math.max(0.04, baseDelta * 0.45)).toFixed(2));
}

function buildLiveCases(metrics: MetricRecord[], metricPoints: MetricPointRecord[]): DecisionCase[] {
  if (!metrics.length) return [];

  const metricsByName = new Map(metrics.map((metric) => [normalizeName(metric.name), metric]));
  const pointMap = new Map<string, MetricPointRecord[]>();
  metricPoints.forEach((point) => {
    const existing = pointMap.get(point.metric_id) || [];
    existing.push(point);
    pointMap.set(point.metric_id, existing);
  });

  const getLatestValues = (metricName: string) => {
    const metric = metricsByName.get(normalizeName(metricName));
    if (!metric) {
      return { metric: null as MetricRecord | null, current: null as number | null, previous: null as number | null, latestAt: null as string | null };
    }
    const points = [...(pointMap.get(metric.id) || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return {
      metric,
      current: points[0]?.value ?? metric.current_value ?? null,
      previous: points[1]?.value ?? points[0]?.value ?? null,
      latestAt: points[0]?.timestamp ?? null,
    };
  };

  const wait = getLatestValues('ED Wait Time');
  const bedsAvailable = getLatestValues('Available Beds');
  const discharges = getLatestValues('Discharges Pending');
  const criticalLabs = getLatestValues('Critical Labs Unacknowledged');
  const readmission = getLatestValues('Readmission Risk');
  const patientsPerNurse = getLatestValues('Patients Per Nurse');

  const cases: DecisionCase[] = [];

  if (criticalLabs.current !== null && criticalLabs.current > 0) {
    cases.push({
      id: 'live-case:lab-escalation',
      role: 'Lab Supervisor — Central Lab',
      role_icon: 'ri-test-tube-line',
      role_color: 'text-ai-600 bg-ai-50 border-ai-100',
      signal: `${Math.round(criticalLabs.current)} critical lab result${criticalLabs.current === 1 ? '' : 's'} remain unacknowledged`,
      signal_severity: 'critical',
      decision: 'Auto-escalate to attending or re-route to covering physician?',
      action: 'Review and acknowledge critical results, then route any unresolved results to the responsible clinician.',
      outcome: null,
      outcome_positive: false,
      steps: [
        { stage: 'Sense', description: 'Critical lab backlog detected from imported KPI stream', automated: true },
        { stage: 'Analyze', description: `Current backlog is ${formatMetricValue(criticalLabs.current, criticalLabs.metric?.unit)} against a zero-backlog target`, automated: true },
        { stage: 'Decide', description: 'Clinical escalation required if acknowledgement does not clear promptly', automated: true },
        { stage: 'Act', description: 'Capture the assigned response in a tracked case record.', automated: false },
        { stage: 'Learn', description: 'Resolve the resulting case to capture outcome feedback for CPI.', automated: false },
      ],
      status: 'active',
      tags: ['lab', 'escalation', 'critical-result'],
      resolved_at: null,
      created_at: criticalLabs.latestAt ?? new Date().toISOString(),
    });
  }

  if (discharges.current !== null && discharges.current > 5) {
    cases.push({
      id: 'live-case:discharge-backlog',
      role: 'Discharge Coordinator — Social Work',
      role_icon: 'ri-door-open-line',
      role_color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
      signal: `${Math.round(discharges.current)} patients ready-to-go with discharge bottlenecks identified`,
      signal_severity: 'warning',
      decision: 'Which bottlenecks can be cleared first — pharmacy, transport, or SNF placement?',
      action: 'Prioritize the discharge queue and clear the highest-impact blockers before bed turnover slows further.',
      outcome: null,
      outcome_positive: false,
      steps: [
        { stage: 'Sense', description: 'Discharge backlog detected from live KPI feed', automated: true },
        { stage: 'Analyze', description: `${Math.round(discharges.current)} pending discharges remain above the target threshold of 5`, automated: true },
        { stage: 'Decide', description: 'Select the first discharge bottleneck to remove', automated: true },
        { stage: 'Act', description: 'Capture the selected operational response in a tracked case record.', automated: false },
        { stage: 'Learn', description: 'Resolve a logged case to capture whether the intervention cleared the backlog.', automated: false },
      ],
      status: 'active',
      tags: ['discharge', 'bottleneck', 'capacity'],
      resolved_at: null,
      created_at: discharges.latestAt ?? new Date().toISOString(),
    });
  }

  if (wait.current !== null && wait.current > 45) {
    cases.push({
      id: 'live-case:ed-surge',
      role: 'Charge Nurse — Emergency Department',
      role_icon: 'ri-nurse-line',
      role_color: 'text-rose-600 bg-rose-50 border-rose-100',
      signal: `ED wait time is ${formatMetricValue(wait.current, wait.metric?.unit)} and trending above target`,
      signal_severity: 'critical',
      decision: 'Should ED flow be rebalanced now or should a surge workflow be activated?',
      action: 'Review intake and throughput bottlenecks, then trigger ED surge response if congestion persists.',
      outcome: null,
      outcome_positive: false,
      steps: [
        { stage: 'Sense', description: 'ED wait-time signal exceeded preferred operating range', automated: true },
        { stage: 'Analyze', description: `Live KPI shows ${formatMetricValue(wait.current, wait.metric?.unit)} versus target ${(wait.metric?.target_value ?? 30)} minutes`, automated: true },
        { stage: 'Decide', description: 'Choose between local balancing and surge activation', automated: true },
        { stage: 'Act', description: 'Record the selected response in a tracked case record.', automated: false },
        { stage: 'Learn', description: 'Resolve the resulting case to measure whether throughput improved.', automated: false },
      ],
      status: 'active',
      tags: ['ed', 'surge', 'throughput'],
      resolved_at: null,
      created_at: wait.latestAt ?? new Date().toISOString(),
    });
  }

  if (bedsAvailable.current !== null && bedsAvailable.current < 8) {
    cases.push({
      id: 'live-case:beds-capacity',
      role: 'Bed Manager — Capacity Operations',
      role_icon: 'ri-hotel-bed-line',
      role_color: 'text-amber-600 bg-amber-50 border-amber-100',
      signal: `Bed availability has fallen to ${formatMetricValue(bedsAvailable.current, bedsAvailable.metric?.unit)}`,
      signal_severity: 'warning',
      decision: 'Which beds can be freed first, and which units can absorb overflow?',
      action: 'Coordinate discharge acceleration and unit balancing to restore bed buffer.',
      outcome: null,
      outcome_positive: false,
      steps: [
        { stage: 'Sense', description: 'Capacity signal detected from available-bed KPI', automated: true },
        { stage: 'Analyze', description: `Available beds are below the preferred target of ${Math.round(bedsAvailable.metric?.target_value ?? 10)}`, automated: true },
        { stage: 'Decide', description: 'Select near-term capacity recovery actions', automated: true },
        { stage: 'Act', description: 'Capture the recovery plan in a tracked case record.', automated: false },
        { stage: 'Learn', description: 'Resolve a logged case to capture whether the buffer recovered.', automated: false },
      ],
      status: 'active',
      tags: ['capacity', 'beds', 'forecast'],
      resolved_at: null,
      created_at: bedsAvailable.latestAt ?? new Date().toISOString(),
    });
  }

  if (readmission.current !== null && readmission.current > 0.12) {
    cases.push({
      id: 'live-case:readmission',
      role: 'Care Transition Navigator',
      role_icon: 'ri-team-line',
      role_color: 'text-violet-600 bg-violet-50 border-violet-100',
      signal: `Readmission risk has reached ${formatMetricValue(readmission.current, readmission.metric?.unit)}`,
      signal_severity: 'warning',
      decision: 'Which high-risk cohort should receive follow-up intervention first?',
      action: 'Review at-risk discharges and assign targeted follow-up outreach.',
      outcome: null,
      outcome_positive: false,
      steps: [
        { stage: 'Sense', description: 'Readmission risk exceeded the expected threshold', automated: true },
        { stage: 'Analyze', description: `Risk level is ${formatMetricValue(readmission.current, readmission.metric?.unit)} against a target of ${Math.round((readmission.metric?.target_value ?? 0.12) * 100)}%`, automated: true },
        { stage: 'Decide', description: 'Choose the first intervention target cohort', automated: true },
        { stage: 'Act', description: 'Document the outreach plan in a tracked case record.', automated: false },
        { stage: 'Learn', description: 'Resolve a logged case to capture outcome effectiveness.', automated: false },
      ],
      status: 'active',
      tags: ['readmission', 'transition', 'risk'],
      resolved_at: null,
      created_at: readmission.latestAt ?? new Date().toISOString(),
    });
  }

  if (patientsPerNurse.current !== null && patientsPerNurse.current > 5) {
    cases.push({
      id: 'live-case:staffing-load',
      role: 'Staffing Coordinator',
      role_icon: 'ri-team-line',
      role_color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
      signal: `Patients per nurse is ${formatMetricValue(patientsPerNurse.current, patientsPerNurse.metric?.unit)} and above preferred range`,
      signal_severity: 'warning',
      decision: 'Should assignments be rebalanced or should float coverage be requested?',
      action: 'Review assignments and rebalance coverage where patient load is above policy.',
      outcome: null,
      outcome_positive: false,
      steps: [
        { stage: 'Sense', description: 'Staffing load rose above the preferred threshold', automated: true },
        { stage: 'Analyze', description: `Patients per nurse is ${formatMetricValue(patientsPerNurse.current, patientsPerNurse.metric?.unit)} against a target of ${patientsPerNurse.metric?.target_value ?? 4}`, automated: true },
        { stage: 'Decide', description: 'Choose the first staffing correction', automated: true },
        { stage: 'Act', description: 'Track the staffing response in a case record.', automated: false },
        { stage: 'Learn', description: 'Resolve a logged case to capture whether staffing strain improved.', automated: false },
      ],
      status: 'active',
      tags: ['staffing', 'capacity', 'assignment'],
      resolved_at: null,
      created_at: patientsPerNurse.latestAt ?? new Date().toISOString(),
    });
  }

  return cases.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function buildTrackedCaseFromLiveCase(caseItem: DecisionCase) {
  return {
    role: caseItem.role,
    role_icon: caseItem.role_icon,
    role_color: caseItem.role_color,
    signal: caseItem.signal,
    signal_severity: caseItem.signal_severity,
    decision: caseItem.decision,
    action: caseItem.action,
    steps: caseItem.steps,
    status: 'active',
    tags: Array.from(new Set([...(caseItem.tags || []), `cpi-live-case:${caseItem.id}`])),
    updated_at: new Date().toISOString(),
  };
}

function buildActionTitleFromCase(caseItem: DecisionCase) {
  return caseItem.action.length > 96 ? `${caseItem.action.slice(0, 93)}...` : caseItem.action;
}

function buildActionDescriptionFromCase(caseItem: DecisionCase) {
  return [
    `Signal: ${caseItem.signal}`,
    `Decision: ${caseItem.decision}`,
    `Action plan: ${caseItem.action}`,
    `Expected owner: ${getCaseOwner(caseItem)}`,
  ].join(' ');
}

function buildActionTagsFromCase(caseItem: DecisionCase, caseId: string, extraTags: string[] = []) {
  const normalizedTags = caseItem.tags.map(tag => tag.trim()).filter(Boolean);
  const unique = new Set([
    `cpi-case:${caseId}`,
    'cpi-source:decision-case',
    'cpi-outcome:baseline_ready',
    'cpi-verification:pending',
    ...normalizedTags,
    ...extraTags,
  ]);
  return Array.from(unique);
}

function replaceCpiLifecycleTags(existingTags: string[] = [], nextTags: string[]) {
  return [
    ...existingTags.filter(
      tag => !tag.startsWith('cpi-outcome:') && !tag.startsWith('cpi-verification:')
    ),
    ...nextTags,
  ];
}

// ─── Log Case Modal ────────────────────────────────────────────────────────────
interface LogCaseModalProps {
  onClose: () => void;
  onSaved: () => void;
  onTrackedCaseSaved?: (caseItem: DecisionCase) => Promise<void> | void;
}

function LogCaseModal({ onClose, onSaved, onTrackedCaseSaved }: LogCaseModalProps) {
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
    const { data, error: err } = await supabase.from('cpi_decision_cases').insert({
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
      updated_at: new Date().toISOString(),
    }).select('*').maybeSingle();
    setSaving(false);
    if (err) { setError(err.message); return; }
    if (data && onTrackedCaseSaved) {
      await onTrackedCaseSaved(data as DecisionCase);
    }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
          <div>
            <h3 className="text-base font-bold text-brand-900">Log Decision Case</h3>
            <p className="text-xs text-brand-500 mt-0.5">Record a clinical decision scenario for review and learning</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-brand-100 cursor-pointer">
            <i className="ri-close-line text-brand-500"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-brand-600 block mb-1">Role Type</label>
              <select
                value={roleType}
                onChange={e => setRoleType(e.target.value)}
                className="w-full text-sm border border-brand-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ai-400"
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
              <label className="text-xs font-semibold text-brand-600 block mb-1">Severity</label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as 'critical' | 'warning')}
                className="w-full text-sm border border-brand-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ai-400"
              >
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-600 block mb-1">Role / Name <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. Bedside Nurse — ICU Unit 3"
              className="w-full text-sm border border-brand-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ai-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-600 block mb-1">Signal / Alert <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={signal}
              onChange={e => setSignal(e.target.value)}
              placeholder="e.g. Patient deterioration — Room 7, SpO2 dropping"
              className="w-full text-sm border border-brand-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ai-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-600 block mb-1">Decision Question <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={decision}
              onChange={e => setDecision(e.target.value)}
              placeholder="e.g. Escalate to attending or manage with current team?"
              className="w-full text-sm border border-brand-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ai-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-600 block mb-1">Action Taken <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={action}
              onChange={e => setAction(e.target.value)}
              placeholder="e.g. Rapid response called, attending notified"
              className="w-full text-sm border border-brand-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ai-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-600 block mb-1">Tags <span className="text-brand-400 font-normal">(comma separated)</span></label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g. deterioration, rapid-response"
              className="w-full text-sm border border-brand-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ai-400"
            />
          </div>

          {error && <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-brand-600 hover:bg-brand-100 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-ai-600 text-white rounded-lg hover:bg-ai-700 disabled:opacity-60 cursor-pointer whitespace-nowrap"
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
  onSaved: (outcomePositive: boolean) => void | Promise<void>;
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

    const delta = calculateLearningDelta(caseItem, outcomePositive);

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
    await onSaved(outcomePositive);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
          <div>
            <h3 className="text-base font-bold text-brand-900">Resolve Case</h3>
            <p className="text-xs text-brand-500 mt-0.5 truncate max-w-xs">{caseItem.role}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-brand-100 cursor-pointer">
            <i className="ri-close-line text-brand-500"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-500 mb-1">Action taken</p>
            <p className="text-sm text-brand-700 font-medium">{caseItem.action}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-600 block mb-1">Outcome Description <span className="text-rose-400">*</span></label>
            <textarea
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Describe what happened as a result of this decision..."
              className="w-full text-sm border border-brand-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ai-400 resize-none"
            />
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setOutcomePositive(true)}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-all ${
                outcomePositive
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-brand-200 text-brand-500 hover:bg-brand-50'
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
                  : 'bg-white border-brand-200 text-brand-500 hover:bg-brand-50'
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
              className="px-4 py-2 text-sm text-brand-600 hover:bg-brand-100 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !outcome.trim()}
              className="px-4 py-2 text-sm font-semibold bg-ai-600 text-white rounded-lg hover:bg-ai-700 disabled:opacity-60 cursor-pointer whitespace-nowrap"
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
  const { organizationId, user } = useAuth();
  const [cases, setCases] = useState<DecisionCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [showLogModal, setShowLogModal] = useState(false);
  const [resolveCase, setResolveCase] = useState<DecisionCase | null>(null);
  const [tick, setTick] = useState(0);
  const [learnFeed, setLearnFeed] = useState<string[] | null>(null);
  const [promotingLiveId, setPromotingLiveId] = useState<string | null>(null);
  const [pushingCaseId, setPushingCaseId] = useState<string | null>(null);
  const [linkedCaseActions, setLinkedCaseActions] = useState<Record<string, LinkedActionMeta>>({});

  const syncCaseActionOutcome = useCallback(async (
    caseId: string,
    nextOutcomeTags: string[],
    status: 'open' | 'in_progress' | 'completed' | 'blocked' | 'cancelled',
    progress: number
  ) => {
    if (!organizationId) return;

    const { data: linkedActions } = await supabase
      .from('action_items')
      .select('id, tags')
      .eq('organization_id', organizationId)
      .contains('tags', [`cpi-case:${caseId}`]);

    if (!linkedActions || linkedActions.length === 0) return;

    await Promise.all(
      linkedActions.map((item: any) =>
        supabase
          .from('action_items')
          .update({
            status,
            progress,
            tags: replaceCpiLifecycleTags(item.tags || [], nextOutcomeTags),
          })
          .eq('id', item.id)
      )
    );
  }, [organizationId]);

  const ensureActionItemForCase = useCallback(async (caseItem: DecisionCase) => {
    if (!organizationId || !user?.id) return null;

    const caseId = caseItem.id;
    const caseTags = buildActionTagsFromCase(caseItem, caseId, [
      `cpi-owner:${getCaseOwner(caseItem).toLowerCase().replace(/\s+/g, '-')}`,
    ]);

    const { data: existingAction } = await supabase
      .from('action_items')
      .select('id, status, progress, tags')
      .eq('organization_id', organizationId)
      .contains('tags', [`cpi-case:${caseId}`])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAction) {
      await supabase
        .from('action_items')
        .update({
          title: buildActionTitleFromCase(caseItem),
          description: buildActionDescriptionFromCase(caseItem),
          priority: caseItem.signal_severity === 'critical' ? 'critical' : 'high',
          due_date: new Date(Date.now() + (caseItem.signal_severity === 'critical' ? 0 : 24) * 60 * 60 * 1000).toISOString().slice(0, 10),
          tags: Array.from(new Set([...(existingAction.tags || []), ...caseTags])),
        })
        .eq('id', existingAction.id);

      return existingAction.id;
    }

    const dueDate = new Date(Date.now() + (caseItem.signal_severity === 'critical' ? 0 : 24) * 60 * 60 * 1000);
    const { data: insertedAction, error } = await supabase
      .from('action_items')
      .insert({
        organization_id: organizationId,
        created_by: user.id,
        title: buildActionTitleFromCase(caseItem),
        description: buildActionDescriptionFromCase(caseItem),
        assigned_to: null,
        status: 'open',
        priority: caseItem.signal_severity === 'critical' ? 'critical' : 'high',
        category: 'CPI Workflow',
        due_date: dueDate.toISOString().slice(0, 10),
        progress: 0,
        estimated_hours: 0,
        actual_hours: 0,
        tags: caseTags,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to create action item for CPI case:', error);
      return null;
    }

    return insertedAction?.id ?? null;
  }, [organizationId, user?.id]);

  const fetchCases = useCallback(async () => {
    const { data } = await supabase
      .from('cpi_decision_cases')
      .select('*')
      .order('created_at', { ascending: false });

    let mergedCases = (data as DecisionCase[]) || [];

    const trackedLiveCaseIds = new Set(
      mergedCases.flatMap((item) =>
        (item.tags || [])
          .filter((tag) => tag.startsWith('cpi-live-case:'))
          .map((tag) => tag.replace('cpi-live-case:', ''))
      )
    );

    if (organizationId) {
      const { data: metricRows, error: metricsError } = await supabase
        .from('metrics')
        .select('id, name, unit, current_value, target_value')
        .eq('organization_id', organizationId)
        .in('name', LIVE_METRIC_PRIORITY);

      if (!metricsError && metricRows && metricRows.length > 0) {
        const metricIds = metricRows.map(metric => metric.id);
        const { data: pointRows, error: pointsError } = await supabase
          .from('metric_data')
          .select('metric_id, value, timestamp')
          .in('metric_id', metricIds)
          .order('timestamp', { ascending: false })
          .limit(500);

        if (!pointsError) {
          const liveCases = buildLiveCases(metricRows as MetricRecord[], (pointRows as MetricPointRecord[]) || [])
            .filter((item) => !trackedLiveCaseIds.has(item.id));
          const existingIds = new Set(liveCases.map(item => item.id));
          mergedCases = [...liveCases, ...mergedCases.filter(item => !existingIds.has(item.id))];
        }
      }
    }

    setCases(mergedCases);

    if (organizationId) {
      const { data: actionRows } = await supabase
        .from('action_items')
        .select('id, status, progress, tags')
        .eq('organization_id', organizationId);

      const linkedMap: Record<string, LinkedActionMeta> = {};
      (actionRows || []).forEach((row: any) => {
        const caseTag = (row.tags || []).find((tag: string) => tag.startsWith('cpi-case:'));
        if (!caseTag) return;
        const caseId = caseTag.replace('cpi-case:', '');
        linkedMap[caseId] = {
          id: row.id,
          status: row.status,
          progress: typeof row.progress === 'number' ? row.progress : 0,
        };
      });
      setLinkedCaseActions(linkedMap);
    } else {
      setLinkedCaseActions({});
    }

    setLoading(false);
  }, [organizationId]);

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

  const promoteLiveCase = useCallback(async (caseItem: DecisionCase) => {
    setPromotingLiveId(caseItem.id);
    try {
      const { data, error } = await supabase
        .from('cpi_decision_cases')
        .insert(buildTrackedCaseFromLiveCase(caseItem))
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (data) {
        await ensureActionItemForCase(data as DecisionCase);
      }
      await fetchCases();
    } catch (error) {
      console.error('Failed to promote live case:', error);
    } finally {
      setPromotingLiveId(null);
    }
  }, [ensureActionItemForCase, fetchCases]);

  const pushTrackedCaseToActionTracker = useCallback(async (caseItem: DecisionCase) => {
    setPushingCaseId(caseItem.id);
    try {
      await ensureActionItemForCase(caseItem);
      await fetchCases();
    } finally {
      setPushingCaseId(null);
    }
  }, [ensureActionItemForCase, fetchCases]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-brand-900">Workflow-Embedded Decision Support</h2>
          <p className="text-sm text-brand-500 mt-0.5">Operational decision cases linked to live clinical signals and review workflows</p>
        </div>
        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-ai-600 text-white text-sm font-semibold rounded-lg hover:bg-ai-700 transition-colors cursor-pointer whitespace-nowrap"
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
          { label: 'Total Cases',    value: cases.length,        icon: 'ri-file-list-3-line',    color: 'text-brand-600 bg-brand-50  border-brand-100' },
          { label: 'Active',         value: activeCount,         icon: 'ri-pulse-line',           color: 'text-rose-600 bg-rose-50 border-rose-100' },
          { label: 'Resolved',       value: resolvedCount,       icon: 'ri-checkbox-circle-line', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
          { label: 'Positive Rate',  value: `${positiveRate}%`,  icon: 'ri-bar-chart-line',       color: 'text-ai-600 bg-ai-50 border-ai-100' },
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
      <div className="flex items-center space-x-1 mb-4 bg-brand-100 p-1 rounded-full w-fit">
        {(['all', 'active', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap capitalize ${
              filter === f ? 'bg-white text-brand-800 shadow-sm' : 'text-brand-500 hover:text-brand-700'
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
            <div key={i} className="bg-white rounded-xl border border-brand-100 p-5 animate-pulse">
              <div className="h-5 bg-brand-100 rounded w-48 mb-4"></div>
              <div className="h-12 bg-brand-100 rounded mb-3"></div>
              <div className="h-4 bg-brand-100 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-brand-100 rounded w-2/3 mb-3"></div>
              <div className="h-8 bg-brand-100 rounded"></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-brand-50 rounded-xl border border-brand-100">
          <div className="w-12 h-12 flex items-center justify-center mx-auto bg-brand-100 rounded-xl mb-3">
            <i className="ri-file-list-3-line text-brand-400 text-xl"></i>
          </div>
          <p className="text-sm font-semibold text-brand-600">No {filter !== 'all' ? filter : ''} cases</p>
            <p className="text-xs text-brand-400 mt-1">Use &ldquo;Log Case&rdquo; to document a new operational decision and follow-through</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map(c => {
            const isOpen = expandedId === c.id;
            const owner = getCaseOwner(c);
            const dueMeta = getCaseDueMeta(c);
            const auditMeta = getCaseAuditMeta(c);
            return (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-brand-100 overflow-hidden hover:border-brand-200 transition-all duration-300"
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
                      <i className={`ri-arrow-${isOpen ? 'up' : 'down'}-s-line text-brand-400`}></i>
                    </div>
                  </div>

                  {/* Signal */}
                  <div className={`flex items-start space-x-2.5 p-3 rounded-lg border mb-3 ${
                    c.signal_severity === 'critical' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'
                  }`}>
                    <i className={`ri-signal-tower-line text-base flex-shrink-0 mt-0.5 ${
                      c.signal_severity === 'critical' ? 'text-rose-500' : 'text-amber-500'
                    }`}></i>
                    <p className="text-xs font-medium text-brand-700">{c.signal}</p>
                  </div>

                  {/* Decision + Action */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-start space-x-2">
                      <i className="ri-scales-3-line text-brand-400 text-sm mt-0.5 flex-shrink-0"></i>
                      <p className="text-xs text-brand-600">{c.decision}</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <i className="ri-flashlight-line text-ai-500 text-sm mt-0.5 flex-shrink-0"></i>
                      <p className="text-xs text-brand-700 font-medium">{c.action}</p>
                    </div>
                  </div>

                  {/* Outcome or pending */}
                  {c.outcome ? (
                    <div className={`flex items-center space-x-2 p-2.5 rounded-lg ${c.outcome_positive ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                      <i className={`text-sm ${c.outcome_positive ? 'ri-checkbox-circle-line text-emerald-600' : 'ri-close-circle-line text-rose-600'}`}></i>
                      <p className="text-xs text-brand-700">{c.outcome}</p>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-brand-50 border border-brand-100">
                      <i className="ri-time-line text-brand-400 text-sm"></i>
                      <p className="text-xs text-brand-500">Outcome pending — resolve to feed the Learn stage</p>
                    </div>
                  )}

                  {/* Tags + timestamp */}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center flex-wrap gap-1">
                        {c.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-xs px-2 py-0.5 bg-brand-100 text-brand-500 rounded-full">{tag}</span>
                        ))}
                        {linkedCaseActions[c.id] && (
                          <span className="text-xs px-2 py-0.5 bg-ai-50 text-ai-700 rounded-full font-medium border border-ai-100">
                            In Action Tracker
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-brand-400 whitespace-nowrap">{timeAgo(c.created_at)}</span>
                    </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-brand-100">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-400">Owner</span>
                      <span className="text-xs font-medium text-brand-700 truncate">{owner}</span>
                    </div>
                    <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${dueMeta.tone}`}>
                      <i className={`${dueMeta.icon} text-xs`}></i>
                      <span>{dueMeta.label}</span>
                    </div>
                  </div>
                </div>

                {/* Expanded: intelligence cycle */}
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-brand-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-brand-500 uppercase tracking-wider">Intelligence Cycle</p>
                      {c.status === 'active' && !c.id.startsWith('live-case:') && (
                        <div className="flex items-center space-x-2">
                          {!linkedCaseActions[c.id] && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void pushTrackedCaseToActionTracker(c);
                              }}
                              disabled={pushingCaseId === c.id}
                              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-ai-200 text-ai-700 rounded-lg hover:bg-ai-50 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-send-plane-line text-sm"></i>
                              <span>{pushingCaseId === c.id ? 'Pushing...' : 'Push to Action Tracker'}</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setResolveCase(c); }}
                            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-ai-600 text-white rounded-lg hover:bg-ai-700 cursor-pointer whitespace-nowrap"
                          >
                            <i className="ri-loop-left-line text-sm"></i>
                            <span>Resolve &amp; Feed Models</span>
                          </button>
                        </div>
                      )}
                      {c.status === 'active' && c.id.startsWith('live-case:') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void promoteLiveCase(c);
                          }}
                          disabled={promotingLiveId === c.id}
                          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-file-add-line text-sm"></i>
                          <span>{promotingLiveId === c.id ? 'Logging case...' : 'Log As Tracked Case'}</span>
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
                        const cfg = stageConfig[step.stage] || { icon: 'ri-circle-line', color: 'text-brand-500 bg-brand-50' };
                        return (
                          <div key={i} className="flex items-start space-x-3">
                            <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${cfg.color}`}>
                              <i className={`${cfg.icon} text-xs`}></i>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-brand-700">{step.stage}</span>
                                {step.automated && (
                                  <span className="text-xs px-1.5 py-0.5 bg-ai-50 text-ai-600 rounded-full font-medium">Automated</span>
                                )}
                              </div>
                              <p className="text-xs text-brand-500 mt-0.5">{step.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Target models chip row for active cases */}
                    {c.status === 'active' && (
                      <div className="mt-3 pt-3 border-t border-brand-100">
                        <p className="text-xs text-brand-400 mb-1.5">Will feed learning data to:</p>
                        <div className="flex flex-wrap gap-1">
                          {getTargetModels(c).map(key => (
                            <span key={key} className="text-xs px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full font-medium whitespace-nowrap">
                              {MODEL_KEY_NAMES[key] ?? key}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-brand-100 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">Audit Trail</p>
                        <p className="text-xs text-brand-600 mt-1 truncate">
                          {auditMeta.label} · Owner: {owner}
                        </p>
                      </div>
                      <span className="text-xs text-brand-400 whitespace-nowrap">
                        {auditMeta.timestamp ? new Date(auditMeta.timestamp).toLocaleString() : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showLogModal && (
        <LogCaseModal
          onClose={() => setShowLogModal(false)}
          onSaved={fetchCases}
          onTrackedCaseSaved={async (caseItem) => {
            await ensureActionItemForCase(caseItem);
          }}
        />
      )}
      {resolveCase && (
        <ResolveModal
          caseItem={resolveCase}
          onClose={() => setResolveCase(null)}
          onSaved={async (outcomePositive) => {
            await syncCaseActionOutcome(
              resolveCase.id,
              [
                'cpi-source:decision-case',
                outcomePositive ? 'cpi-outcome:captured' : 'cpi-outcome:at_risk',
                'cpi-verification:complete',
              ],
              'completed',
              100
            );
            await fetchCases();
          }}
          onFed={(names) => setLearnFeed(names)}
        />
      )}
    </div>
  );
}
