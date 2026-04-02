import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { CPIDomainSnapshot } from '../../../hooks/useCPIData';

// ── Types ──────────────────────────────────────────────────────────────────

type ActionType = 'escalate' | 'flag' | 'assign';
type Phase = 'pick' | 'form' | 'success';

interface Props {
  domain: CPIDomainSnapshot;
  domainName: string;
  domainIcon: string;
  onClose: () => void;
}

// ── Config maps ─────────────────────────────────────────────────────────────

const ESCALATION_TARGETS = [
  'Charge Nurse',
  'Attending Physician',
  'House Supervisor',
  'ED Director',
  'Rapid Response Team',
  'Administrator On-Call',
];

const ASSIGN_TARGETS = [
  'Charge Nurse',
  'Bed Manager',
  'Lab Supervisor',
  'Discharge Coordinator',
  'Care Transition Navigator',
  'House Supervisor',
];

const ROLE_ICON_MAP: Record<string, string> = {
  'Charge Nurse':               'ri-nurse-line',
  'Attending Physician':        'ri-stethoscope-line',
  'House Supervisor':           'ri-building-2-line',
  'ED Director':                'ri-hospital-line',
  'Rapid Response Team':        'ri-alarm-warning-line',
  'Administrator On-Call':      'ri-user-settings-line',
  'Bed Manager':                'ri-hotel-bed-line',
  'Lab Supervisor':             'ri-test-tube-line',
  'Discharge Coordinator':      'ri-door-open-line',
  'Care Transition Navigator':  'ri-team-line',
};

const ROLE_COLOR_MAP: Record<string, string> = {
  'Charge Nurse':               'text-rose-600 bg-rose-50 border-rose-100',
  'Attending Physician':        'text-indigo-600 bg-indigo-50 border-indigo-100',
  'House Supervisor':           'text-amber-600 bg-amber-50 border-amber-100',
  'ED Director':                'text-teal-600 bg-teal-50 border-teal-100',
  'Rapid Response Team':        'text-rose-600 bg-rose-50 border-rose-100',
  'Administrator On-Call':      'text-slate-600 bg-slate-50 border-slate-100',
  'Bed Manager':                'text-amber-600 bg-amber-50 border-amber-100',
  'Lab Supervisor':             'text-teal-600 bg-teal-50 border-teal-100',
  'Discharge Coordinator':      'text-emerald-600 bg-emerald-50 border-emerald-100',
  'Care Transition Navigator':  'text-violet-600 bg-violet-50 border-violet-100',
};

const ACTION_META: Record<ActionType, { icon: string; label: string; desc: string; color: string; bg: string; border: string }> = {
  escalate: {
    icon: 'ri-alarm-warning-line',
    label: 'Escalate to Team',
    desc: 'Fire an escalation alert to a clinical role — lands in the Real-Time Feed immediately',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
  },
  flag: {
    icon: 'ri-flag-2-line',
    label: 'Flag for Review',
    desc: 'Mark this domain for clinical review — logged to Decision Support as an active case',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  assign: {
    icon: 'ri-user-add-line',
    label: 'Assign Task',
    desc: 'Assign a specific action item to a team member — logged with due time',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
  },
};

const DUE_OPTIONS = ['Immediately', 'Within 30 min', 'Within 1 hour', 'Before next check', 'Next shift'];

// ── Risk badge ──────────────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  const [color, label] =
    score >= 75 ? ['bg-rose-100 text-rose-700', 'Critical'] :
    score >= 55 ? ['bg-orange-100 text-orange-700', 'Elevated'] :
    score >= 35 ? ['bg-amber-100 text-amber-700', 'Moderate'] :
                  ['bg-emerald-100 text-emerald-700', 'Stable'];
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {label} · {score}
    </span>
  );
}

// ── Main modal ──────────────────────────────────────────────────────────────

