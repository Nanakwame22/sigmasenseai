import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  loadAIEvaluationRegistry,
  type AIEvaluationEvent,
  type AIPromotionStage,
} from '../../services/aiEvaluationRegistry';
import {
  buildAILearningQueue,
  getLearningActionLabel,
  type AILearningDecisionAction,
} from '../../services/aiLearningQueue';

const stageLabels: Record<AIPromotionStage, string> = {
  shadow: 'Shadow',
  advisory: 'Advisory',
  supervised: 'Supervised',
  autonomous: 'Autonomous',
  blocked: 'Blocked',
};

const stageClasses: Record<AIPromotionStage, string> = {
  shadow: 'bg-slate-100 text-slate-700 border-slate-200',
  advisory: 'bg-sky-50 text-sky-700 border-sky-200',
  supervised: 'bg-amber-50 text-amber-700 border-amber-200',
  autonomous: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blocked: 'bg-rose-50 text-rose-700 border-rose-200',
};

const driftClasses: Record<AIEvaluationEvent['drift_state'], string> = {
  stable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  watch: 'bg-amber-50 text-amber-700 border-amber-200',
  drift: 'bg-rose-50 text-rose-700 border-rose-200',
};

const learningActionClasses: Record<AILearningDecisionAction, string> = {
  promote: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hold: 'bg-slate-50 text-slate-700 border-slate-200',
  demote: 'bg-rose-50 text-rose-700 border-rose-200',
  investigate: 'bg-amber-50 text-amber-700 border-amber-200',
};

const learningActionIcons: Record<AILearningDecisionAction, string> = {
  promote: 'ri-arrow-up-circle-line',
  hold: 'ri-pause-circle-line',
  demote: 'ri-arrow-down-circle-line',
  investigate: 'ri-search-eye-line',
};

function formatTime(value?: string | null) {
  if (!value) return 'Not evaluated yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function getTitle(event: AIEvaluationEvent) {
  const title = event.metadata?.title;
  return typeof title === 'string' && title.trim() ? title : event.subject_key;
}

function getStageMeaning(eventCount: number, autonomousCount: number, blockedCount: number) {
  if (eventCount === 0) {
    return 'No AI evaluations are visible yet. The app can still run, but autonomy should remain off until generation, outcome, and drift checks are being recorded.';
  }
  if (blockedCount > 0) {
    return 'Some AI outputs are being held back. That is healthy for production: SigmaSense is refusing autonomy when evidence, freshness, or outcome history is not strong enough.';
  }
  if (autonomousCount > 0) {
    return 'At least one AI output has enough evidence to qualify for autonomous action. Keep monitoring outcomes before widening that permission.';
  }
  return 'The intelligence layer is operating in advisory or supervised mode. That is the right posture while the system builds more verified outcome history.';
}

