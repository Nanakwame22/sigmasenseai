import { supabase } from '../lib/supabase';
import { summarizeAIMRecommendations } from './aimWorkSummary';
import {
  curateRecommendationQueue,
  inferRecommendationCandidates,
} from './recommendationInference';
import {
  appendEvaluationToSourceData,
  buildRecommendationEvaluationEvent,
  persistAIEvaluationEvent,
  type AIEvaluationOutcome,
  type AIEvaluationPhase,
} from './aiEvaluationRegistry';

export interface Recommendation {
  id: string;
  user_id: string;
  organization_id?: string;
  title: string;
  description: string;
  category: 'performance' | 'quality' | 'efficiency' | 'cost' | 'risk';
  priority: 'critical' | 'high' | 'medium' | 'low';
  impact_score: number;
  effort_score: number;
  confidence_score: number;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  source_data?: any;
  recommended_actions?: string[];
  expected_impact?: string;
  actual_impact?: string;
  implementation_notes?: string;
  assigned_to?: string;
  due_date?: string;
  completed_at?: string;
  dismissed_at?: string;
  dismissed_reason?: string;
  created_at: string;
  updated_at: string;
}

export class RecommendationGenerationError extends Error {
  code: 'persistence_failed' | 'reactivation_failed';
  diagnostics: Record<string, unknown>;

