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

export interface AIEvaluationRegistryResult {
  events: AIEvaluationEvent[];
  source: 'registry' | 'embedded' | 'empty';
  needsMigration: boolean;
  errorMessage?: string;
}

interface BuildRecommendationEvaluationInput {
  recommendation: AIEvaluationSubject;
  phase: AIEvaluationPhase;
  outcome?: AIEvaluationOutcome;
  evidenceSummary?: string;
  linkedExecutionCount?: number;
}

interface BuildForecastEvaluationInput {
  forecast: {
    id: string;
    organization_id?: string | null;
    name?: string | null;
    metric_id?: string | null;
    model_type?: string | null;
    forecast_horizon?: number | null;
    confidence_level?: number | null;
    historical_data?: any;
    forecast_data?: any;
    accuracy_metrics?: any;
    status?: string | null;
    created_at?: string | null;
  };
  metricName?: string | null;
}

interface BuildPredictiveAlertEvaluationInput {
  alert: {
    id: string;
    type: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    predictedDate: string;
    daysUntil: number;
    confidence: number;
    category: string;
    metricId?: string;
    actions: string[];
  };
  organizationId: string;
}

function stableId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `eval-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumber(value: unknown, fallback = 0) {
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function getForecastDriftState(mape: number, directionalAccuracy: number) {
  if (mape > 30 || directionalAccuracy < 45) return 'drift';
  if (mape > 18 || directionalAccuracy < 60) return 'watch';
  return 'stable';
}

function getOutcomeFromForecast(mape: number, directionalAccuracy: number): AIEvaluationOutcome {
  if (mape <= 15 && directionalAccuracy >= 65) return 'positive';
  if (mape > 30 || directionalAccuracy < 45) return 'negative';
  return 'inconclusive';
}

function isMissingEvaluationTable(error: any) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return (
    message.includes('ai_evaluation_events') ||
    message.includes('schema cache') ||
    error?.code === '42P01'
  );
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

export function buildForecastEvaluationEvent({
  forecast,
  metricName,
}: BuildForecastEvaluationInput): AIEvaluationEvent {
  const historical = Array.isArray(forecast.historical_data) ? forecast.historical_data : [];
  const forecastData = Array.isArray(forecast.forecast_data) ? forecast.forecast_data : [];
  const accuracyMetrics = forecast.accuracy_metrics || {};
  const mape = toNumber(accuracyMetrics.mape, 100);
  const rSquared = toNumber(accuracyMetrics.r_squared, 0);
  const directionalAccuracy = toNumber(
    accuracyMetrics.directional_accuracy ?? accuracyMetrics.directionalAccuracy,
    Math.max(0, 100 - mape)
  );
  const horizon = toNumber(forecast.forecast_horizon, forecastData.length || 30);
  const confidenceLevel = toNumber(forecast.confidence_level, 95);
  const historyScore = clamp((historical.length / 30) * 28, 0, 28);
  const accuracyScore = clamp(38 - mape * 1.4, 0, 38);
  const fitScore = clamp(rSquared * 18, 0, 18);
  const horizonScore = clamp(16 - Math.max(0, horizon - 30) * 0.35, 0, 16);
  const evaluationScore = Math.round(historyScore + accuracyScore + fitScore + horizonScore);
  const evidenceCoverage = clamp(
    Math.round(historyScore + clamp(forecastData.length * 2, 0, 18) + clamp(confidenceLevel / 2, 0, 50)),
    0,
    100
  );
  const freshnessState = getFreshnessState(forecast.created_at);
  const outcome = getOutcomeFromForecast(mape, directionalAccuracy);
  const driftState = getForecastDriftState(mape, directionalAccuracy);

  const governance = assessDecisionAutonomy({
    confidence: evaluationScore,
    impact: Math.min(100, horizon <= 14 ? 72 : horizon <= 30 ? 64 : 52),
    evidenceCoverage,
    sourceLabel: 'Forecast backtest',
    freshnessState,
    lastEvidenceAt: forecast.created_at,
    outcomeCount: outcome === 'positive' || outcome === 'negative' ? 1 : 0,
    linkedExecutionCount: 0,
    activeAlertCount: driftState === 'drift' ? 1 : 0,
    riskSeverity: driftState === 'drift' ? 'critical' : driftState === 'watch' ? 'high' : 'medium',
    hasDedicatedInferenceService: true,
  });

  const reasons = [
    `Backtest error is ${Math.round(mape * 10) / 10}% with ${Math.round(directionalAccuracy)}% directional accuracy.`,
    historical.length < 14 ? 'Historical depth is still limited.' : 'Historical depth is sufficient for near-term validation.',
    driftState === 'stable' ? 'Forecast behavior is stable enough for planning review.' : 'Forecast needs review before high-stakes use.',
  ];

  return {
    id: stableId(),
    organization_id: forecast.organization_id ?? null,
    subject_type: 'forecast',
    subject_id: forecast.id,
    subject_key: `${metricName || forecast.name || forecast.metric_id || 'Forecast'}:${forecast.model_type || 'model'}`,
    phase: 'backtest',
    promotion_stage: getPromotionStage(governance.autonomyLevel),
    autonomy_level: governance.autonomyLevel,
    evaluation_score: evaluationScore,
    confidence_score: evaluationScore,
    evidence_coverage: evidenceCoverage,
    source_label: 'Forecast backtest',
    freshness_state: freshnessState,
    outcome,
    drift_state: driftState,
    can_auto_act: governance.canAutoAct,
    can_create_work: governance.canCreateWork,
    can_recommend: governance.canRecommend,
    reasons: [...governance.reasons, ...reasons],
    required_controls: governance.requiredControls,
    evaluated_at: new Date().toISOString(),
    metadata: {
      title: forecast.name,
      metric_id: forecast.metric_id,
      metric_name: metricName,
      model_type: forecast.model_type,
      forecast_horizon: horizon,
      confidence_level: confidenceLevel,
      mape,
      r_squared: rSquared,
      directional_accuracy: directionalAccuracy,
      forecast_points: forecastData.length,
      historical_points: historical.length,
      status: forecast.status,
    },
  };
}

export function buildPredictiveAlertEvaluationEvent({
  alert,
  organizationId,
}: BuildPredictiveAlertEvaluationInput): AIEvaluationEvent {
  const actionCount = Array.isArray(alert.actions) ? alert.actions.length : 0;
  const urgencyScore = clamp(100 - alert.daysUntil * 4, 20, 100);
  const evidenceCoverage = clamp(42 + actionCount * 8 + (alert.metricId ? 20 : 0), 0, 100);
  const evaluationScore = Math.round(clamp(alert.confidence * 0.72 + urgencyScore * 0.18 + evidenceCoverage * 0.1, 0, 100));
  const freshnessState = 'live';
  const driftState =
    alert.confidence < 65 ? 'drift' :
    alert.confidence < 78 || alert.daysUntil > 21 ? 'watch' :
    'stable';

  const governance = assessDecisionAutonomy({
    confidence: evaluationScore,
    impact: alert.type === 'critical' ? 88 : alert.type === 'warning' ? 70 : 52,
    evidenceCoverage,
    sourceLabel: 'Predictive alert signal',
    freshnessState,
    lastEvidenceAt: new Date().toISOString(),
    outcomeCount: 0,
    linkedExecutionCount: 0,
    activeAlertCount: 1,
    riskSeverity: alert.type,
    hasDedicatedInferenceService: true,
  });

  return {
    id: stableId(),
    organization_id: organizationId,
    subject_type: 'aim_alert',
    subject_id: alert.id,
    subject_key: alert.metricId ? `metric:${alert.metricId}` : alert.title,
    phase: 'generated',
    promotion_stage: getPromotionStage(governance.autonomyLevel),
    autonomy_level: governance.autonomyLevel,
    evaluation_score: evaluationScore,
    confidence_score: alert.confidence,
    evidence_coverage: evidenceCoverage,
    source_label: 'Predictive alert signal',
    freshness_state: freshnessState,
    outcome: 'pending',
    drift_state: driftState,
    can_auto_act: governance.canAutoAct,
    can_create_work: governance.canCreateWork,
    can_recommend: governance.canRecommend,
    reasons: [
      ...governance.reasons,
      `${alert.type} alert predicted ${alert.daysUntil} day${alert.daysUntil === 1 ? '' : 's'} out with ${Math.round(alert.confidence)}% confidence.`,
      actionCount > 0 ? 'Alert includes concrete response actions.' : 'Alert needs response actions before it can drive work.',
    ],
    required_controls: governance.requiredControls,
    evaluated_at: new Date().toISOString(),
    metadata: {
      title: alert.title,
      description: alert.description,
      category: alert.category,
      severity: alert.type,
      metric_id: alert.metricId || null,
      predicted_date: alert.predictedDate,
      days_until: alert.daysUntil,
      action_count: actionCount,
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
    const missingTable = isMissingEvaluationTable(error);
    if (!missingTable) console.error('Error persisting AI evaluation event:', error);
    return { ok: false, error };
  }

  return { ok: true, error: null };
}

function normalizeEmbeddedEvaluation(recommendation: any, compactEvent: any, index: number): AIEvaluationEvent {
  const sourceData = recommendation.source_data || {};
  const governance = sourceData.ai_governance || {};
  const generatedAt = compactEvent?.evaluated_at || recommendation.updated_at || recommendation.created_at || new Date().toISOString();
  const autonomyLevel = (compactEvent?.autonomy_level || governance.autonomy_level || 'Advisory') as AutonomyLevel;
  const promotionStage = (compactEvent?.promotion_stage || getPromotionStage(autonomyLevel)) as AIPromotionStage;

  return {
    id: compactEvent?.id || `embedded-${recommendation.id}-${index}`,
    organization_id: recommendation.organization_id ?? null,
    subject_type: 'recommendation',
    subject_id: recommendation.id,
    subject_key: sourceData.signature || recommendation.title || recommendation.id,
    phase: (compactEvent?.phase || 'generated') as AIEvaluationPhase,
    promotion_stage: promotionStage,
    autonomy_level: autonomyLevel,
    evaluation_score: toNumber(compactEvent?.evaluation_score, toNumber(governance.score, 0)),
    confidence_score: toNumber(compactEvent?.confidence_score, toNumber(recommendation.confidence_score, 0)),
    evidence_coverage: toNumber(compactEvent?.evidence_coverage, toNumber(governance.evidence_coverage, 0)),
    source_label: governance.source_label || (sourceData.generated_from ? 'Source-backed' : 'Embedded fallback'),
    freshness_state: governance.freshness_state || getFreshnessState(sourceData.refresh_timestamp || recommendation.updated_at),
    outcome: (compactEvent?.outcome || 'pending') as AIEvaluationOutcome,
    drift_state: (compactEvent?.drift_state || 'watch') as AIEvaluationEvent['drift_state'],
    can_auto_act: Boolean(governance.can_auto_act),
    can_create_work: Boolean(governance.can_create_work ?? recommendation.status !== 'completed'),
    can_recommend: Boolean(governance.can_recommend ?? true),
    reasons: Array.isArray(governance.reasons) ? governance.reasons : [],
    required_controls: Array.isArray(governance.required_controls) ? governance.required_controls : [],
    evaluated_at: generatedAt,
    metadata: {
      title: recommendation.title,
      category: recommendation.category,
      priority: recommendation.priority,
      status: recommendation.status,
      embedded: true,
    },
  };
}

async function loadEmbeddedRecommendationEvaluations(organizationId?: string | null, userId?: string | null) {
  let query = supabase
    .from('recommendations')
    .select('id, organization_id, user_id, title, category, priority, status, confidence_score, source_data, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  } else if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .flatMap((recommendation: any) => {
      const sourceData = recommendation.source_data || {};
      const compactEvents = Array.isArray(sourceData.ai_evaluation_events)
        ? sourceData.ai_evaluation_events
        : sourceData.latest_ai_evaluation
          ? [sourceData.latest_ai_evaluation]
          : [];

      return compactEvents.map((event: any, index: number) =>
        normalizeEmbeddedEvaluation(recommendation, event, index)
      );
    })
    .sort((a, b) => new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime());
}

export async function loadAIEvaluationRegistry({
  organizationId,
  userId,
}: {
  organizationId?: string | null;
  userId?: string | null;
}): Promise<AIEvaluationRegistryResult> {
  try {
    let query = supabase
      .from('ai_evaluation_events')
      .select('*')
      .order('evaluated_at', { ascending: false })
      .limit(150);

    if (organizationId) query = query.eq('organization_id', organizationId);

    const { data, error } = await query;
    if (error) throw error;

    return {
      events: (data || []) as AIEvaluationEvent[],
      source: data && data.length > 0 ? 'registry' : 'empty',
      needsMigration: false,
    };
  } catch (error: any) {
    if (!isMissingEvaluationTable(error)) {
      console.error('Error loading AI evaluation registry:', error);
      return {
        events: [],
        source: 'empty',
        needsMigration: false,
        errorMessage: error?.message || 'Unable to load AI evaluation registry.',
      };
    }

    try {
      const events = await loadEmbeddedRecommendationEvaluations(organizationId, userId);
      return {
        events,
        source: events.length > 0 ? 'embedded' : 'empty',
        needsMigration: true,
      };
    } catch (fallbackError: any) {
      console.error('Error loading embedded AI evaluations:', fallbackError);
      return {
        events: [],
        source: 'empty',
        needsMigration: true,
        errorMessage: fallbackError?.message || 'Unable to load embedded AI evaluations.',
      };
    }
  }
}