export default function AIHealthPage() {
  const { organizationId, user } = useAuth();
  const [events, setEvents] = useState<AIEvaluationEvent[]>([]);
  const [source, setSource] = useState<'registry' | 'embedded' | 'empty'>('empty');
  const [needsMigration, setNeedsMigration] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadRegistry() {
      setLoading(true);
      const result = await loadAIEvaluationRegistry({
        organizationId,
        userId: user?.id,
      });

      if (!active) return;
      setEvents(result.events);
      setSource(result.source);
      setNeedsMigration(result.needsMigration);
      setErrorMessage(result.errorMessage || '');
      setLoading(false);
    }

    loadRegistry();
    return () => {
      active = false;
    };
  }, [organizationId, user?.id]);

  const summary = useMemo(() => {
    const latestBySubject = new Map<string, AIEvaluationEvent>();

    events.forEach((event) => {
      const key = `${event.subject_type}:${event.subject_id}`;
      const existing = latestBySubject.get(key);
      if (!existing || new Date(event.evaluated_at) > new Date(existing.evaluated_at)) {
        latestBySubject.set(key, event);
      }
    });

    const latestEvents = Array.from(latestBySubject.values());
    const stageCounts = latestEvents.reduce<Record<AIPromotionStage, number>>(
      (acc, event) => {
        acc[event.promotion_stage] += 1;
        return acc;
      },
      { shadow: 0, advisory: 0, supervised: 0, autonomous: 0, blocked: 0 }
    );

    const driftCount = latestEvents.filter((event) => event.drift_state === 'drift').length;
    const watchCount = latestEvents.filter((event) => event.drift_state === 'watch').length;
    const autonomousCount = latestEvents.filter((event) => event.can_auto_act).length;
    const supervisedCount = latestEvents.filter((event) => event.can_create_work && !event.can_auto_act).length;
    const averageEvidence = average(latestEvents.map((event) => event.evidence_coverage));
    const averageScore = average(latestEvents.map((event) => event.evaluation_score));
    const outcomeVerified = latestEvents.filter((event) => event.outcome === 'positive' || event.outcome === 'negative').length;

    return {
      latestEvents,
      stageCounts,
      driftCount,
      watchCount,
      autonomousCount,
      supervisedCount,
      averageEvidence,
      averageScore,
      outcomeVerified,
    };
  }, [events]);

  const learningQueue = useMemo(() => buildAILearningQueue(events), [events]);

  const stageMeaning = getStageMeaning(
    summary.latestEvents.length,
    summary.autonomousCount,
    summary.stageCounts.blocked
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-[#102638] to-[#0f3d44] p-8 text-white shadow-elevation-3">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-ai-300/30 bg-ai-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.28em] text-ai-200">
              <i className="ri-shield-check-line"></i>
              AI Governance Layer
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight">AI Health & Model Registry</h1>
            <p className="mt-3 text-base leading-7 text-white/72">
              Track whether SigmaSense intelligence is ready for autonomy, still needs human supervision,
              or should be blocked until evidence and outcome history improve.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Evaluated</p>
              <p className="mt-2 text-3xl font-black">{summary.latestEvents.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Autonomous</p>
              <p className="mt-2 text-3xl font-black text-emerald-300">{summary.autonomousCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Avg Trust</p>
              <p className="mt-2 text-3xl font-black text-ai-200">{summary.averageScore}%</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Drift Watch</p>
              <p className="mt-2 text-3xl font-black text-amber-200">{summary.driftCount + summary.watchCount}</p>
            </div>
          </div>
        </div>
      </section>

      {(needsMigration || errorMessage || source === 'embedded') && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <div className="flex items-start gap-3">
            <i className="ri-information-line mt-0.5 text-xl"></i>
            <div>
              <h2 className="font-bold">Registry storage is not fully promoted yet</h2>
              <p className="mt-1 text-sm leading-6">
                {errorMessage ||
                  'SigmaSense is reading embedded recommendation evaluation history right now. Apply supabase/ai_evaluation_registry.sql to enable durable model audit storage.'}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-brand-900">Promotion Stage Mix</h2>
              <p className="mt-1 text-sm text-brand-500">The safest level of action each AI output is currently allowed to take.</p>
            </div>
            <span className="rounded-full border border-ai-200 bg-ai-50 px-3 py-1 text-xs font-bold text-ai-700">
              Source: {source === 'registry' ? 'Durable registry' : source === 'embedded' ? 'Embedded fallback' : 'Waiting for events'}
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {(Object.keys(stageLabels) as AIPromotionStage[]).map((stage) => {
              const count = summary.stageCounts[stage];
              const percentage = summary.latestEvents.length > 0 ? Math.round((count / summary.latestEvents.length) * 100) : 0;
              return (
                <div key={stage}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-bold text-brand-800">{stageLabels[stage]}</span>
                    <span className="text-brand-500">{count} model output{count === 1 ? '' : 's'} · {percentage}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        stage === 'autonomous'
                          ? 'bg-emerald-500'
                          : stage === 'supervised'
                            ? 'bg-amber-500'
                            : stage === 'blocked'
                              ? 'bg-rose-500'
                              : stage === 'advisory'
                                ? 'bg-sky-500'
                                : 'bg-slate-400'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ai-50 text-ai-700">
            <i className="ri-brain-line text-2xl"></i>
          </div>
          <h2 className="mt-4 text-xl font-black text-brand-900">What This Means</h2>
          <p className="mt-3 text-sm leading-6 text-brand-600">{stageMeaning}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400">Evidence</p>
              <p className="mt-1 text-2xl font-black text-brand-900">{summary.averageEvidence}%</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400">Outcomes</p>
              <p className="mt-1 text-2xl font-black text-brand-900">{summary.outcomeVerified}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          {
            label: 'Human-Supervised Work',
            value: summary.supervisedCount,
            icon: 'ri-user-follow-line',
            text: 'AI can create or support work, but a person still owns the decision.',
          },
          {
            label: 'Blocked Autonomy',
            value: summary.stageCounts.blocked,
            icon: 'ri-lock-line',
            text: 'Outputs held back because evidence, freshness, or controls are insufficient.',
          },
          {
            label: 'Drift / Watch Items',
            value: summary.driftCount + summary.watchCount,
            icon: 'ri-radar-line',
            text: 'Models that should be reviewed before expanding trust.',
          },
          {
            label: 'Verified Outcomes',
            value: summary.outcomeVerified,
            icon: 'ri-checkbox-circle-line',
            text: 'AI decisions with positive or negative real-world feedback attached.',
          },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-brand-700">
                <i className={`${card.icon} text-xl`}></i>
              </div>
              <p className="text-3xl font-black text-brand-900">{card.value}</p>
            </div>
            <h3 className="mt-4 font-black text-brand-900">{card.label}</h3>
            <p className="mt-2 text-sm leading-5 text-brand-500">{card.text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-ai-100 bg-ai-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-ai-700">
              <i className="ri-loop-left-line"></i>
              Outcome Learning
            </div>
            <h2 className="mt-3 text-xl font-black text-brand-900">AI Learning Queue</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-500">
              Verified outcomes are converted into promotion, demotion, and investigation decisions so the intelligence layer can become safer over time instead of just changing labels.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['demote', 'investigate', 'promote', 'hold'] as AILearningDecisionAction[]).map((action) => {
              const count = learningQueue.filter((item) => item.action === action).length;
              return (
                <div key={action} className={`rounded-xl border px-3 py-2 ${learningActionClasses[action]}`}>
                  <p className="text-[10px] font-black uppercase tracking-widest">{getLearningActionLabel(action)}</p>
                  <p className="mt-1 text-2xl font-black">{count}</p>
                </div>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center text-brand-500">
            <i className="ri-loader-4-line mr-2 animate-spin text-xl"></i>
            Building learning decisions...
          </div>
        ) : learningQueue.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-brand-400">
              <i className="ri-loop-left-line text-2xl"></i>
            </div>
            <h3 className="mt-4 text-lg font-black text-brand-900">No learning decisions yet</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-brand-500">
              Resolve cases, verify forecast outcomes, or close recommendation work. Once outcomes exist,
              SigmaSense will decide whether each AI output should be promoted, held, investigated, or demoted.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-6 lg:grid-cols-2">
            {learningQueue.slice(0, 8).map((item) => (
              <article key={item.id} className="rounded-2xl border border-border bg-slate-50/70 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${learningActionClasses[item.action]}`}>
                        <i className={learningActionIcons[item.action]}></i>
                        {getLearningActionLabel(item.action)}
                      </span>
                      <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-bold capitalize text-brand-500">
                        {item.subjectType.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="mt-3 line-clamp-2 text-lg font-black text-brand-900">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-brand-600">{item.rationale}</p>
                  </div>
                  <div className="shrink-0 rounded-2xl border border-white bg-white p-3 text-center shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-400">Priority</p>
                    <p className="mt-1 text-2xl font-black text-brand-900">{item.priority}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-400">Stage</p>
                    <p className="mt-1 text-sm font-black text-brand-800">
                      {stageLabels[item.currentStage]} → {stageLabels[item.proposedStage]}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-400">Outcomes</p>
                    <p className="mt-1 text-sm font-black text-brand-800">
                      {item.positiveOutcomes}+ / {item.negativeOutcomes}-
                    </p>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-400">Trust</p>
                    <p className="mt-1 text-sm font-black text-brand-800">{item.averageScore}%</p>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-400">Drift</p>
                    <p className="mt-1 text-sm font-black text-brand-800">{item.driftEvents} drift · {item.watchEvents} watch</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-border bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400">Next control</p>
                  <p className="mt-2 text-sm leading-6 text-brand-600">{item.nextControl}</p>
                  <p className="mt-3 text-xs text-brand-400">
                    Evidence {item.averageEvidence}% · confidence {item.confidence}% · last evaluated {formatTime(item.latestEvaluatedAt)} · {item.sourceLabel}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border p-6">
          <h2 className="text-xl font-black text-brand-900">Live Evaluation Registry</h2>
          <p className="mt-1 text-sm text-brand-500">
            Latest model and recommendation evaluations, including the controls that decide whether AI can act alone.
          </p>
        </div>

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center text-brand-500">
            <i className="ri-loader-4-line mr-2 animate-spin text-xl"></i>
            Loading AI health evidence...
          </div>
        ) : summary.latestEvents.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-brand-400">
              <i className="ri-database-2-line text-2xl"></i>
            </div>
            <h3 className="mt-4 text-lg font-black text-brand-900">No AI evaluations yet</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-brand-500">
              Generate or verify recommendations first. Once the AI records generation, start, outcome, backtest,
              or drift-check events, they will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-brand-400">AI Output</th>
                  <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-brand-400">Stage</th>
                  <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-brand-400">Trust</th>
                  <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-brand-400">Drift</th>
                  <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-brand-400">Evidence</th>
                  <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-brand-400">Last Eval</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {summary.latestEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="max-w-md px-6 py-4">
                      <p className="font-bold text-brand-900">{getTitle(event)}</p>
                      <p className="mt-1 text-xs text-brand-500">
                        {event.subject_type.replace('_', ' ')} · {event.phase.replace('_', ' ')} · {event.source_label}
                      </p>
                      {event.reasons.length > 0 && (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-brand-500">{event.reasons[0]}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${stageClasses[event.promotion_stage]}`}>
                        {stageLabels[event.promotion_stage]}
                      </span>
                      <p className="mt-2 text-xs text-brand-400">{event.autonomy_level}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-lg font-black text-brand-900">{event.evaluation_score}%</p>
                      <p className="text-xs text-brand-400">confidence {event.confidence_score}%</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold capitalize ${driftClasses[event.drift_state]}`}>
                        {event.drift_state}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-28">
                        <div className="mb-1 flex justify-between text-xs text-brand-500">
                          <span>{event.evidence_coverage}%</span>
                          <span>{event.freshness_state}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-ai-500" style={{ width: `${Math.min(100, Math.max(0, event.evidence_coverage))}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-brand-500">{formatTime(event.evaluated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