  constructor(
    code: 'persistence_failed' | 'reactivation_failed',
    message: string,
    diagnostics: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'RecommendationGenerationError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

interface RecommendationLifecycleEvent {
  event: 'generated' | 'started' | 'completed' | 'dismissed';
  at: string;
  actor_id?: string;
  note?: string;
}

interface RecommendationLearningFeedback {
  delta: number;
  evidenceStrength: 'Strong' | 'Moderate' | 'Limited';
  evidenceSummary: string;
  adjustedConfidence: number;
  verificationStatus: 'complete' | 'pending';
}

interface LinkedRecommendationAction {
  id: string;
  status: string;
  progress: number;
  due_date?: string | null;
  updated_at?: string | null;
  tags?: string[] | null;
}

interface RecommendationSourceDataShape {
  pattern_type?: string;
  signature?: string;
  evidence_strength?: number;
  generated_from?: string[];
  refresh_timestamp?: string | null;
  review_after?: string;
  expires_at?: string;
  canonical_kind?: 'recommendation_signal';
  lifecycle?: RecommendationLifecycleEvent[];
  raw?: any;
  [key: string]: any;
}

interface DataPattern {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  data: any;
  insight: string;
}

const RECOMMENDATION_REVIEW_WINDOW_DAYS = 14;
const RECOMMENDATION_EXPIRY_WINDOW_DAYS = 30;
const RECOMMENDATION_RECENT_DUPLICATE_WINDOW_DAYS = 21;
const RECOMMENDATION_DISMISS_COOLDOWN_DAYS = 2;
const RECOMMENDATION_COMPLETE_COOLDOWN_DAYS = 3;

const OPERATIONAL_METRIC_PRIORITY: Record<string, number> = {
  'ED Wait Time': 30,
  'Available Beds': 28,
  'Discharges Pending': 24,
  'Patients Per Nurse': 22,
  'LOS Average Hours': 20,
  'Bed Occupancy Rate': 18,
  '30-Day Readmission Rate': 16,
};

function normalizePatternNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addDaysIso(days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function getPatternRefreshTimestamp(pattern: DataPattern): string | null {
  if (pattern.type === 'metric_below_target' || pattern.type === 'metric_declining' || pattern.type === 'high_variability') {
    return pattern.data?.values?.[0]?.timestamp ?? null;
  }
  if (pattern.type === 'negative_forecast' || pattern.type === 'positive_forecast') {
    return pattern.data?.forecast?.created_at ?? null;
  }
  if (pattern.type === 'recurring_anomalies') {
    return pattern.data?.anomalies?.[0]?.detected_at ?? null;
  }
  if (pattern.type === 'active_alert_pressure') {
    return pattern.data?.alert?.created_at ?? null;
  }
  return null;
}

function getPatternEvidenceStrength(pattern: DataPattern): number {
  switch (pattern.type) {
    case 'metric_below_target':
      return Math.min(100, 55 + Number(pattern.data?.gap || 0) * 1.2 + ((pattern.data?.values?.length || 0) >= 20 ? 10 : 0));
    case 'metric_declining':
      return Math.min(100, 58 + Number(pattern.data?.decline || 0) * 1.1);
    case 'high_variability':
      return Math.min(100, 50 + Number(pattern.data?.cv || 0) * 0.7);
    case 'recurring_anomalies':
      return Math.min(100, 62 + Number(pattern.data?.count || 0) * 6);
    case 'negative_forecast':
      return Math.min(100, 60 + Number(pattern.data?.decline || 0) * 0.9 + ((pattern.data?.predictions?.length || 0) >= 12 ? 8 : 0));
    case 'positive_forecast':
      return Math.min(100, 45 + Number(pattern.data?.growth || 0) * 0.6);
    case 'active_alert_pressure':
      return Math.min(
        100,
        52 +
          normalizePatternNumber(pattern.data?.alert?.confidence) * 0.35 +
          (normalizePatternNumber(pattern.data?.alert?.days_until) > 0
            ? Math.max(0, 30 - normalizePatternNumber(pattern.data?.alert?.days_until)) * 0.8
            : 0) +
          (pattern.severity === 'critical' ? 12 : pattern.severity === 'high' ? 8 : 0)
      );
    default:
      return 0;
  }
}

function meetsRecommendationGate(pattern: DataPattern): boolean {
  const evidenceStrength = getPatternEvidenceStrength(pattern);

  switch (pattern.type) {
    case 'metric_below_target':
      return evidenceStrength >= 62 && normalizePatternNumber(pattern.data?.gap) >= 8;
    case 'metric_declining':
      return evidenceStrength >= 65 && normalizePatternNumber(pattern.data?.decline) >= 10;
    case 'high_variability':
      return evidenceStrength >= 60 && normalizePatternNumber(pattern.data?.cv) >= 35;
    case 'recurring_anomalies':
      return evidenceStrength >= 70 && normalizePatternNumber(pattern.data?.count) >= 3;
    case 'negative_forecast':
      return evidenceStrength >= 60 && normalizePatternNumber(pattern.data?.decline) >= 8;
    case 'positive_forecast':
      return evidenceStrength >= 72 && normalizePatternNumber(pattern.data?.growth) >= 20;
    case 'active_alert_pressure':
      return (
        evidenceStrength >= 55 &&
        (
          normalizePatternNumber(pattern.data?.alert?.confidence) >= 60 ||
          normalizePatternNumber(pattern.data?.alert?.days_until) <= 30 ||
          pattern.severity === 'critical' ||
          pattern.severity === 'high' ||
          (
            pattern.severity === 'medium' &&
            normalizePatternNumber(pattern.data?.alert?.days_until) > 0 &&
            normalizePatternNumber(pattern.data?.alert?.days_until) <= 45
          )
        )
      );
    default:
      return false;
  }
}

function buildRecommendationSignature(pattern: DataPattern): string {
  switch (pattern.type) {
    case 'metric_below_target':
    case 'metric_declining':
    case 'high_variability':
      return `${pattern.type}::${pattern.data?.metric?.id || pattern.data?.metric?.name || 'metricless'}`;
    case 'recurring_anomalies':
      return `${pattern.type}::${pattern.data?.metricId || pattern.data?.metricName || 'unknown'}`;
    case 'negative_forecast':
    case 'positive_forecast':
      return `${pattern.type}::${pattern.data?.forecast?.metric_id || pattern.data?.forecast?.metric_name || 'forecastless'}`;
    case 'active_alert_pressure':
      return `${pattern.type}::${pattern.data?.alert?.metric_id || pattern.data?.alert?.title || 'alertless'}::${pattern.data?.alert?.alert_type || 'signal'}`;
    default:
      return `${pattern.type}::generic`;
  }
}

function buildDirectionalWatchSignature(pattern: DataPattern): string {
  if (pattern.type === 'active_alert_pressure') {
    return `directional_watch_review::${pattern.data?.alert?.metric_id || pattern.data?.alert?.title || 'alertless'}::${pattern.data?.alert?.alert_type || 'signal'}`;
  }
  return `directional_watch_review::${pattern.type}`;
}

function getPatternGeneratedFrom(pattern: DataPattern): string[] {
  switch (pattern.type) {
    case 'metric_below_target':
    case 'metric_declining':
    case 'high_variability':
      return ['metrics', 'metric_data'];
    case 'recurring_anomalies':
      return ['anomalies'];
    case 'negative_forecast':
    case 'positive_forecast':
      return ['forecasts', 'metrics'];
    case 'active_alert_pressure':
      return ['alerts', 'metrics'];
    default:
      return ['aim'];
  }
}

function appendLifecycleEvent(
  sourceData: RecommendationSourceDataShape | undefined,
  event: RecommendationLifecycleEvent
): RecommendationSourceDataShape {
  const safeSourceData: RecommendationSourceDataShape = {
    ...(sourceData || {})
  };

  return {
    ...safeSourceData,
    lifecycle: [...(safeSourceData.lifecycle || []), event]
  };
}

function replaceTags(existingTags: string[] | null | undefined, nextTags: string[], tagsToRemove: string[] = []) {
  const base = Array.isArray(existingTags) ? existingTags.filter((tag) => typeof tag === 'string') : [];
  const filtered = base.filter(
    (tag) =>
      !tagsToRemove.includes(tag) &&
      !tag.startsWith('aim-outcome:') &&
      !tag.startsWith('aim-verification:') &&
      !tag.startsWith('aim-evidence:')
  );
  return Array.from(new Set([...filtered, ...nextTags]));
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isAlertPressureRecommendation(rec: Recommendation | { source_data?: any }) {
  return rec.source_data?.pattern_type === 'active_alert_pressure';
}

function canBypassCooldown(rec: Recommendation | { source_data?: any; confidence_score?: number }) {
  return isAlertPressureRecommendation(rec) && (rec.confidence_score || 0) >= 68;
}

function isRecommendationOrgColumnError(error: { message?: string } | null | undefined) {
  return typeof error?.message === 'string' && error.message.includes("organization_id");
}

function buildRecommendationInsertVariants(rec: Recommendation) {
  const fullPayload = { ...rec };
  const withoutId = { ...fullPayload };
  delete (withoutId as any).id;

  const withoutOrganizationId = { ...withoutId };
  delete (withoutOrganizationId as any).organization_id;

  const withoutRichMetadata = {
    user_id: rec.user_id,
    organization_id: rec.organization_id,
    title: rec.title,
    description: rec.description,
    category: rec.category,
    priority: rec.priority,
    impact_score: rec.impact_score,
    effort_score: rec.effort_score,
    confidence_score: rec.confidence_score,
    status: rec.status,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  };

  const withoutRichMetadataOrg = { ...withoutRichMetadata };
  delete (withoutRichMetadataOrg as any).organization_id;

  const minimalPayload = {
    user_id: rec.user_id,
    organization_id: rec.organization_id,
    title: rec.title,
    description: rec.description,
    status: rec.status,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  };

  const minimalPayloadOrg = { ...minimalPayload };
  delete (minimalPayloadOrg as any).organization_id;

  return [fullPayload, withoutId, withoutOrganizationId, withoutRichMetadata, withoutRichMetadataOrg, minimalPayload, minimalPayloadOrg];
}

function appendRecommendationEvaluation(
  recommendation: Recommendation,
  phase: AIEvaluationPhase,
  options: {
    sourceData?: any;
    outcome?: AIEvaluationOutcome;
    evidenceSummary?: string;
    linkedExecutionCount?: number;
  } = {}
) {
  const subject = {
    ...recommendation,
    source_data: options.sourceData ?? recommendation.source_data,
  };
  const event = buildRecommendationEvaluationEvent({
    recommendation: subject,
    phase,
    outcome: options.outcome,
    evidenceSummary: options.evidenceSummary,
    linkedExecutionCount: options.linkedExecutionCount,
  });

  return {
    event,
    sourceData: appendEvaluationToSourceData(subject.source_data, event),
  };
}

function getMetricPriorityBoost(metricName?: string) {
  if (!metricName) return 0;
  if (metricName in OPERATIONAL_METRIC_PRIORITY) return OPERATIONAL_METRIC_PRIORITY[metricName];
  if (/risk score/i.test(metricName)) return -8;
  if (/risk/i.test(metricName)) return -4;
  return 0;
}

function isCompositeRiskMetric(metricName?: string) {
  if (!metricName) return false;
  return /risk score/i.test(metricName) && !(metricName in OPERATIONAL_METRIC_PRIORITY);
}

function getOperationalTheme(name?: string) {
  if (!name) return null;
  const normalized = name.toLowerCase();

  if (
    normalized.includes('available beds') ||
    normalized.includes('bed occupancy') ||
    normalized.includes('occupied beds')
  ) {
    return 'bed_capacity';
  }

  if (
    normalized.includes('discharges pending') ||
    normalized.includes('discharge')
  ) {
    return 'discharge_flow';
  }

  if (
    normalized.includes('ed wait') ||
    normalized.includes('patient flow')
  ) {
    return 'patient_flow';
  }

  if (
    normalized.includes('patients per nurse') ||
    normalized.includes('staffing')
  ) {
    return 'staffing_balance';
  }

  if (normalized.includes('los average hours') || normalized.includes('length of stay')) {
    return 'length_of_stay';
  }

  if (normalized.includes('readmission')) {
    return 'readmission_risk';
  }

  if (normalized.includes('laboratory risk') || normalized.includes('lab')) {
    return 'lab_quality';
  }

  return null;
}

function getPatternFocusKey(pattern: DataPattern) {
  const theme =
    getOperationalTheme(pattern.data?.metric?.name) ||
    getOperationalTheme(pattern.data?.forecast?.metric_name) ||
    getOperationalTheme(pattern.data?.metricName) ||
    getOperationalTheme(pattern.data?.alert?.title);
  if (theme) return `theme:${theme}`;
  if (pattern.data?.metric?.id) return `metric:${pattern.data.metric.id}`;
  if (pattern.data?.forecast?.metric_id) return `metric:${pattern.data.forecast.metric_id}`;
  if (pattern.data?.metricId) return `metric:${pattern.data.metricId}`;
  if (pattern.data?.alert?.metric_id) return `metric:${pattern.data.alert.metric_id}`;
  const fallbackName =
    pattern.data?.metric?.name ||
    pattern.data?.forecast?.metric_name ||
    pattern.data?.metricName ||
    pattern.data?.alert?.title;
  return fallbackName ? `name:${fallbackName}` : pattern.type;
}

function getPatternMetricName(pattern: DataPattern) {
  return (
    pattern.data?.metric?.name ||
    pattern.data?.forecast?.metric_name ||
    pattern.data?.metricName ||
    pattern.data?.alert?.title ||
    ''
  );
}

function getPatternRank(pattern: DataPattern) {
  const metricName = getPatternMetricName(pattern);
  const severityRank = { critical: 40, high: 28, medium: 18, low: 8 }[pattern.severity] || 0;
  const typeRank: Record<string, number> = {
    active_alert_pressure: 34,
    metric_declining: 28,
    metric_below_target: 20,
    recurring_anomalies: 18,
    high_variability: 12,
    negative_forecast: 12,
    positive_forecast: 6,
  };
  const compositeRiskPenalty =
    isCompositeRiskMetric(metricName) && pattern.type === 'metric_below_target'
      ? 18
      : isCompositeRiskMetric(metricName)
        ? 10
        : 0;
  const zeroScorePenalty =
    pattern.type === 'metric_below_target' &&
    isCompositeRiskMetric(metricName) &&
    normalizePatternNumber(pattern.data?.avg) <= 0.01
      ? 18
      : 0;

  return (
    severityRank +
    (typeRank[pattern.type] || 0) +
    getPatternEvidenceStrength(pattern) * 0.15 +
    getMetricPriorityBoost(metricName) -
    compositeRiskPenalty -
    zeroScorePenalty
  );
}

function formatMetricValue(value: number, unit?: string) {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (!unit) return safeValue.toFixed(2);
  if (unit === '%') return `${safeValue.toFixed(1)}%`;
  if (unit === 'score') return `${safeValue.toFixed(0)} score`;
  if (unit === 'beds') return `${safeValue.toFixed(2)} beds`;
  if (unit === 'hours') return `${safeValue.toFixed(1)} hours`;
  if (unit === 'count') return `${safeValue.toFixed(0)} count`;
  if (unit === 'ratio') return `${safeValue.toFixed(1)} ratio`;
  return `${safeValue.toFixed(2)} ${unit}`;
}

function getOperationalMetricCopy(pattern: DataPattern) {
  const metric = pattern.data?.metric;
  const metricName = metric?.name || '';
  const avg = Number(pattern.data?.avg || 0);
  const target = Number(pattern.data?.target || 0);
  const gap = Number(pattern.data?.gap || 0);
  const decline = Number(pattern.data?.decline || 0);
  const cv = Number(pattern.data?.cv || 0);

  if (pattern.type === 'metric_below_target') {
    if (metricName === 'ED Wait Time') {
      return {
        title: 'Reduce ED wait-time pressure',
        description: `ED Wait Time is ${gap.toFixed(1)}% off target. Current average is ${formatMetricValue(avg, metric?.unit)} against a target of ${formatMetricValue(target, metric?.unit)}. Review flow blockers before throughput strain spreads downstream.`,
        actions: [
          'Review the longest current wait segments and isolate the bottleneck.',
          'Check whether bed availability or triage throughput is driving the delay.',
          'Escalate the next operational move that will reduce queue pressure fastest.',
          'Measure whether wait time falls back toward target on the next refresh.'
        ],
      };
    }

    if (metricName === 'Available Beds') {
      return {
        title: 'Recover available bed capacity',
        description: `Available Beds is running ${gap.toFixed(1)}% below target. Current average is ${formatMetricValue(avg, metric?.unit)} against a target of ${formatMetricValue(target, metric?.unit)}. Focus on discharge pacing and bed turnover to restore bed capacity.`,
        actions: [
          'Review delayed discharges and prioritize discharge-ready patients.',
          'Coordinate bed turnover with environmental services and bed management.',
          'Verify whether occupancy pressure is being driven by ED boarding or inpatient throughput.',
          'Recheck bed availability after the next operational cycle.'
        ],
      };
    }

    if (metricName === 'Discharges Pending') {
      return {
        title: 'Reduce discharge backlog',
        description: `Discharges Pending is off target by ${gap.toFixed(1)}%. Current average is ${formatMetricValue(avg, metric?.unit)} versus a target of ${formatMetricValue(target, metric?.unit)}. Reduce the backlog before it slows bed flow further.`,
        actions: [
          'Review the oldest pending discharges and remove avoidable blockers.',
          'Escalate cases waiting on pharmacy, transport, or physician signoff.',
          'Coordinate discharge planning coverage for the next shift handoff.',
          'Track whether pending discharges fall after the next refresh.'
        ],
      };
    }

    if (metricName === 'Patients Per Nurse') {
      return {
        title: 'Rebalance nurse assignment load',
        description: `Patients Per Nurse is ${gap.toFixed(1)}% off target. Current average is ${formatMetricValue(avg, metric?.unit)} against a target of ${formatMetricValue(target, metric?.unit)}. Rebalance staffing before assignment load becomes a patient-flow constraint.`,
        actions: [
          'Review unit-level assignment imbalance and identify overload pockets.',
          'Adjust staffing or float coverage for the most pressured units.',
          'Confirm whether discharge delays are increasing assignment pressure.',
          'Monitor whether the ratio moves back toward target on the next refresh.'
        ],
      };
    }

    if (metricName === 'LOS Average Hours') {
      return {
        title: 'Pull length of stay back toward target',
        description: `LOS Average Hours is ${gap.toFixed(1)}% off target. Current average is ${formatMetricValue(avg, metric?.unit)} against a target of ${formatMetricValue(target, metric?.unit)}. Review the inpatient flow steps that are extending stay duration.`,
        actions: [
          'Review delayed discharge, diagnostic, or bed-placement steps for admitted patients.',
          'Identify service lines with the longest recent LOS growth.',
          'Escalate persistent throughput blockers to care coordination and bed management.',
          'Measure whether LOS improves over the next refresh cycle.'
        ],
      };
    }

    if (metricName === 'Bed Occupancy Rate') {
      return {
        title: 'Relieve bed occupancy pressure',
        description: `Bed Occupancy Rate is ${gap.toFixed(1)}% away from target. Current average is ${formatMetricValue(avg, metric?.unit)} against a target of ${formatMetricValue(target, metric?.unit)}. Reduce occupancy pressure before it constrains admissions and discharge flow.`,
        actions: [
          'Compare occupancy movement with discharge completion and intake pressure.',
          'Review whether boarding or delayed bed turnover is driving the gap.',
          'Stage the next capacity response before the next operating cycle.',
          'Check whether occupancy moves back toward target on the next refresh.'
        ],
      };
    }
  }

  if (pattern.type === 'metric_declining') {
    if (metricName === 'Available Beds') {
      return {
        title: 'Reverse declining bed availability',
        description: `Available Beds has declined ${decline.toFixed(1)}% in the recent period. Bed availability is tightening fast enough to justify immediate inpatient flow review before capacity pressure worsens.`,
        actions: [
          'Confirm whether the decline is being driven by slower discharges, bed holds, or intake pressure.',
          'Review the highest-friction units for blocked turnover.',
          'Coordinate the next shift plan to recover bed capacity quickly.',
          'Check whether the decline reverses on the next refresh.'
        ],
      };
    }

    if (metricName === 'Bed Occupancy Rate') {
      return {
        title: 'Stabilize rising bed occupancy pressure',
        description: `Bed Occupancy Rate has shifted ${decline.toFixed(1)}% away from the recent baseline. Review whether occupancy pressure is outpacing discharge and bed-turnover capacity.`,
        actions: [
          'Review occupancy movement against discharge and admission flow.',
          'Identify whether boarding or inpatient throughput is driving the pressure.',
          'Prepare a bed-capacity response if the next refresh continues the trend.',
          'Track whether occupancy stabilizes after the next operating cycle.'
        ],
      };
    }
  }

  if (pattern.type === 'high_variability') {
    if (metricName === 'ED Wait Time') {
      return {
        title: 'Stabilize ED flow before wait-time swings worsen',
        description: `ED Wait Time is showing unstable movement (CV ${cv.toFixed(1)}%). The swings are large enough to make staffing and throughput planning unreliable, so tighten the highest-variance flow step before the next operating cycle.`,
        actions: [
          'Review whether triage, bed placement, or intake sequencing is driving the volatility.',
          'Identify the shift windows with the largest wait-time spikes and assign an immediate flow response.',
          'Standardize the highest-variance step in the ED pathway before the next refresh.',
          'Verify whether wait-time spread narrows after the intervention.'
        ],
      };
    }

    if (metricName === 'LOS Average Hours' || metricName === 'Discharges Pending') {
      return {
        title:
          metricName === 'LOS Average Hours'
            ? 'Tighten inpatient throughput to reduce LOS swings'
            : 'Steady discharge flow to reduce backlog swings',
        description: `${metricName} is showing unstable movement (CV ${cv.toFixed(1)}%). The signal is fluctuating enough to make planning unreliable, so focus on process consistency before the next operating cycle.`,
        actions: [
          'Review the last few shifts for inconsistent execution or handoff patterns.',
          'Identify whether a specific unit, shift, or service line is driving the volatility.',
          'Standardize the highest-variance step in the process before the next refresh.',
          'Watch whether the metric range tightens after the intervention.'
        ],
      };
    }
  }

  return null;
}

function shouldSuppressPattern(pattern: DataPattern) {
  const metricName = getPatternMetricName(pattern);

  if (
    pattern.type === 'metric_below_target' &&
    isCompositeRiskMetric(metricName) &&
    normalizePatternNumber(pattern.data?.avg) <= 0.01
  ) {
    return true;
  }

  if (
    pattern.type === 'metric_below_target' &&
    isCompositeRiskMetric(metricName) &&
    normalizePatternNumber(pattern.data?.gap) >= 95
  ) {
    return true;
  }

  if (
    pattern.type === 'high_variability' &&
    isCompositeRiskMetric(metricName) &&
    normalizePatternNumber(pattern.data?.mean) <= 0.01
  ) {
    return true;
  }

  return false;
}

function getRecommendationMetricName(rec: Recommendation) {
  return (
    rec.source_data?.raw?.metric?.name ||
    rec.source_data?.raw?.forecast?.metric_name ||
    rec.source_data?.raw?.metricName ||
    rec.source_data?.raw?.alert?.title ||
    ''
  );
}

function getRecommendationFocusKey(rec: Recommendation) {
  const theme = getOperationalTheme(getRecommendationMetricName(rec)) || getOperationalTheme(rec.title);
  if (theme) return `theme:${theme}`;
  if (rec.source_data?.signature) return rec.source_data.signature;
  const metricId =
    rec.source_data?.raw?.metric?.id ||
    rec.source_data?.raw?.forecast?.metric_id ||
    rec.source_data?.raw?.metricId ||
    rec.source_data?.raw?.alert?.metric_id;
  if (metricId) return `metric:${metricId}`;
  const metricName = getRecommendationMetricName(rec);
  return metricName ? `name:${metricName}` : rec.title;
}

function isGenericRiskGapRecommendation(rec: Recommendation) {
  const patternType = rec.source_data?.pattern_type;
  const metricName = getRecommendationMetricName(rec);
  return patternType === 'metric_below_target' && isCompositeRiskMetric(metricName);
}

function getRecommendationRank(rec: Recommendation) {
  const metricName = getRecommendationMetricName(rec);
  const priorityRank = { critical: 40, high: 28, medium: 18, low: 8 }[rec.priority] || 0;
  const statusRank = rec.status === 'in_progress' ? 6 : rec.status === 'pending' ? 4 : 0;
  const patternType = rec.source_data?.pattern_type;
  const typeRank: Record<string, number> = {
    active_alert_pressure: 28,
    metric_declining: 24,
    metric_below_target: 16,
    recurring_anomalies: 18,
    high_variability: 10,
    negative_forecast: 12,
    positive_forecast: 4,
  };
  const genericRiskPenalty = isGenericRiskGapRecommendation(rec) ? 24 : 0;

  return (
    priorityRank +
    statusRank +
    (typeRank[patternType] || 0) +
    (rec.impact_score || 0) * 0.28 +
    (rec.confidence_score || 0) * 0.18 -
    (rec.effort_score || 0) * 0.1 +
    getMetricPriorityBoost(metricName) -
    genericRiskPenalty
  );
}

function curateVisibleRecommendations(recommendations: Recommendation[]) {
  const active = recommendations
    .filter((rec) => rec.status === 'pending' || rec.status === 'in_progress')
    .sort((a, b) => getRecommendationRank(b) - getRecommendationRank(a));

  const inactive = recommendations.filter((rec) => rec.status !== 'pending' && rec.status !== 'in_progress');
  const seenFocus = new Set<string>();
  const curatedActive: Recommendation[] = [];
  let operationalCount = 0;
  let genericRiskCount = 0;

  for (const rec of active) {
    const focusKey = getRecommendationFocusKey(rec);
    if (seenFocus.has(focusKey)) continue;
    seenFocus.add(focusKey);

    const genericRisk = isGenericRiskGapRecommendation(rec);
    if (genericRisk) {
      if (genericRiskCount >= 1) continue;
      if (operationalCount >= 4 && rec.priority !== 'critical') continue;
    }

    curatedActive.push(rec);
    if (genericRisk) {
      genericRiskCount += 1;
    } else {
      operationalCount += 1;
    }

    if (curatedActive.length >= 7) break;
  }

  return [...curatedActive, ...inactive];
}

export class RecommendationsEngine {
  private userId: string;
  private organizationId: string | null = null;
  private recommendationScope: 'organization' | 'user' = 'organization';

  constructor(userId: string, organizationId?: string | null) {
    this.userId = userId;
    this.organizationId = organizationId ?? null;
  }

  private async getOrganizationId(): Promise<string | null> {
    if (this.organizationId) return this.organizationId;

    const { data } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', this.userId)
      .maybeSingle();

    if (data?.organization_id) {
      this.organizationId = data.organization_id;
      return this.organizationId;
    }

    const { data: membership } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', this.userId)
      .limit(1)
      .maybeSingle();

    this.organizationId = membership?.organization_id || null;
    return this.organizationId;
  }

  private async syncLinkedActionItems(
    recommendationId: string,
    nextTags: string[],
    options?: {
      status?: string;
      progress?: number;
    }
  ) {
    const orgId = await this.getOrganizationId();
    if (!orgId) return;

    const recTag = `rec:${recommendationId}`;
    const { data: linkedItems } = await supabase
      .from('action_items')
      .select('id, tags')
      .eq('organization_id', orgId)
      .contains('tags', [recTag]);

    if (!linkedItems || linkedItems.length === 0) return;

    await Promise.all(
      linkedItems.map((item: any) =>
        supabase
          .from('action_items')
          .update({
            ...(options?.status ? { status: options.status } : {}),
            ...(typeof options?.progress === 'number' ? { progress: options.progress } : {}),
            tags: replaceTags(item.tags, [recTag, ...nextTags])
          })
          .eq('id', item.id)
          .eq('organization_id', orgId)
      )
    );
  }

  private async getLinkedActionEvidence(recommendationId: string): Promise<LinkedRecommendationAction[]> {
    const orgId = await this.getOrganizationId();
    if (!orgId) return [];

    const recTag = `rec:${recommendationId}`;
    const { data, error } = await supabase
      .from('action_items')
      .select('id, status, progress, due_date, updated_at, tags')
      .eq('organization_id', orgId)
      .contains('tags', [recTag]);

    if (error) {
      console.error('Error loading linked action evidence:', error);
      return [];
    }

    return (data || []) as LinkedRecommendationAction[];
  }

  private calculateRecommendationLearningFeedback(
    recommendation: Recommendation,
    outcomeText: string,
    outcomePositive: boolean,
    linkedActions: LinkedRecommendationAction[]
  ): RecommendationLearningFeedback {
    const priorityWeight =
      recommendation.priority === 'critical' ? 0.05 :
      recommendation.priority === 'high' ? 0.04 :
      recommendation.priority === 'medium' ? 0.03 :
      0.02;
    const confidenceWeight = Math.min(0.03, (recommendation.confidence_score || 0) / 100 * 0.03);
    const impactWeight = Math.min(0.035, (recommendation.impact_score || 0) / 100 * 0.035);
    const noteWeight =
      outcomeText.trim().length >= 140 ? 0.05 :
      outcomeText.trim().length >= 80 ? 0.035 :
      outcomeText.trim().length >= 30 ? 0.022 :
      outcomeText.trim() ? 0.012 : 0;

    const completedActions = linkedActions.filter((item) => item.status === 'completed');
    const inProgressActions = linkedActions.filter((item) => item.status === 'in_progress');
    const maxProgress = linkedActions.reduce((max, item) => Math.max(max, Number.isFinite(item.progress) ? item.progress : 0), 0);
    const executionWeight =
      completedActions.length > 0 ? 0.06 :
      inProgressActions.length > 0 && maxProgress >= 50 ? 0.045 :
      maxProgress > 0 ? 0.025 :
      linkedActions.length > 0 ? 0.015 : 0.008;

    const overdueActions = linkedActions.filter((item) => {
      if (!item.due_date || item.status === 'completed') return false;
      const dueDate = new Date(item.due_date);
      return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
    }).length;
    const timelinessWeight = overdueActions > 0 ? -0.018 : 0.015;

    const evidenceScore = Math.max(
      0.05,
      priorityWeight + confidenceWeight + impactWeight + noteWeight + executionWeight + timelinessWeight
    );
    const evidenceStrength: RecommendationLearningFeedback['evidenceStrength'] =
      evidenceScore >= 0.17 ? 'Strong' :
      evidenceScore >= 0.12 ? 'Moderate' :
      'Limited';

    const verificationStatus: RecommendationLearningFeedback['verificationStatus'] =
      completedActions.length > 0 || maxProgress >= 85 ? 'complete' : 'pending';

    const baseDelta = Math.min(0.16, evidenceScore);
    const delta = outcomePositive
      ? parseFloat(baseDelta.toFixed(2))
      : parseFloat((-Math.max(0.05, baseDelta * (evidenceStrength === 'Strong' ? 0.95 : 0.75))).toFixed(2));

    const adjustedConfidence = clampConfidence(
      (recommendation.confidence_score || 0) +
      Math.round(outcomePositive ? delta * 24 : delta * 28)
    );

    const evidenceSummary = `${evidenceStrength.toLowerCase()} verification from ${linkedActions.length > 0 ? `${maxProgress}% execution progress across ${linkedActions.length} linked action item${linkedActions.length === 1 ? '' : 's'}` : 'recommendation-only notes'}, ${outcomeText.trim().length >= 30 ? 'documented outcome notes' : 'minimal outcome notes'}, and ${recommendation.priority} priority context.`;

    return {
      delta,
      evidenceStrength,
      evidenceSummary,
      adjustedConfidence,
      verificationStatus,
    };
  }

  private recommendationQuery() {
    return supabase.from('recommendations').select('*');
  }

  private async getRecommendationsByScope(extra?: (query: any) => any): Promise<Recommendation[]> {
    const orgId = await this.getOrganizationId();
    if (!orgId && !this.userId) return [];

    const apply = (query: any) => (extra ? extra(query) : query);

    if (this.recommendationScope === 'organization' && orgId) {
      const { data, error } = await apply(this.recommendationQuery().eq('organization_id', orgId)).order('created_at', { ascending: false });
      if (!error) return (data || []) as Recommendation[];
      if (!isRecommendationOrgColumnError(error)) {
        console.error('Error fetching recommendations:', error);
        return [];
      }
      this.recommendationScope = 'user';
    }

    const { data, error } = await apply(this.recommendationQuery().eq('user_id', this.userId)).order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching recommendations:', error);
      return [];
    }
    return (data || []) as Recommendation[];
  }

  private async getRecommendationById(id: string): Promise<Recommendation | null> {
    const orgId = await this.getOrganizationId();

    if (this.recommendationScope === 'organization' && orgId) {
      const { data, error } = await supabase
        .from('recommendations')
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!error) return (data as Recommendation | null) || null;
      if (!isRecommendationOrgColumnError(error)) {
        console.error('Error fetching recommendation:', error);
        return null;
      }
      this.recommendationScope = 'user';
    }

    const { data, error } = await supabase
      .from('recommendations')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching recommendation:', error);
      return null;
    }

    return (data as Recommendation | null) || null;
  }

  private async updateRecommendationById(id: string, updates: Record<string, any>) {
    const orgId = await this.getOrganizationId();

    if (this.recommendationScope === 'organization' && orgId) {
      const { data, error } = await supabase
        .from('recommendations')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .maybeSingle();

      if (!error) return { data: (data as Recommendation | null) || null, error: null };
      if (!isRecommendationOrgColumnError(error)) {
        return { data: null, error };
      }
      this.recommendationScope = 'user';
    }

    const { data, error } = await supabase
      .from('recommendations')
      .update(updates)
      .eq('id', id)
      .eq('user_id', this.userId)
      .select()
      .maybeSingle();

    return { data: (data as Recommendation | null) || null, error };
  }

  async generateRecommendations(): Promise<Recommendation[]> {
    const patterns = await this.analyzeDataPatterns();
    const orgId = await this.getOrganizationId();
    if (!orgId) return [];
    const inferred = inferRecommendationCandidates(patterns, {
      userId: this.userId,
      organizationId: orgId,
    });
    const diagnostics = {
      patternsAnalyzed: inferred.diagnostics.patternsAnalyzed,
      survivingPatterns: inferred.diagnostics.survivingPatterns,
      topFocusKeys: inferred.diagnostics.topFocusKeys,
      alertPressurePatterns: patterns.filter((pattern) => pattern.type === 'active_alert_pressure').length,
      createdCandidates: inferred.candidates.length,
      candidateRecommendations: 0,
      reactivated: 0,
      inserted: 0,
      directionalFallbackUsed: inferred.diagnostics.directionalFallbackUsed,
    };

    if (inferred.candidates.length > 0) {
      const cutoffIso = new Date(
        Date.now() - RECOMMENDATION_RECENT_DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      const recentExisting = await this.getRecommendationsByScope((query) => query.gte('created_at', cutoffIso));
      const allExisting = await this.getRecommendationsByScope((query) => query.limit(250));
      const existing = recentExisting || [];

      const activeSignatures = new Set(
        existing
          .filter((rec) => ['pending', 'in_progress'].includes(rec.status))
          .map((rec) => rec.source_data?.signature)
          .filter(Boolean)
      );

      const coolingDismissedSignatures = new Set(
        existing
          .filter((rec) => {
            if (rec.status !== 'dismissed') return false;
            const dismissedAt = rec.dismissed_at || rec.updated_at || rec.created_at;
            return Date.now() - new Date(dismissedAt).getTime() <= RECOMMENDATION_DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
          })
          .map((rec) => rec.source_data?.signature)
          .filter(Boolean)
      );

      const recentlyCompletedSignatures = new Set(
        existing
          .filter((rec) => {
            if (rec.status !== 'completed') return false;
            const completedAt = rec.completed_at || rec.updated_at || rec.created_at;
            return Date.now() - new Date(completedAt).getTime() <= RECOMMENDATION_COMPLETE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
          })
          .map((rec) => rec.source_data?.signature)
          .filter(Boolean)
      );

      const seenSignatures = new Set<string>();
      const candidateRecommendations = inferred.candidates.filter((rec) => {
        const signature = rec.source_data?.signature;
        if (!signature) return true;
        if (seenSignatures.has(signature)) return false;
        seenSignatures.add(signature);
        if (activeSignatures.has(signature)) return false;
        const allowAlertRepromotion = canBypassCooldown(rec);
        if (!allowAlertRepromotion && coolingDismissedSignatures.has(signature)) return false;
        if (!allowAlertRepromotion && recentlyCompletedSignatures.has(signature)) return false;
        return true;
      });
      diagnostics.candidateRecommendations = candidateRecommendations.length;

      if (candidateRecommendations.length === 0) {
        return [];
      }

      const reopenableBySignature = new Map<string, Recommendation>();
      const reopenableByTitle = new Map<string, Recommendation>();
      for (const rec of allExisting) {
        if (rec.status === 'pending' || rec.status === 'in_progress') continue;
        const signature = rec.source_data?.signature;
        if (signature && !reopenableBySignature.has(signature)) {
          reopenableBySignature.set(signature, rec);
        }
        if (rec.title && !reopenableByTitle.has(rec.title)) {
          reopenableByTitle.set(rec.title, rec);
        }
      }

      const recommendationsToReactivate: Array<{
        existing: Recommendation;
        next: Recommendation;
      }> = [];
      const recommendationsToInsert: Recommendation[] = [];

      for (const rec of candidateRecommendations) {
        const signature = rec.source_data?.signature;
        const existingMatch =
          (signature ? reopenableBySignature.get(signature) : undefined) ||
          reopenableByTitle.get(rec.title);

        if (existingMatch) {
          recommendationsToReactivate.push({ existing: existingMatch, next: rec });
          if (signature) reopenableBySignature.delete(signature);
          reopenableByTitle.delete(rec.title);
          continue;
        }

        recommendationsToInsert.push(rec);
      }

      const reactivatedResults: Recommendation[] = [];
      for (const item of recommendationsToReactivate) {
        const nextSourceData = appendLifecycleEvent(item.next.source_data, {
          event: 'generated',
          at: new Date().toISOString(),
          actor_id: this.userId,
          note: item.next.description,
        });
        const evaluated = appendRecommendationEvaluation(
          {
            ...item.next,
            id: item.existing.id,
            organization_id: item.existing.organization_id ?? item.next.organization_id,
          },
          'generated',
          { sourceData: nextSourceData }
        );

        const { data: reactivated, error: reactivateError } = await this.updateRecommendationById(item.existing.id, {
            title: item.next.title,
            description: item.next.description,
            category: item.next.category,
            priority: item.next.priority,
            impact_score: item.next.impact_score,
            effort_score: item.next.effort_score,
            confidence_score: item.next.confidence_score,
            status: 'pending',
            recommended_actions: item.next.recommended_actions,
            expected_impact: item.next.expected_impact,
            actual_impact: null,
            implementation_notes: null,
            assigned_to: null,
            due_date: null,
            completed_at: null,
            dismissed_at: null,
            dismissed_reason: null,
            updated_at: new Date().toISOString(),
            source_data: evaluated.sourceData,
          });

        if (!reactivateError && reactivated) {
          reactivatedResults.push(reactivated as Recommendation);
          await persistAIEvaluationEvent({
            ...evaluated.event,
            organization_id: reactivated.organization_id ?? evaluated.event.organization_id,
          });
        }
      }
      diagnostics.reactivated = reactivatedResults.length;

      let insertedResults: Recommendation[] = [];
      if (recommendationsToInsert.length > 0) {
        let insertErrorMessage = '';
        for (const recommendation of recommendationsToInsert) {
          let insertedRow: Recommendation | null = null;
          let lastError: any = null;
          const evaluated = appendRecommendationEvaluation(recommendation, 'generated');
          const recommendationWithEvaluation = {
            ...recommendation,
            source_data: evaluated.sourceData,
          };

          for (const payload of buildRecommendationInsertVariants(recommendationWithEvaluation)) {
            const { data, error } = await supabase
              .from('recommendations')
              .insert(payload)
              .select()
              .maybeSingle();

            if (!error && data) {
              insertedRow = data as Recommendation;
              break;
            }

            lastError = error;
          }

          if (insertedRow) {
            insertedResults.push(insertedRow);
            await persistAIEvaluationEvent({
              ...buildRecommendationEvaluationEvent({
                recommendation: insertedRow,
                phase: 'generated',
              }),
              organization_id: insertedRow.organization_id ?? evaluated.event.organization_id,
            });
            continue;
          }

          insertErrorMessage = lastError?.message || 'Unknown persistence error';
          console.error('Error saving recommendation:', lastError);
          if (reactivatedResults.length > 0 || insertedResults.length > 0) {
            return [...reactivatedResults, ...insertedResults];
          }
          throw new RecommendationGenerationError(
            'persistence_failed',
            'AIM found promotable recommendation signals but could not persist them.',
            {
              ...diagnostics,
              attemptedInsert: recommendationsToInsert.length,
              insertError: insertErrorMessage,
            }
          );
        }
      }
      diagnostics.inserted = insertedResults.length;

      if (
        candidateRecommendations.length > 0 &&
        reactivatedResults.length === 0 &&
        insertedResults.length === 0
      ) {
        throw new RecommendationGenerationError(
          'reactivation_failed',
          'AIM found promotable recommendation signals but could not activate any live recommendation records.',
          diagnostics
        );
      }

      return [...reactivatedResults, ...insertedResults];
    }

    return [];
  }

  private async analyzeDataPatterns(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];

    const metricPatterns = await this.analyzeMetrics();
    patterns.push(...metricPatterns);

    const anomalyPatterns = await this.analyzeAnomalies();
    patterns.push(...anomalyPatterns);

    const forecastPatterns = await this.analyzeForecasts();
    patterns.push(...forecastPatterns);

    const alertPatterns = await this.analyzeAlertSignals();
    patterns.push(...alertPatterns);

    return patterns;
  }

  private async analyzeMetrics(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];
    const orgId = await this.getOrganizationId();
    if (!orgId) return patterns;

    const { data: metrics } = await supabase
      .from('metrics')
      .select('id, name, current_value, target_value, unit')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (!metrics) return patterns;

    for (const metric of metrics) {
      const { data: recentData } = await supabase
        .from('metric_data')
        .select('value, timestamp')
        .eq('metric_id', metric.id)
        .order('timestamp', { ascending: false })
        .limit(30);

      if (!recentData || recentData.length < 5) continue;

      const values = recentData.map((d: any) => d.value);
      const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      const target = metric.target_value;

      // Pattern 1: Metric below target
      if (target && avg < target * 0.9) {
        const gap = ((target - avg) / target * 100).toFixed(1);
        patterns.push({
          type: 'metric_below_target',
          severity: avg < target * 0.7 ? 'critical' : avg < target * 0.8 ? 'high' : 'medium',
          data: { metric, avg, target, gap, values: recentData },
          insight: `${metric.name} is ${gap}% below target (${avg.toFixed(2)} vs ${target})`
        });
      }

      // Pattern 2: Declining trend
      if (values.length >= 10) {
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const firstAvg = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;

        if (secondAvg < firstAvg * 0.85) {
          const decline = ((firstAvg - secondAvg) / firstAvg * 100).toFixed(1);
          patterns.push({
            type: 'metric_declining',
            severity: 'high',
            data: { metric, firstAvg, secondAvg, decline, values: recentData },
            insight: `${metric.name} has declined ${decline}% in recent period`
          });
        }
      }

      // Pattern 3: High variability
      const mean = avg;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const cv = (stdDev / mean) * 100; // Coefficient of variation

      if (cv > 30) {
        patterns.push({
          type: 'high_variability',
          severity: cv > 50 ? 'high' : 'medium',
          data: { metric, mean, stdDev, cv: cv.toFixed(1), values: recentData },
          insight: `${metric.name} shows high variability (CV: ${cv.toFixed(1)}%) - process is unstable`
        });
      }
    }

    return patterns;
  }

