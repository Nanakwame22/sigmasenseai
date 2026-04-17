import type {
  AIEvaluationEvent,
  AIEvaluationOutcome,
  AIEvaluationSubjectType,
  AIPromotionStage,
} from './aiEvaluationRegistry';

export type AILearningDecisionAction = 'promote' | 'hold' | 'demote' | 'investigate';

export interface AILearningQueueItem {
  id: string;
  subjectType: AIEvaluationSubjectType;
  subjectId: string;
  title: string;
  sourceLabel: string;
  currentStage: AIPromotionStage;
  proposedStage: AIPromotionStage;
  action: AILearningDecisionAction;
  priority: number;
  confidence: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  inconclusiveOutcomes: number;
  pendingOutcomes: number;
  driftEvents: number;
  watchEvents: number;
  averageScore: number;
  averageEvidence: number;
  latestEvaluatedAt: string;
  rationale: string;
  nextControl: string;
}

const stageOrder: AIPromotionStage[] = ['blocked', 'shadow', 'advisory', 'supervised', 'autonomous'];

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function sortByNewest(a: AIEvaluationEvent, b: AIEvaluationEvent) {
  return new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime();
}

function getTitle(event: AIEvaluationEvent) {
  const title = event.metadata?.title;
  if (typeof title === 'string' && title.trim()) return title;

  const modelKey = event.metadata?.model_key;
  if (typeof modelKey === 'string' && modelKey.trim()) return modelKey;

  const metricName = event.metadata?.metric_name;
  if (typeof metricName === 'string' && metricName.trim()) return metricName;

  return event.subject_key;
}

function countOutcomes(events: AIEvaluationEvent[], outcome: AIEvaluationOutcome) {
  return events.filter((event) => event.outcome === outcome).length;
}

function promoteStage(stage: AIPromotionStage): AIPromotionStage {
  const index = stageOrder.indexOf(stage);
  if (index < 0) return 'advisory';
  return stageOrder[Math.min(stageOrder.length - 1, index + 1)];
}

function demoteStage(stage: AIPromotionStage): AIPromotionStage {
  const index = stageOrder.indexOf(stage);
  if (index <= 0) return 'blocked';
  return stageOrder[Math.max(0, index - 1)];
}

function getActionLabel(action: AILearningDecisionAction) {
  if (action === 'promote') return 'Promote';
  if (action === 'demote') return 'Demote';
  if (action === 'investigate') return 'Investigate';
  return 'Hold';
}

export function getLearningActionLabel(action: AILearningDecisionAction) {
  return getActionLabel(action);
}

export function buildAILearningQueue(events: AIEvaluationEvent[]): AILearningQueueItem[] {
  const grouped = new Map<string, AIEvaluationEvent[]>();

  events.forEach((event) => {
    const key = `${event.subject_type}:${event.subject_id}`;
    const existing = grouped.get(key) || [];
    existing.push(event);
    grouped.set(key, existing);
  });

  return Array.from(grouped.entries())
    .map(([id, subjectEvents]) => {
      const ordered = [...subjectEvents].sort(sortByNewest);
      const latest = ordered[0];
      const recent = ordered.slice(0, 12);
      const positiveOutcomes = countOutcomes(recent, 'positive');
      const negativeOutcomes = countOutcomes(recent, 'negative');
      const inconclusiveOutcomes = countOutcomes(recent, 'inconclusive');
      const pendingOutcomes = countOutcomes(recent, 'pending');
      const driftEvents = recent.filter((event) => event.drift_state === 'drift').length;
      const watchEvents = recent.filter((event) => event.drift_state === 'watch').length;
      const averageScore = average(recent.map((event) => event.evaluation_score));
      const averageEvidence = average(recent.map((event) => event.evidence_coverage));

      let action: AILearningDecisionAction = 'hold';
      let proposedStage = latest.promotion_stage;
      let priority = 35;
      let rationale = 'Keep collecting verified outcomes before changing this AI output permission.';
      let nextControl = latest.required_controls[0] || 'Continue monitoring evaluation score, drift, and outcome history.';

      const shouldDemote =
        negativeOutcomes > 0 ||
        driftEvents >= 2 ||
        averageScore < 45 ||
        (latest.drift_state === 'drift' && latest.outcome !== 'positive');

      const shouldPromote =
        !shouldDemote &&
        latest.promotion_stage !== 'autonomous' &&
        positiveOutcomes >= 2 &&
        negativeOutcomes === 0 &&
        driftEvents === 0 &&
        averageScore >= 78 &&
        averageEvidence >= 70;

      const shouldInvestigate =
        !shouldDemote &&
        !shouldPromote &&
        (inconclusiveOutcomes > 0 ||
          watchEvents > 0 ||
          latest.drift_state === 'watch' ||
          averageEvidence < 60 ||
          pendingOutcomes >= 3);

      if (shouldDemote) {
        action = 'demote';
        proposedStage = averageScore < 45 || negativeOutcomes >= 2 ? 'blocked' : demoteStage(latest.promotion_stage);
        priority = Math.max(82, 92 - averageScore + negativeOutcomes * 4 + driftEvents * 3);
        rationale =
          negativeOutcomes > 0
            ? 'Recent verified outcomes include misses, so this AI should lose autonomy until the failure pattern is reviewed.'
            : 'Recent evaluations show drift or weak reliability, so this AI should be moved to a safer operating stage.';
        nextControl =
          latest.required_controls[0] ||
          'Review failed outcomes, retrain or recalibrate the model, and require human approval before execution.';
      } else if (shouldPromote) {
        action = 'promote';
        proposedStage = promoteStage(latest.promotion_stage);
        priority = 76 + Math.min(18, positiveOutcomes * 4);
        rationale =
          'Verified outcomes are consistently positive, evidence coverage is strong, and no recent drift was detected.';
        nextControl =
          proposedStage === 'autonomous'
            ? 'Promote only with audit logging, rollback criteria, and live drift monitoring enabled.'
            : 'Move to the next supervised stage and keep capturing outcomes before autonomy.';
      } else if (shouldInvestigate) {
        action = 'investigate';
        proposedStage = latest.promotion_stage;
        priority = 58 + watchEvents * 4 + inconclusiveOutcomes * 3 + (averageEvidence < 60 ? 8 : 0);
        rationale =
          'The signal is useful, but outcome history, evidence coverage, or drift watch status is not strong enough for a stage change.';
        nextControl =
          latest.required_controls[0] ||
          'Collect clearer outcome feedback and add more source-backed evidence before promotion.';
      }

      return {
        id,
        subjectType: latest.subject_type,
        subjectId: latest.subject_id,
        title: getTitle(latest),
        sourceLabel: latest.source_label,
        currentStage: latest.promotion_stage,
        proposedStage,
        action,
        priority: Math.min(100, Math.round(priority)),
        confidence: average(recent.map((event) => event.confidence_score)),
        positiveOutcomes,
        negativeOutcomes,
        inconclusiveOutcomes,
        pendingOutcomes,
        driftEvents,
        watchEvents,
        averageScore,
        averageEvidence,
        latestEvaluatedAt: latest.evaluated_at,
        rationale,
        nextControl,
      };
    })
    .sort((a, b) => {
      const actionWeight: Record<AILearningDecisionAction, number> = {
        demote: 4,
        promote: 3,
        investigate: 2,
        hold: 1,
      };
      const priorityDelta = actionWeight[b.action] - actionWeight[a.action];
      if (priorityDelta !== 0) return priorityDelta;
      return b.priority - a.priority;
    });
}