export default function DomainActionModal({ domain, domainName, domainIcon, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [err, setErr] = useState('');

  // Escalate form
  const [escTarget, setEscTarget] = useState(ESCALATION_TARGETS[0]);
  const [escUrgency, setEscUrgency] = useState<'critical' | 'warning'>('warning');
  const [escMessage, setEscMessage] = useState('');

  // Flag form
  const [flagPriority, setFlagPriority] = useState<'critical' | 'warning'>('warning');
  const [flagNote, setFlagNote] = useState('');

  // Assign form
  const [assignTarget, setAssignTarget] = useState(ASSIGN_TARGETS[0]);
  const [assignTask, setAssignTask] = useState('');
  const [assignDue, setAssignDue] = useState(DUE_OPTIONS[0]);

  const selectAction = (type: ActionType) => {
    setActionType(type);
    setErr('');
    setPhase('form');
  };

  // ── Submit handlers ──────────────────────────────────────────────────────

  const handleEscalate = async () => {
    setSaving(true);
    setErr('');
    const { error } = await supabase.from('cpi_feed').insert({
      category: domain.domain_id,
      severity: escUrgency,
      title: `Escalation — ${domainName} → ${escTarget}`,
      body: escMessage.trim() || `Immediate review of ${domainName} requested. Risk score: ${domain.risk_score}.`,
      action_label: 'Acknowledge',
      icon: 'ri-alarm-warning-line',
      acknowledged: false,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSuccessMsg(`Escalation alert fired to ${escTarget} — visible in Real-Time Feed now.`);
    setPhase('success');
  };

  const handleFlag = async () => {
    if (!flagNote.trim()) { setErr('Please add a note before flagging.'); return; }
    setSaving(true);
    setErr('');
    const { error } = await supabase.from('cpi_decision_cases').insert({
      role: `${domainName} Monitor`,
      role_icon: domainIcon,
      role_color: 'text-amber-600 bg-amber-50 border-amber-100',
      signal: `${domainName} flagged for review — risk score ${domain.risk_score} (${domain.status})`,
      signal_severity: flagPriority,
      decision: 'Manual flag — requires clinical review and follow-up',
      action: flagNote.trim(),
      steps: [
        { stage: 'Sense',   description: `${domainName} risk index ${domain.risk_score} detected`, automated: true },
        { stage: 'Analyze', description: 'Domain metrics reviewed against clinical thresholds', automated: true },
        { stage: 'Decide',  description: 'Manual flag raised by clinician', automated: false },
        { stage: 'Act',     description: flagNote.trim(), automated: false },
        { stage: 'Learn',   description: 'Outcome pending — resolve to feed the Learn stage', automated: false },
      ],
      status: 'active',
      tags: [domain.domain_id, 'flagged', domain.status],
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSuccessMsg(`${domainName} flagged and logged to Decision Support as an active case.`);
    setPhase('success');
  };

  const handleAssign = async () => {
    if (!assignTask.trim()) { setErr('Please describe the task before assigning.'); return; }
    setSaving(true);
    setErr('');
    const { error } = await supabase.from('cpi_decision_cases').insert({
      role: assignTarget,
      role_icon: ROLE_ICON_MAP[assignTarget] ?? 'ri-user-line',
      role_color: ROLE_COLOR_MAP[assignTarget] ?? 'text-slate-600 bg-slate-50 border-slate-100',
      signal: `Task assigned via ${domainName} — risk score ${domain.risk_score}`,
      signal_severity: domain.risk_score >= 75 ? 'critical' : 'warning',
      decision: `Assign task to ${assignTarget}: ${assignTask.trim()}`,
      action: `${assignTask.trim()} — Due: ${assignDue}`,
      steps: [
        { stage: 'Sense',   description: `${domainName} operational signal detected`, automated: true },
        { stage: 'Analyze', description: 'Domain context reviewed, task identified', automated: true },
        { stage: 'Decide',  description: `Assigned to ${assignTarget} — due ${assignDue}`, automated: false },
        { stage: 'Act',     description: assignTask.trim(), automated: false },
        { stage: 'Learn',   description: 'Outcome pending — resolve to feed the Learn stage', automated: false },
      ],
      status: 'active',
      tags: [domain.domain_id, 'assigned', assignTarget.toLowerCase().replace(/\s+/g, '-')],
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSuccessMsg(`Task assigned to ${assignTarget} (${assignDue}) — logged in Decision Support.`);
    setPhase('success');
  };

  const handleSubmit = async () => {
    if (actionType === 'escalate') await handleEscalate();
    else if (actionType === 'flag') await handleFlag();
    else if (actionType === 'assign') await handleAssign();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl">
              <i className={`${domainIcon} text-slate-600 text-base`}></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{domainName}</h3>
              <div className="flex items-center space-x-2 mt-0.5">
                <RiskBadge score={domain.risk_score} />
                {phase === 'form' && actionType && (
                  <span className="text-xs text-slate-400">→ {ACTION_META[actionType].label}</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500"></i>
          </button>
        </div>

        <div className="px-6 py-5">
          {/* ── Phase: Pick action ── */}
          {phase === 'pick' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 mb-4">Choose an action for this domain</p>
              {(Object.entries(ACTION_META) as [ActionType, typeof ACTION_META[ActionType]][]).map(([type, meta]) => (
                <button
                  key={type}
                  onClick={() => selectAction(type)}
                  className={`w-full flex items-start space-x-4 p-4 rounded-xl border-2 text-left transition-all cursor-pointer hover:scale-[1.01] ${meta.bg} ${meta.border}`}
                >
                  <div className={`w-9 h-9 flex items-center justify-center rounded-xl bg-white border ${meta.border} flex-shrink-0 mt-0.5`}>
                    <i className={`${meta.icon} ${meta.color} text-base`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${meta.color}`}>{meta.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{meta.desc}</p>
                  </div>
                  <i className="ri-arrow-right-s-line text-slate-400 mt-1 flex-shrink-0"></i>
                </button>
              ))}
            </div>
          )}

          {/* ── Phase: Form ── */}
          {phase === 'form' && actionType && (
            <div className="space-y-4">
              {/* Domain context chip */}
              <div className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <i className={`${domainIcon} text-slate-500 text-sm`}></i>
                <span className="text-xs text-slate-600 font-medium">{domainName}</span>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500">Risk {domain.risk_score} · {domain.status}</span>
              </div>

              {/* ── Escalate form ── */}
              {actionType === 'escalate' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Escalate to</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ESCALATION_TARGETS.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setEscTarget(t)}
                          className={`flex items-center space-x-2 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                            escTarget === t
                              ? 'bg-rose-50 border-rose-300 text-rose-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <i className={`${ROLE_ICON_MAP[t] ?? 'ri-user-line'} text-xs`}></i>
                          <span className="whitespace-nowrap">{t}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Urgency</label>
                    <div className="flex space-x-2">
                      {(['critical', 'warning'] as const).map(u => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setEscUrgency(u)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all capitalize ${
                            escUrgency === u
                              ? u === 'critical'
                                ? 'bg-rose-50 border-rose-300 text-rose-700'
                                : 'bg-amber-50 border-amber-300 text-amber-700'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {u === 'critical' ? 'Critical' : 'Urgent'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                      Additional note <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={escMessage}
                      onChange={e => setEscMessage(e.target.value)}
                      rows={2}
                      maxLength={300}
                      placeholder="Any specific context to include in the alert…"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none"
                    />
                  </div>
                </>
              )}

              {/* ── Flag form ── */}
              {actionType === 'flag' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Priority</label>
                    <div className="flex space-x-2">
                      {(['critical', 'warning'] as const).map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setFlagPriority(p)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all capitalize ${
                            flagPriority === p
                              ? p === 'critical'
                                ? 'bg-rose-50 border-rose-300 text-rose-700'
                                : 'bg-amber-50 border-amber-300 text-amber-700'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {p === 'critical' ? 'High' : 'Medium'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                      Review note <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={flagNote}
                      onChange={e => setFlagNote(e.target.value)}
                      rows={3}
                      maxLength={400}
                      placeholder="Describe what needs to be reviewed and why…"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                    />
                  </div>
                </>
              )}

              {/* ── Assign form ── */}
              {actionType === 'assign' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Assign to</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ASSIGN_TARGETS.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAssignTarget(t)}
                          className={`flex items-center space-x-2 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                            assignTarget === t
                              ? 'bg-teal-50 border-teal-300 text-teal-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <i className={`${ROLE_ICON_MAP[t] ?? 'ri-user-line'} text-xs`}></i>
                          <span className="whitespace-nowrap">{t}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                      Task description <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={assignTask}
                      onChange={e => setAssignTask(e.target.value)}
                      rows={2}
                      maxLength={300}
                      placeholder="What needs to be done?"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Due</label>
                    <div className="flex flex-wrap gap-2">
                      {DUE_OPTIONS.map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setAssignDue(d)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all whitespace-nowrap ${
                            assignDue === d
                              ? 'bg-teal-50 border-teal-300 text-teal-700'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {err && (
                <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{err}</p>
              )}

              {/* Form footer */}
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => { setPhase('pick'); setErr(''); }}
                  className="flex items-center space-x-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-arrow-left-s-line"></i>
                  <span>Back</span>
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className={`flex items-center space-x-2 px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                    actionType === 'escalate' ? 'bg-rose-600 hover:bg-rose-700' :
                    actionType === 'flag'     ? 'bg-amber-500 hover:bg-amber-600' :
                    'bg-teal-600 hover:bg-teal-700'
                  }`}
                >
                  {saving ? (
                    <>
                      <i className="ri-loader-4-line text-sm animate-spin"></i>
                      <span>Saving…</span>
                    </>
                  ) : (
                    <>
                      <i className={`${
                        actionType === 'escalate' ? 'ri-alarm-warning-line' :
                        actionType === 'flag'     ? 'ri-flag-2-line' :
                        'ri-user-add-line'
                      } text-sm`}></i>
                      <span>{
                        actionType === 'escalate' ? 'Fire Escalation' :
                        actionType === 'flag'     ? 'Flag for Review' :
                        'Assign Task'
                      }</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Phase: Success ── */}
          {phase === 'success' && (
            <div className="flex flex-col items-center py-6 text-center">
              <div className={`w-14 h-14 flex items-center justify-center rounded-2xl mb-4 ${
                actionType === 'escalate' ? 'bg-rose-50' :
                actionType === 'flag'     ? 'bg-amber-50' :
                'bg-teal-50'
              }`}>
                <i className={`text-2xl ${
                  actionType === 'escalate' ? 'ri-alarm-warning-line text-rose-500' :
                  actionType === 'flag'     ? 'ri-flag-2-line text-amber-500' :
                  'ri-checkbox-circle-line text-teal-500'
                }`}></i>
              </div>
              <p className="text-sm font-bold text-slate-900 mb-2">Done!</p>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs">{successMsg}</p>
              <button
                onClick={onClose}
                className="mt-5 px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