  private async analyzeAnomalies(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];
    const orgId = await this.getOrganizationId();
    if (!orgId) return patterns;

    const { data: anomalies } = await supabase
      .from('anomalies')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .gte('detected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('detected_at', { ascending: false });

    if (!anomalies || anomalies.length === 0) return patterns;

    // Group by metric
    const anomalyGroups = anomalies.reduce((acc: any, anomaly) => {
      const key = anomaly.metric_id || 'unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(anomaly);
      return acc;
    }, {});

    for (const [metricId, metricAnomalies] of Object.entries(anomalyGroups)) {
      const count = (metricAnomalies as any[]).length;
      const firstAnomaly = (metricAnomalies as any[])[0];
      
      if (count >= 3) {
        patterns.push({
          type: 'recurring_anomalies',
          severity: count >= 5 ? 'critical' : 'high',
          data: { 
            metricId, 
            metricName: firstAnomaly.metric_name,
            count, 
            anomalies: metricAnomalies 
          },
          insight: `${firstAnomaly.metric_name} has ${count} unresolved anomalies - indicates systemic issue`
        });
      }
    }

    return patterns;
  }

  private async analyzeForecasts(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];
    const orgId = await this.getOrganizationId();
    if (!orgId) return patterns;

    const { data: forecasts } = await supabase
      .from('forecasts')
      .select('*')
      .eq('organization_id', orgId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (!forecasts) return patterns;

    for (const forecast of forecasts) {
      const predictions = forecast.predictions || [];
      if (predictions.length === 0) continue;

      const values = predictions.map((p: any) => p.value);
      const firstValue = values[0];
      const lastValue = values[values.length - 1];

      // Pattern: Negative forecast trend
      if (lastValue < firstValue * 0.85) {
        const decline = ((firstValue - lastValue) / firstValue * 100).toFixed(1);
        patterns.push({
          type: 'negative_forecast',
          severity: 'high',
          data: { forecast, decline, firstValue, lastValue, predictions },
          insight: `${forecast.metric_name} forecast shows ${decline}% decline over next ${predictions.length} periods`
        });
      }

      // Pattern: Positive forecast trend (sustain opportunity)
      if (lastValue > firstValue * 1.15) {
        const growth = ((lastValue - firstValue) / firstValue * 100).toFixed(1);
        patterns.push({
          type: 'positive_forecast',
          severity: 'low',
          data: { forecast, growth, firstValue, lastValue, predictions },
          insight: `${forecast.metric_name} forecast shows ${growth}% growth - opportunity to sustain momentum`
        });
      }
    }

    return patterns;
  }

