import { supabase } from '../lib/supabase';
import { assessDecisionAutonomy, type AutonomyLevel } from './intelligenceGovernance';

export type AIEvaluationSubjectType = 'recommendation' | 'forecast' | 'cpi_model' | 'aim_alert' | 'decision';
export type AIEvaluationPhase = 'generated' | 'started' | 'outcome_positive' | 'outcome_negative' | 'backtest' | 'drift_check';
export type AIPromotionStage = 'shadow' | 'advisory' | 'supervised' | 'autonomous' | 'blocked';
export type AIEvaluationOutcome = 'pending' | 'positive' | 'negative' | 'inconclusive';

export interface AIEvaluationSubject {
  id: string;
  organization_id?: string | null;
  user_id?: string | null;
  title?: string | null;
  category?: string | null;
  priority?: string | null;
  impact_score?: number | null;
  confidence_score?: number | null;
  status?: string | null;
  source_data?: any;
}

export interface AIEvaluationEvent {
  id: string;
  organization_id?: string | null;
  subject_type: AIEvaluationSubjectType;
  subject_id: string;
  subject_key: string;
  phase: AIEvaluationPhase;
  promotion_stage: AIPromotionStage;
  autonomy_level: AutonomyLevel;
  evaluation_score: number;
  confidence_score: number;
  evidence_coverage: number;
  source_label: string;
  freshness_state: string;
  outcome: AIEvaluationOutcome;
  drift_state: 'stable' | 'watch' | 'drift';
  can_auto_act: boolean;
  can_create_work: boolean;
  can_recommend: boolean;
  reasons: string[];
  required_controls: string[];
  evaluated_at: string;
  metadata: Record<string, unknown>;
}

interface BuildRecommendationEvaluationInput {
  recommendation: AIEvaluationSubject;
  phase: AIEvaluationPhase;
  outcome?: AIEvaluationOutcome;
  evidenceSummary?: string;
  linkedExecutionCount?: number;
}

