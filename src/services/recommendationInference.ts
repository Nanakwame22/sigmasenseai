import { assessDecisionAutonomy } from './intelligenceGovernance';

export interface RecommendationRecordLike {
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

export interface RecommendationPattern {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  data: any;
  insight: string;
}

export interface RecommendationInferenceContext {
  userId: string;
  organizationId: string;
  nowIso?: string;
}

export interface RecommendationInferenceResult {
  candidates: RecommendationRecordLike[];
  diagnostics: {
    patternsAnalyzed: number;
    survivingPatterns: number;
    directionalFallbackUsed: boolean;
    topFocusKeys: string[];
  };
}

const RECOMMENDATION_REVIEW_WINDOW_DAYS = 14;
const RECOMMENDATION_EXPIRY_WINDOW_DAYS = 30;

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

  if (normalized.includes('available beds') || normalized.includes('bed occupancy') || normalized.includes('occupied beds')) {
    return 'bed_capacity';
  }
  if (normalized.includes('discharges pending') || normalized.includes('discharge')) {
    return 'discharge_flow';
  }
  if (normalized.includes('ed wait') || normalized.includes('patient flow')) {
    return 'patient_flow';
  }
  if (normalized.includes('patients per nurse') || normalized.includes('staffing')) {
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

function getPatternMetricName(pattern: RecommendationPattern) {
  return (
    pattern.data?.metric?.name ||
    pattern.data?.forecast?.metric_name ||
    pattern.data?.metricName ||
    pattern.data?.alert?.title ||
    ''
  );
}

function getPatternFocusKey(pattern: RecommendationPattern) {
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
  const fallbackName = getPatternMetricName(pattern);
  return fallbackName ? `name:${fallbackName}` : pattern.type;
}

function getPatternRefreshTimestamp(pattern: RecommendationPattern): string | null {
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

function getPatternGeneratedFrom(pattern: RecommendationPattern): string[] {
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

function getPatternFreshnessState(pattern: RecommendationPattern) {
  const timestamp = getPatternRefreshTimestamp(pattern);
  if (!timestamp) return 'stale';
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'live';
  const ageHours = ageMs / 3600000;
  if (ageHours <= 6) return 'live';
  if (ageHours <= 24) return 'delayed';
  return 'stale';
}

function getPatternEvidenceStrength(pattern: RecommendationPattern): number {
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

function meetsRecommendationGate(pattern: RecommendationPattern): boolean {
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
          (pattern.severity === 'medium' &&
            normalizePatternNumber(pattern.data?.alert?.days_until) > 0 &&
            normalizePatternNumber(pattern.data?.alert?.days_until) <= 45)
        )
      );
    default:
      return false;
  }
}

function shouldSuppressPattern(pattern: RecommendationPattern) {
  const metricName = getPatternMetricName(pattern);

  if (pattern.type === 'metric_below_target' && isCompositeRiskMetric(metricName) && normalizePatternNumber(pattern.data?.avg) <= 0.01) {
    return true;
  }
  if (pattern.type === 'metric_below_target' && isCompositeRiskMetric(metricName) && normalizePatternNumber(pattern.data?.gap) >= 95) {
    return true;
  }
  if (pattern.type === 'high_variability' && isCompositeRiskMetric(metricName) && normalizePatternNumber(pattern.data?.mean) <= 0.01) {
    return true;
  }

  return false;
}

function getPatternRank(pattern: RecommendationPattern) {
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

  return severityRank + (typeRank[pattern.type] || 0) + getPatternEvidenceStrength(pattern) * 0.15 + getMetricPriorityBoost(metricName) - compositeRiskPenalty - zeroScorePenalty;
}

function buildRecommendationSignature(pattern: RecommendationPattern): string {
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

function buildDirectionalWatchSignature(pattern: RecommendationPattern): string {
  if (pattern.type === 'active_alert_pressure') {
    return `directional_watch_review::${pattern.data?.alert?.metric_id || pattern.data?.alert?.title || 'alertless'}::${pattern.data?.alert?.alert_type || 'signal'}`;
  }
  return `directional_watch_review::${pattern.type}`;
}

function appendLifecycleEvent(sourceData: Record<string, any> | undefined, event: { event: string; at: string; actor_id?: string; note?: string }) {
  const safeSourceData = {
    ...(sourceData || {})
  };

  return {
    ...safeSourceData,
    lifecycle: [...(safeSourceData.lifecycle || []), event]
  };
}

function getOperationalMetricCopy(pattern: RecommendationPattern) {
  const metric = pattern.data?.metric;
  const metricName = metric?.name || '';
  const avg = Number(pattern.data?.avg || 0);
  const target = Number(pattern.data?.target || 0);
  const gap = Number(pattern.data?.gap || 0);
  const decline = Number(pattern.data?.decline || 0);
  const cv = Number(pattern.data?.cv || 0);
  const formatMetricValue = (value: number, unit?: string) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    if (!unit) return safeValue.toFixed(2);
    if (unit === '%') return `${safeValue.toFixed(1)}%`;
    if (unit === 'score') return `${safeValue.toFixed(0)} score`;
    if (unit === 'beds') return `${safeValue.toFixed(2)} beds`;
    if (unit === 'hours') return `${safeValue.toFixed(1)} hours`;
    if (unit === 'count') return `${safeValue.toFixed(0)} count`;
    if (unit === 'ratio') return `${safeValue.toFixed(1)} ratio`;
    return `${safeValue.toFixed(2)} ${unit}`;
  };

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
        title: metricName === 'LOS Average Hours'
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

function buildBaseRecommendation(pattern: RecommendationPattern, context: RecommendationInferenceContext) {
  const nowIso = context.nowIso || new Date().toISOString();
  const sourceData = appendLifecycleEvent(
    {
      pattern_type: pattern.type,
      signature: buildRecommendationSignature(pattern),
      evidence_strength: getPatternEvidenceStrength(pattern),
      generated_from: getPatternGeneratedFrom(pattern),
      refresh_timestamp: getPatternRefreshTimestamp(pattern),
      review_after: addDaysIso(RECOMMENDATION_REVIEW_WINDOW_DAYS),
      expires_at: addDaysIso(RECOMMENDATION_EXPIRY_WINDOW_DAYS),
      canonical_kind: 'recommendation_signal',
      raw: pattern.data,
    },
    {
      event: 'generated',
      at: nowIso,
      actor_id: context.userId,
      note: pattern.insight,
    }
  );

  return {
    id: crypto.randomUUID(),
    user_id: context.userId,
    organization_id: context.organizationId,
    status: 'pending' as const,
    created_at: nowIso,
    updated_at: nowIso,
    source_data: sourceData,
  };
}

function createActionReadyRecommendation(pattern: RecommendationPattern, context: RecommendationInferenceContext): RecommendationRecordLike | null {
  if (!meetsRecommendationGate(pattern)) return null;

  const baseRecommendation = buildBaseRecommendation(pattern, context);

  switch (pattern.type) {
    case 'metric_below_target': {
      const operationalCopy = getOperationalMetricCopy(pattern);
      if (operationalCopy) {
        return {
          ...baseRecommendation,
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
      return {
        ...baseRecommendation,
        title: isCompositeRiskMetric(pattern.data.metric.name) ? `Lift ${pattern.data.metric.name} back into range` : `Close ${pattern.data.metric.name} performance gap`,
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
    }
    case 'metric_declining': {
      const operationalCopy = getOperationalMetricCopy(pattern);
      if (operationalCopy) {
        return {
          ...baseRecommendation,
          title: operationalCopy.title,
          description: operationalCopy.description,
          category: 'performance',
          priority: 'high',
          impact_score: 80,
          effort_score: 50,
          confidence_score: 85,
          recommended_actions: operationalCopy.actions,
          expected_impact: 'Reversing this trend should recover recent performance loss before it becomes a broader operating issue.',
        };
      }
      return {
        ...baseRecommendation,
        title: isCompositeRiskMetric(pattern.data.metric.name) ? `Stabilize decline in ${pattern.data.metric.name}` : `Reverse decline in ${pattern.data.metric.name}`,
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
    }
    case 'high_variability': {
      const operationalCopy = getOperationalMetricCopy(pattern);
      if (operationalCopy) {
        return {
          ...baseRecommendation,
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
      return {
        ...baseRecommendation,
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
    }
    case 'recurring_anomalies':
      return {
        ...baseRecommendation,
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
        title: `Respond to ${pattern.data.alert.title}`,
        description: pattern.insight || `${pattern.data.alert.title} is now strong enough to move from watch mode into guided operator response.`,
        category: 'risk',
        priority: pattern.severity,
        impact_score: pattern.severity === 'critical' ? 88 : pattern.severity === 'high' ? 78 : 68,
        effort_score: pattern.severity === 'critical' ? 58 : pattern.severity === 'high' ? 52 : 45,
        confidence_score: Math.max(68, Math.min(96, getPatternEvidenceStrength(pattern))),
        recommended_actions: [
          'Review the leading signal and validate the underlying source metric or workflow pressure.',
          'Assign an owner to confirm whether the condition is persistent or transient.',
          'Take the highest-leverage corrective step from the linked response actions.',
          'Recheck the signal after the next refresh cycle and capture whether conditions improved.'
        ],
        expected_impact: pattern.data.daysUntil > 0
          ? `Acting inside the ${pattern.data.daysUntil}-day lead window should reduce the chance of this signal becoming an operating incident.`
          : 'Acting now should reduce the chance of this alert family escalating into a larger operating incident.',
      };
    default:
      return null;
  }
}

function createDirectionalRecommendation(pattern: RecommendationPattern, context: RecommendationInferenceContext): RecommendationRecordLike | null {
  if (pattern.type !== 'active_alert_pressure') return null;

  const nowIso = context.nowIso || new Date().toISOString();
  const sourceData = appendLifecycleEvent(
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
      actor_id: context.userId,
      note: `Directional watch signal promoted for operator review: ${pattern.insight}`,
    }
  );

  return {
    id: crypto.randomUUID(),
    user_id: context.userId,
    organization_id: context.organizationId,
    title: `Validate response for ${pattern.data.alert.title}`,
    description: `${pattern.data.alert.title} has not yet crossed the full action-ready threshold, but it has remained strong enough to justify an operator review and a response decision.`,
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
    expected_impact: 'This recommendation is intended to close the evidence gap quickly and decide whether the signal should become a full corrective action.',
    created_at: nowIso,
    updated_at: nowIso,
    source_data: sourceData,
  };
}

function attachRecommendationGovernance(
  recommendation: RecommendationRecordLike,
  pattern: RecommendationPattern
): RecommendationRecordLike {
  const generatedFrom = Array.from(new Set(recommendation.source_data?.generated_from || getPatternGeneratedFrom(pattern)));
  const evidenceStrength = normalizePatternNumber(recommendation.source_data?.evidence_strength || getPatternEvidenceStrength(pattern));
  const actionCoverage = recommendation.recommended_actions?.length
    ? Math.min(20, recommendation.recommended_actions.length * 4)
    : 0;
  const sourceCoverage = Math.min(40, generatedFrom.length * 14);
  const evidenceCoverage = Math.min(100, Math.round(evidenceStrength * 0.4 + sourceCoverage + actionCoverage));
  const sourceLabel =
    generatedFrom.some((source) => ['metrics', 'metric_data', 'forecasts', 'alerts', 'anomalies'].includes(source))
      ? 'Source-backed'
      : generatedFrom.length > 1
        ? 'Derived'
        : 'Heuristic';

  const governance = assessDecisionAutonomy({
    confidence: recommendation.confidence_score,
    impact: recommendation.impact_score,
    evidenceCoverage,
    sourceLabel,
    freshnessState: getPatternFreshnessState(pattern),
    lastEvidenceAt: recommendation.source_data?.refresh_timestamp,
    outcomeCount: normalizePatternNumber(recommendation.source_data?.verified_outcome_count),
    linkedExecutionCount: normalizePatternNumber(recommendation.source_data?.linked_execution_count),
    activeAlertCount: pattern.type === 'active_alert_pressure' ? 1 : 0,
    riskSeverity: recommendation.priority,
    hasDedicatedInferenceService: Boolean(recommendation.source_data?.pattern_type),
  });

  return {
    ...recommendation,
    source_data: {
      ...(recommendation.source_data || {}),
      ai_governance: {
        autonomy_level: governance.autonomyLevel,
        score: governance.score,
        can_auto_act: governance.canAutoAct,
        can_create_work: governance.canCreateWork,
        can_recommend: governance.canRecommend,
        reasons: governance.reasons,
        required_controls: governance.requiredControls,
        evidence_coverage: evidenceCoverage,
        source_label: sourceLabel,
        freshness_state: getPatternFreshnessState(pattern),
        assessed_at: contextlessNowIso(),
      },
    },
  };
}

function contextlessNowIso() {
  return new Date().toISOString();
}

function getRecommendationMetricName(rec: RecommendationRecordLike) {
  return (
    rec.source_data?.raw?.metric?.name ||
    rec.source_data?.raw?.forecast?.metric_name ||
    rec.source_data?.raw?.metricName ||
    rec.source_data?.raw?.alert?.title ||
    ''
  );
}

function getRecommendationFocusKey(rec: RecommendationRecordLike) {
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

function isGenericRiskGapRecommendation(rec: RecommendationRecordLike) {
  const patternType = rec.source_data?.pattern_type;
  const metricName = getRecommendationMetricName(rec);
  return patternType === 'metric_below_target' && isCompositeRiskMetric(metricName);
}

export function getRecommendationRank(rec: RecommendationRecordLike) {
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

  return priorityRank + statusRank + (typeRank[patternType] || 0) + (rec.impact_score || 0) * 0.28 + (rec.confidence_score || 0) * 0.18 - (rec.effort_score || 0) * 0.1 + getMetricPriorityBoost(metricName) - genericRiskPenalty;
}

export function curateRecommendationQueue<T extends RecommendationRecordLike>(recommendations: T[]) {
  const active = recommendations
    .filter((rec) => rec.status === 'pending' || rec.status === 'in_progress')
    .sort((a, b) => getRecommendationRank(b) - getRecommendationRank(a));

  const inactive = recommendations.filter((rec) => rec.status !== 'pending' && rec.status !== 'in_progress');
  const seenFocus = new Set<string>();
  const curatedActive: T[] = [];
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
    if (genericRisk) genericRiskCount += 1;
    else operationalCount += 1;

    if (curatedActive.length >= 7) break;
  }

  return [...curatedActive, ...inactive];
}

export function inferRecommendationCandidates(
  patterns: RecommendationPattern[],
  context: RecommendationInferenceContext
): RecommendationInferenceResult {
  const rankedPatterns = [...patterns]
    .filter((pattern) => !shouldSuppressPattern(pattern))
    .sort((a, b) => getPatternRank(b) - getPatternRank(a))
    .filter((pattern, index, list) => {
      const focusKey = getPatternFocusKey(pattern);
      return list.findIndex((candidate) => getPatternFocusKey(candidate) === focusKey) === index;
    })
    .slice(0, 6);

  const candidates = rankedPatterns
    .map((pattern) => {
      const recommendation = createActionReadyRecommendation(pattern, context);
      return recommendation ? attachRecommendationGovernance(recommendation, pattern) : null;
    })
    .filter((candidate): candidate is RecommendationRecordLike => Boolean(candidate));

  let directionalFallbackUsed = false;
  if (candidates.length === 0) {
    const directionalWatchPattern = [...patterns]
      .filter((pattern) => pattern.type === 'active_alert_pressure')
      .sort((a, b) => {
        const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
        const severityDelta = severityRank[b.severity] - severityRank[a.severity];
        if (severityDelta !== 0) return severityDelta;
        return getPatternEvidenceStrength(b) - getPatternEvidenceStrength(a);
      })[0];

    if (directionalWatchPattern) {
      const fallback = createDirectionalRecommendation(directionalWatchPattern, context);
      if (fallback) {
        candidates.push(attachRecommendationGovernance(fallback, directionalWatchPattern));
        directionalFallbackUsed = true;
      }
    }
  }

  return {
    candidates,
    diagnostics: {
      patternsAnalyzed: patterns.length,
      survivingPatterns: rankedPatterns.length,
      directionalFallbackUsed,
      topFocusKeys: rankedPatterns.slice(0, 4).map((pattern) => getPatternFocusKey(pattern)),
    },
  };
}