  private async analyzeAlertSignals(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];
    const orgId = await this.getOrganizationId();
    if (!orgId) return patterns;

    const { data: alerts } = await supabase
      .from('alerts')
      .select('id, metric_id, title, description, message, severity, alert_type, status, category, confidence, days_until, created_at')
      .eq('organization_id', orgId)
      .in('status', ['new', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (!alerts || alerts.length === 0) return patterns;

    const seenKeys = new Set<string>();

    for (const alert of alerts) {
      const dedupeKey = `${alert.metric_id || alert.title || alert.id}::${alert.alert_type || alert.category || 'signal'}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const severity = (['critical', 'high', 'medium', 'low'].includes(alert.severity)
        ? alert.severity
        : 'medium') as DataPattern['severity'];
      const confidence = normalizePatternNumber(alert.confidence);
      const daysUntil = normalizePatternNumber(alert.days_until);
      const shouldPromote =
        severity === 'critical' ||
        severity === 'high' ||
        confidence >= 60 ||
        (daysUntil > 0 && daysUntil <= 45);

      if (!shouldPromote) continue;

      patterns.push({
        type: 'active_alert_pressure',
        severity,
        data: {
          alert,
          confidence,
          daysUntil,
        },
        insight:
          alert.description ||
          alert.message ||
          `${alert.title} is showing enough sustained pressure to justify operator review and potential intervention.`,
      });
    }

    return patterns;
  }

  private createRecommendation(pattern: DataPattern, organizationId: string): Recommendation | null {
    if (!meetsRecommendationGate(pattern)) {
      return null;
    }

    const signature = buildRecommendationSignature(pattern);
    const evidenceStrength = getPatternEvidenceStrength(pattern);
    const refreshTimestamp = getPatternRefreshTimestamp(pattern);
    const nowIso = new Date().toISOString();
    const sourceData: RecommendationSourceDataShape = appendLifecycleEvent(
      {
        pattern_type: pattern.type,
        signature,
        evidence_strength: evidenceStrength,
        generated_from: getPatternGeneratedFrom(pattern),
        refresh_timestamp: refreshTimestamp,
        review_after: addDaysIso(RECOMMENDATION_REVIEW_WINDOW_DAYS),
        expires_at: addDaysIso(RECOMMENDATION_EXPIRY_WINDOW_DAYS),
        canonical_kind: 'recommendation_signal',
        raw: pattern.data
      },
      {
        event: 'generated',
        at: nowIso,
        actor_id: this.userId,
        note: pattern.insight
      }
    );

    const baseRecommendation = {
      user_id: this.userId,
      organization_id: organizationId,
      status: 'pending' as const,
      created_at: nowIso,
      updated_at: nowIso,
      source_data: sourceData
    };

    switch (pattern.type) {
      case 'metric_below_target':
        {
          const operationalCopy = getOperationalMetricCopy(pattern);
          if (operationalCopy) {
            return {
              ...baseRecommendation,
              id: crypto.randomUUID(),
              title: operationalCopy.title,
              description: operationalCopy.description,
              category: 'performance',
              priority: pattern.severity,
              impact_score: 85,
              effort_score: 60,
              confidence_score: 90,
              recommended_actions: operationalCopy.actions,
              expected_impact: `Closing this ${pattern.data.gap}% gap should move ${pattern.data.metric.name} back toward its operating target and reduce downstream pressure.`,
            };
          }
        }
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: isCompositeRiskMetric(pattern.data.metric.name)
            ? `Lift ${pattern.data.metric.name} back into range`
            : `Close ${pattern.data.metric.name} performance gap`,
          description: `${pattern.data.metric.name} is currently ${pattern.data.gap}% below target. Current average: ${pattern.data.avg.toFixed(2)} ${pattern.data.metric.unit || ''}, Target: ${pattern.data.target} ${pattern.data.metric.unit || ''}. Closing this gap is critical for meeting performance goals.`,
          category: isCompositeRiskMetric(pattern.data.metric.name) ? 'risk' : 'performance',
          priority: pattern.severity,
          impact_score: 85,
          effort_score: 60,
          confidence_score: 90,
          recommended_actions: [
            'Conduct root cause analysis to identify performance bottlenecks',
            'Review recent process changes that may have impacted results',
            'Set up daily monitoring dashboard to track improvement progress',
            'Create detailed action plan with specific milestones and owners',
            'Implement quick wins to show immediate improvement'
          ],
          expected_impact: `Closing this ${pattern.data.gap}% gap could bring ${pattern.data.metric.name} back to target levels, improving overall operational performance.`
        };

      case 'metric_declining':
        {
          const operationalCopy = getOperationalMetricCopy(pattern);
          if (operationalCopy) {
            return {
              ...baseRecommendation,
              id: crypto.randomUUID(),
              title: operationalCopy.title,
              description: operationalCopy.description,
              category: 'performance',
              priority: 'high',
              impact_score: 80,
              effort_score: 50,
              confidence_score: 85,
              recommended_actions: operationalCopy.actions,
              expected_impact: `Reversing this trend should recover recent performance loss before it becomes a broader operating issue.`,
            };
          }
        }
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: isCompositeRiskMetric(pattern.data.metric.name)
            ? `Stabilize decline in ${pattern.data.metric.name}`
            : `Reverse decline in ${pattern.data.metric.name}`,
          description: `${pattern.data.metric.name} has declined ${pattern.data.decline}% in the recent period (from ${pattern.data.firstAvg.toFixed(2)} to ${pattern.data.secondAvg.toFixed(2)}). Early intervention can prevent further deterioration.`,
          category: isCompositeRiskMetric(pattern.data.metric.name) ? 'risk' : 'performance',
          priority: 'high',
          impact_score: 80,
          effort_score: 50,
          confidence_score: 85,
          recommended_actions: [
            'Analyze what changed during the decline period (people, process, materials, equipment)',
            'Compare current performance with historical benchmarks',
            'Interview frontline staff about recent challenges or changes',
            'Implement corrective actions to reverse the trend',
            'Set up weekly reviews until performance stabilizes'
          ],
          expected_impact: `Reversing this trend could recover ${pattern.data.decline}% performance loss and prevent further decline.`
        };

      case 'high_variability':
        {
          const operationalCopy = getOperationalMetricCopy(pattern);
          if (operationalCopy) {
            return {
              ...baseRecommendation,
              id: crypto.randomUUID(),
              title: operationalCopy.title,
              description: operationalCopy.description,
              category: 'quality',
              priority: pattern.severity,
              impact_score: 75,
              effort_score: 65,
              confidence_score: 88,
              recommended_actions: operationalCopy.actions,
              expected_impact: 'Reducing variability should make the operating signal more reliable and easier to manage shift-to-shift.',
            };
          }
        }
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Reduce operating volatility in ${pattern.data.metric.name}`,
          description: `${pattern.data.metric.name} shows high variability (Coefficient of Variation: ${pattern.data.cv}%). High variability indicates an unstable process that produces inconsistent results.`,
          category: isCompositeRiskMetric(pattern.data.metric.name) ? 'risk' : 'quality',
          priority: pattern.severity,
          impact_score: 75,
          effort_score: 65,
          confidence_score: 88,
          recommended_actions: [
            'Identify and eliminate special causes of variation',
            'Standardize work procedures to reduce process variation',
            'Implement statistical process control (SPC) charts',
            'Train operators on consistent execution methods',
            'Review and update process documentation'
          ],
          expected_impact: 'Reducing variability will improve process predictability, quality consistency, and customer satisfaction.'
        };

      case 'recurring_anomalies':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Fix Systemic Issue Causing ${pattern.data.metricName} Anomalies`,
          description: `${pattern.data.metricName} has ${pattern.data.count} unresolved anomalies in the last 30 days. This pattern suggests an underlying systemic issue rather than random variation.`,
          category: 'quality',
          priority: pattern.severity,
          impact_score: 90,
          effort_score: 70,
          confidence_score: 95,
          recommended_actions: [
            'Map the end-to-end process flow for this metric',
            'Identify common factors across all anomaly occurrences',
            'Use fishbone diagram and 5 Whys to find root cause',
            'Implement process controls to prevent recurrence',
            'Document lessons learned and update SOPs'
          ],
          expected_impact: `Fixing the root cause could eliminate ${pattern.data.count}+ anomalies per month and improve process stability by 40-60%.`
        };

      case 'negative_forecast':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Prevent Predicted Decline in ${pattern.data.forecast.metric_name}`,
          description: `Forecasts predict a ${pattern.data.decline}% decline in ${pattern.data.forecast.metric_name} over the next ${pattern.data.predictions.length} periods. Taking proactive action now can change this trajectory.`,
          category: 'risk',
          priority: 'high',
          impact_score: 85,
          effort_score: 65,
          confidence_score: 80,
          recommended_actions: [
            'Develop contingency plan for predicted decline scenario',
            'Identify leading indicators to monitor for early warning signs',
            'Launch preventive initiatives immediately to change trajectory',
            'Allocate additional resources to high-impact improvement areas',
            'Review forecast weekly and adjust strategy based on actual results'
          ],
          expected_impact: `Proactive intervention could prevent ${pattern.data.decline}% decline and maintain or improve current performance levels.`
        };

      case 'positive_forecast':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Sustain Positive Momentum in ${pattern.data.forecast.metric_name}`,
          description: `Forecasts predict ${pattern.data.growth}% growth in ${pattern.data.forecast.metric_name}. This is an opportunity to sustain and accelerate positive momentum.`,
          category: 'performance',
          priority: 'low',
          impact_score: 70,
          effort_score: 40,
          confidence_score: 75,
          recommended_actions: [
            'Document what is working well to replicate success',
            'Share best practices across teams and departments',
            'Invest in resources that are driving positive results',
            'Set stretch goals to accelerate improvement',
            'Recognize and reward teams contributing to success'
          ],
          expected_impact: `Sustaining this momentum could achieve ${pattern.data.growth}%+ improvement and establish new performance baseline.`
        };

      case 'active_alert_pressure':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Respond to ${pattern.data.alert.title}`,
          description:
            pattern.insight ||
            `${pattern.data.alert.title} is now strong enough to move from watch mode into guided operator response.`,
          category: 'risk',
          priority: pattern.severity,
          impact_score:
            pattern.severity === 'critical'
              ? 88
              : pattern.severity === 'high'
                ? 78
                : 68,
          effort_score:
            pattern.severity === 'critical'
              ? 58
              : pattern.severity === 'high'
                ? 52
                : 45,
          confidence_score: Math.max(68, Math.min(96, getPatternEvidenceStrength(pattern))),
          recommended_actions: [
            'Review the leading signal and validate the underlying source metric or workflow pressure.',
            'Assign an owner to confirm whether the condition is persistent or transient.',
            'Take the highest-leverage corrective step from the linked response actions.',
            'Recheck the signal after the next refresh cycle and capture whether conditions improved.'
          ],
          expected_impact:
            pattern.data.daysUntil > 0
              ? `Acting inside the ${pattern.data.daysUntil}-day lead window should reduce the chance of this signal becoming an operating incident.`
              : 'Acting now should reduce the chance of this alert family escalating into a larger operating incident.',
        };