function stableId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `eval-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumber(value: unknown, fallback = 0) {
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function getFreshnessState(timestamp?: string | null) {
  if (!timestamp) return 'stale';
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'live';
  const ageHours = ageMs / 3600000;
  if (ageHours <= 6) return 'live';
  if (ageHours <= 24) return 'delayed';
  return 'stale';
}

function getPromotionStage(autonomyLevel: AutonomyLevel): AIPromotionStage {
  if (autonomyLevel === 'Autonomous') return 'autonomous';
  if (autonomyLevel === 'Supervised') return 'supervised';
  if (autonomyLevel === 'Advisory') return 'advisory';
  return 'blocked';
}

function getDriftState(input: {
  confidenceScore: number;
  previousScore?: number;
  outcome: AIEvaluationOutcome;
  freshnessState: string;
}) {
  const previousScore = input.previousScore;
  if (input.outcome === 'negative') return 'drift';
  if (input.freshnessState === 'stale') return 'drift';
  if (typeof previousScore === 'number' && previousScore - input.confidenceScore >= 12) return 'drift';
  if (input.confidenceScore < 70 || input.freshnessState === 'delayed' || input.outcome === 'inconclusive') return 'watch';
  return 'stable';
}

function getEvidenceCoverage(sourceData: any, actionCount: number) {
  const governanceCoverage = toNumber(sourceData?.ai_governance?.evidence_coverage, NaN);
  if (Number.isFinite(governanceCoverage)) return Math.max(0, Math.min(100, governanceCoverage));

  const generatedFrom = Array.isArray(sourceData?.generated_from) ? sourceData.generated_from : [];
  const evidenceStrength = toNumber(sourceData?.evidence_strength, 0);
  return Math.min(100, Math.round(evidenceStrength * 0.38 + generatedFrom.length * 14 + actionCount * 4));
}

export function buildRecommendationEvaluationEvent({
  recommendation,
  phase,
  outcome = 'pending',
  evidenceSummary,
  linkedExecutionCount,
}: BuildRecommendationEvaluationInput): AIEvaluationEvent {
  const sourceData = recommendation.source_data || {};
  const actionCount = Array.isArray((recommendation as any).recommended_actions)
    ? (recommendation as any).recommended_actions.length
    : 0;
  const evidenceCoverage = getEvidenceCoverage(sourceData, actionCount);
  const sourceLabel = sourceData?.ai_governance?.source_label || (sourceData?.generated_from ? 'Source-backed' : 'Heuristic');
  const freshnessState = sourceData?.ai_governance?.freshness_state || getFreshnessState(sourceData?.refresh_timestamp);
  const outcomeCount = toNumber(sourceData?.verified_outcome_count, 0) + (outcome === 'positive' || outcome === 'negative' ? 1 : 0);
  const executionCount = linkedExecutionCount ?? toNumber(sourceData?.linked_execution_count, 0);

  const governance = assessDecisionAutonomy({
    confidence: recommendation.confidence_score,
    impact: recommendation.impact_score,
    evidenceCoverage,
    sourceLabel,
    freshnessState,
    lastEvidenceAt: sourceData?.refresh_timestamp,
    outcomeCount,
    linkedExecutionCount: executionCount,
    activeAlertCount: sourceData?.pattern_type === 'active_alert_pressure' ? 1 : 0,
    riskSeverity: recommendation.priority,
    hasDedicatedInferenceService: Boolean(sourceData?.pattern_type),
  });

  const confidenceScore = toNumber(recommendation.confidence_score, 0);
  const previousScore = toNumber(sourceData?.latest_ai_evaluation?.confidence_score, NaN);
  const driftState = getDriftState({
    confidenceScore,
    previousScore: Number.isFinite(previousScore) ? previousScore : undefined,
    outcome,
    freshnessState,
  });

  return {
    id: stableId(),
    organization_id: recommendation.organization_id ?? null,
    subject_type: 'recommendation',
    subject_id: recommendation.id,
    subject_key: sourceData?.signature || recommendation.title || recommendation.id,
    phase,
    promotion_stage: getPromotionStage(governance.autonomyLevel),
    autonomy_level: governance.autonomyLevel,
    evaluation_score: governance.score,
    confidence_score: confidenceScore,
    evidence_coverage: evidenceCoverage,
    source_label: sourceLabel,
    freshness_state: freshnessState,
    outcome,
    drift_state: driftState,
    can_auto_act: governance.canAutoAct,
    can_create_work: governance.canCreateWork,
    can_recommend: governance.canRecommend,
    reasons: governance.reasons,
    required_controls: governance.requiredControls,
    evaluated_at: new Date().toISOString(),
    metadata: {
      title: recommendation.title,
      category: recommendation.category,
      priority: recommendation.priority,
      status: recommendation.status,
      evidence_summary: evidenceSummary || sourceData?.verification_feedback?.evidence_summary || null,
      generated_from: sourceData?.generated_from || [],
      pattern_type: sourceData?.pattern_type || null,
    },
  };
}

export function appendEvaluationToSourceData(sourceData: any, event: AIEvaluationEvent) {
  const existingEvents = Array.isArray(sourceData?.ai_evaluation_events)
    ? sourceData.ai_evaluation_events
    : [];
  const compactEvent = {
    id: event.id,
    phase: event.phase,
    promotion_stage: event.promotion_stage,
    autonomy_level: event.autonomy_level,
    evaluation_score: event.evaluation_score,
    confidence_score: event.confidence_score,
    evidence_coverage: event.evidence_coverage,
    outcome: event.outcome,
    drift_state: event.drift_state,
    evaluated_at: event.evaluated_at,
  };

  return {
    ...(sourceData || {}),
    latest_ai_evaluation: compactEvent,
    ai_evaluation_events: [...existingEvents, compactEvent].slice(-12),
  };
}

export async function persistAIEvaluationEvent(event: AIEvaluationEvent) {
  const { error } = await supabase.from('ai_evaluation_events').insert({
    organization_id: event.organization_id,
    subject_type: event.subject_type,
    subject_id: event.subject_id,
    subject_key: event.subject_key,
    phase: event.phase,
    promotion_stage: event.promotion_stage,
    autonomy_level: event.autonomy_level,
    evaluation_score: event.evaluation_score,
    confidence_score: event.confidence_score,
    evidence_coverage: event.evidence_coverage,
    source_label: event.source_label,
    freshness_state: event.freshness_state,
    outcome: event.outcome,
    drift_state: event.drift_state,
    can_auto_act: event.can_auto_act,
    can_create_work: event.can_create_work,
    can_recommend: event.can_recommend,
    reasons: event.reasons,
    required_controls: event.required_controls,
    metadata: event.metadata,
    evaluated_at: event.evaluated_at,
  });

  if (error) {
    const missingTable = typeof error.message === 'string' && (
      error.message.includes('ai_evaluation_events') ||
      error.message.includes('schema cache')
    );
    if (!missingTable) console.error('Error persisting AI evaluation event:', error);
    return { ok: false, error };
  }

  return { ok: true, error: null };
}