      default:
        return null;
    }
  }

  private createDirectionalRecommendation(pattern: DataPattern, organizationId: string): Recommendation | null {
    if (pattern.type !== 'active_alert_pressure') return null;

    const nowIso = new Date().toISOString();
    const sourceData: RecommendationSourceDataShape = appendLifecycleEvent(
      {
        pattern_type: pattern.type,
        signature: buildDirectionalWatchSignature(pattern),
        evidence_strength: Math.max(50, getPatternEvidenceStrength(pattern) - 6),
        generated_from: [...getPatternGeneratedFrom(pattern), 'watch_signals'],
        refresh_timestamp: getPatternRefreshTimestamp(pattern),
        review_after: addDaysIso(7),
        expires_at: addDaysIso(21),
        canonical_kind: 'recommendation_signal',
        decision_state: 'directional',
        raw: pattern.data,
      },
      {
        event: 'generated',
        at: nowIso,
        actor_id: this.userId,
        note: `Directional watch signal promoted for operator review: ${pattern.insight}`,
      }
    );

    return {
      id: crypto.randomUUID(),
      user_id: this.userId,
      organization_id: organizationId,
      title: `Validate response for ${pattern.data.alert.title}`,
      description:
        `${pattern.data.alert.title} has not yet crossed the full action-ready threshold, but it has remained strong enough to justify an operator review and a response decision.`,
      category: 'risk',
      priority: pattern.severity === 'critical' ? 'high' : pattern.severity,
      impact_score: pattern.severity === 'critical' ? 78 : pattern.severity === 'high' ? 72 : 64,
      effort_score: 32,
      confidence_score: Math.max(60, Math.min(82, getPatternEvidenceStrength(pattern))),
      status: 'pending',
      recommended_actions: [
        'Confirm whether the signal is still active on the latest refresh cycle.',
        'Review the linked response actions and choose the lowest-risk intervention.',
        'Assign an owner to verify whether the pressure is persistent or transient.',
        'Promote this into a full corrective action only if the next refresh confirms continued pressure.'
      ],
      expected_impact:
        'This recommendation is intended to close the evidence gap quickly and decide whether the signal should become a full corrective action.',
      created_at: nowIso,
      updated_at: nowIso,
      source_data: sourceData,
    };
  }

  async getRecommendations(filters?: {
    status?: string;
    category?: string;
    priority?: string;
  }): Promise<Recommendation[]> {
    const recommendations = await this.getRecommendationsByScope((query) => {
      let next = query;
      if (filters?.status) next = next.eq('status', filters.status);
      if (filters?.category) next = next.eq('category', filters.category);
      if (filters?.priority) next = next.eq('priority', filters.priority);
      return next;
    });
    return curateRecommendationQueue(recommendations);
  }

  async startRecommendation(id: string, assignedTo?: string): Promise<boolean> {
    const existing = await this.getRecommendationById(id);
    if (!existing) return false;
    const evaluated = appendRecommendationEvaluation(existing, 'started', {
      sourceData: appendLifecycleEvent(existing.source_data, {
        event: 'started',
        at: new Date().toISOString(),
        actor_id: this.userId
      }),
    });

    const updates: any = {
      status: 'in_progress',
      updated_at: new Date().toISOString(),
      source_data: evaluated.sourceData,
    };
    if (assignedTo) updates.assigned_to = assignedTo;

    const { data, error } = await this.updateRecommendationById(id, updates);

    if (!error) {
      await persistAIEvaluationEvent({
        ...evaluated.event,
        organization_id: data?.organization_id ?? existing.organization_id ?? evaluated.event.organization_id,
      });
      await this.syncLinkedActionItems(id, ['aim-source:recommendation', 'aim-outcome:monitoring', 'aim-verification:pending'], {
        status: 'in_progress',
        progress: 35,
      });
    }

    return !error;
  }

  async completeRecommendation(id: string, actualImpact?: string, notes?: string): Promise<boolean> {
    const existing = await this.getRecommendationById(id);
    if (!existing) return false;
    const linkedActions = await this.getLinkedActionEvidence(id);
    const learningFeedback = this.calculateRecommendationLearningFeedback(
      existing,
      notes || actualImpact || '',
      true,
      linkedActions
    );
    const completedSourceData = {
      ...appendLifecycleEvent(existing.source_data, {
      event: 'completed',
      at: new Date().toISOString(),
      actor_id: this.userId,
      note: notes || actualImpact
      }),
      verification_feedback: {
        direction: 'positive',
        evidence_strength: learningFeedback.evidenceStrength.toLowerCase(),
        evidence_summary: learningFeedback.evidenceSummary,
        reliability_delta: learningFeedback.delta,
        verification_status: learningFeedback.verificationStatus,
        linked_action_count: linkedActions.length,
        max_linked_progress: linkedActions.reduce((max, item) => Math.max(max, item.progress || 0), 0),
        verified_at: new Date().toISOString(),
      },
      verified_outcome_count: Number(existing.source_data?.verified_outcome_count || 0) + 1,
      linked_execution_count: linkedActions.length,
    };
    const evaluated = appendRecommendationEvaluation(
      { ...existing, confidence_score: learningFeedback.adjustedConfidence },
      'outcome_positive',
      {
        sourceData: completedSourceData,
        outcome: 'positive',
        evidenceSummary: learningFeedback.evidenceSummary,
        linkedExecutionCount: linkedActions.length,
      }
    );

    const updates: any = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      confidence_score: learningFeedback.adjustedConfidence,
      source_data: evaluated.sourceData,
    };
    if (actualImpact) updates.actual_impact = actualImpact;
    if (notes) updates.implementation_notes = notes;

    const { error } = await this.updateRecommendationById(id, updates);

    if (!error) {
      await persistAIEvaluationEvent({
        ...evaluated.event,
        organization_id: existing.organization_id ?? evaluated.event.organization_id,
      });
      await this.syncLinkedActionItems(
        id,
        [
          'aim-source:recommendation',
          learningFeedback.verificationStatus === 'complete' ? 'aim-outcome:captured' : 'aim-outcome:awaiting_verification',
          `aim-evidence:${learningFeedback.evidenceStrength.toLowerCase()}`,
          learningFeedback.verificationStatus === 'complete' ? 'aim-verification:complete' : 'aim-verification:pending',
        ],
        {
          status: 'completed',
          progress: 100,
        }
      );
    }

    return !error;
  }

  async dismissRecommendation(id: string, reason?: string): Promise<boolean> {
    const existing = await this.getRecommendationById(id);
    if (!existing) return false;
    const linkedActions = await this.getLinkedActionEvidence(id);
    const learningFeedback = this.calculateRecommendationLearningFeedback(
      existing,
      reason || '',
      false,
      linkedActions
    );
    const dismissedSourceData = {
      ...appendLifecycleEvent(existing.source_data, {
      event: 'dismissed',
      at: new Date().toISOString(),
      actor_id: this.userId,
      note: reason
      }),
      verification_feedback: {
        direction: 'negative',
        evidence_strength: learningFeedback.evidenceStrength.toLowerCase(),
        evidence_summary: learningFeedback.evidenceSummary,
        reliability_delta: learningFeedback.delta,
        verification_status: learningFeedback.verificationStatus,
        linked_action_count: linkedActions.length,
        max_linked_progress: linkedActions.reduce((max, item) => Math.max(max, item.progress || 0), 0),
        verified_at: new Date().toISOString(),
      },
      verified_outcome_count: Number(existing.source_data?.verified_outcome_count || 0) + 1,
      linked_execution_count: linkedActions.length,
    };
    const evaluated = appendRecommendationEvaluation(
      { ...existing, confidence_score: learningFeedback.adjustedConfidence },
      'outcome_negative',
      {
        sourceData: dismissedSourceData,
        outcome: 'negative',
        evidenceSummary: learningFeedback.evidenceSummary,
        linkedExecutionCount: linkedActions.length,
      }
    );

    const { error } = await this.updateRecommendationById(id, {
        status: 'dismissed',
        dismissed_at: new Date().toISOString(),
        dismissed_reason: reason,
        updated_at: new Date().toISOString(),
        confidence_score: learningFeedback.adjustedConfidence,
        source_data: evaluated.sourceData,
      });

    if (!error) {
      await persistAIEvaluationEvent({
        ...evaluated.event,
        organization_id: existing.organization_id ?? evaluated.event.organization_id,
      });
      await this.syncLinkedActionItems(id, ['aim-source:recommendation', 'aim-outcome:at_risk', `aim-evidence:${learningFeedback.evidenceStrength.toLowerCase()}`, 'aim-verification:complete'], {
        status: 'on_hold',
      });
    }

    return !error;
  }

  async getStatistics(): Promise<{
    total: number;
    open: number;
    pending: number;
    inProgress: number;
    completed: number;
    dismissed: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    avgImpactScore: number;
    avgEffortScore: number;
  }> {
    if (!this.userId) {
      return {
        total: 0, open: 0, pending: 0, inProgress: 0, completed: 0, dismissed: 0,
        byCategory: {}, byPriority: {}, avgImpactScore: 0, avgEffortScore: 0
      };
    }

    const recommendations = curateRecommendationQueue(await this.getRecommendationsByScope());

    if (!recommendations || recommendations.length === 0) {
      return {
        total: 0, open: 0, pending: 0, inProgress: 0, completed: 0, dismissed: 0,
        byCategory: {}, byPriority: {}, avgImpactScore: 0, avgEffortScore: 0
      };
    }

    const summary = summarizeAIMRecommendations(recommendations as Recommendation[]);

    const stats = {
      total: summary.total,
      open: summary.open,
      pending: summary.pending,
      inProgress: summary.inProgress,
      completed: summary.completed,
      dismissed: summary.dismissed,
      byCategory: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      avgImpactScore: summary.avgImpactScore,
      avgEffortScore: summary.avgEffortScore
    };

    recommendations.forEach(r => {
      stats.byCategory[r.category] = (stats.byCategory[r.category] || 0) + 1;
      stats.byPriority[r.priority] = (stats.byPriority[r.priority] || 0) + 1;
    });

    return stats;
  }
}
