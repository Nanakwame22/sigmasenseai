export type AutonomyLevel = 'Autonomous' | 'Supervised' | 'Advisory' | 'Blocked';

export interface IntelligenceModelGovernanceInput {
  status?: 'running' | 'training' | 'paused' | string | null;
  reliability?: number | null;
  confidence?: number | null;
  learnCount?: number | null;
  lastRunAt?: string | null;
  alertCount?: number | null;
  featureCount?: number | null;
  hasDedicatedInferenceService?: boolean;
}

export interface IntelligenceModelGovernanceAssessment {
  autonomyLevel: AutonomyLevel;
  score: number;
  label: string;
  explanation: string;
  reasons: string[];
  requiredControls: string[];
  canAutoAct: boolean;
  canRecommend: boolean;
}

export interface IntelligenceDecisionGovernanceInput {
  confidence?: number | null;
  impact?: number | null;
  evidenceCoverage?: number | null;
  sourceLabel?: 'Source-backed' | 'Derived' | 'Inferred' | 'Heuristic' | string | null;
  freshnessState?: 'live' | 'delayed' | 'stale' | string | null;
  lastEvidenceAt?: string | null;
  outcomeCount?: number | null;
  linkedExecutionCount?: number | null;
  activeAlertCount?: number | null;
  riskSeverity?: 'critical' | 'high' | 'medium' | 'low' | string | null;
  hasDedicatedInferenceService?: boolean;
}

export interface IntelligenceDecisionGovernanceAssessment {
  autonomyLevel: AutonomyLevel;
  score: number;
  label: string;
  explanation: string;
  reasons: string[];
  requiredControls: string[];
  canAutoAct: boolean;
  canCreateWork: boolean;
  canRecommend: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getAgeHours(dateString?: string | null) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(dateString).getTime();
  if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY;
  return (Date.now() - timestamp) / 3600000;
}

export function assessIntelligenceModelGovernance(
  input: IntelligenceModelGovernanceInput
): IntelligenceModelGovernanceAssessment {
  const reliability = clamp(Number(input.reliability ?? 0), 0, 100);
  const confidence = input.confidence == null ? 0 : clamp(Number(input.confidence), 0, 100);
  const learnCount = Math.max(0, Number(input.learnCount ?? 0));
  const alertCount = Math.max(0, Number(input.alertCount ?? 0));
  const featureCount = Math.max(0, Number(input.featureCount ?? 0));
  const ageHours = getAgeHours(input.lastRunAt);
  const reasons: string[] = [];
  const requiredControls: string[] = [];

  let score = 0;
  score += reliability * 0.32;
  score += confidence * 0.28;
  score += Math.min(18, learnCount * 4);
  score += input.hasDedicatedInferenceService ? 12 : 4;
  score += featureCount >= 3 ? 8 : featureCount > 0 ? 4 : 0;
  score += ageHours <= 1 ? 10 : ageHours <= 24 ? 6 : 0;
  score -= alertCount > 0 ? Math.min(12, alertCount * 3) : 0;

  if (input.status !== 'running') {
    score -= 28;
    reasons.push('Model is not currently running.');
    requiredControls.push('Resume or retrain the model before operational use.');
  }

  if (!input.hasDedicatedInferenceService) {
    reasons.push('No dedicated inference service is wired for this model yet.');
    requiredControls.push('Keep outputs advisory until a dedicated inference path is connected.');
  }

  if (reliability < 80) {
    reasons.push(`Reliability is ${reliability.toFixed(1)}%, below the production autonomy threshold.`);
    requiredControls.push('Require human review for recommendations from this model.');
  }

  if (confidence < 75) {
    reasons.push(`Prediction confidence is ${confidence > 0 ? `${confidence.toFixed(1)}%` : 'not available'}.`);
    requiredControls.push('Collect more current observations before allowing automatic escalation.');
  }

  if (learnCount < 3) {
    reasons.push('Outcome feedback is still thin.');
    requiredControls.push('Feed at least 3 resolved cases back into reliability scoring.');
  }

  if (ageHours > 24) {
    reasons.push('The latest model run is older than 24 hours.');
    requiredControls.push('Run a fresh check before using this model for live decisions.');
  }

  if (featureCount < 3) {
    reasons.push('The model has fewer than 3 active input features.');
    requiredControls.push('Connect additional source-backed features to reduce single-signal bias.');
  }

  if (alertCount > 0) {
    reasons.push(`${alertCount} active alert${alertCount === 1 ? '' : 's'} still need review.`);
    requiredControls.push('Resolve or acknowledge active alerts before autonomous action.');
  }

  const finalScore = Math.round(clamp(score, 0, 100));
  let autonomyLevel: AutonomyLevel = 'Blocked';

  if (
    finalScore >= 88 &&
    reliability >= 88 &&
    confidence >= 85 &&
    learnCount >= 5 &&
    ageHours <= 6 &&
    input.status === 'running' &&
    input.hasDedicatedInferenceService &&
    alertCount === 0
  ) {
    autonomyLevel = 'Autonomous';
  } else if (
    finalScore >= 72 &&
    reliability >= 78 &&
    confidence >= 70 &&
    ageHours <= 24 &&
    input.status === 'running'
  ) {
    autonomyLevel = 'Supervised';
  } else if (finalScore >= 45 && input.status !== 'paused') {
    autonomyLevel = 'Advisory';
  }

  const explanation =
    autonomyLevel === 'Autonomous'
      ? 'Eligible for autonomous operational action with monitoring.'
      : autonomyLevel === 'Supervised'
        ? 'Can recommend action, but a human should confirm before execution.'
        : autonomyLevel === 'Advisory'
          ? 'Useful for context and prioritization, not direct operational action.'
          : 'Not safe for live decision support until controls are satisfied.';

  return {
    autonomyLevel,
    score: finalScore,
    label: `${autonomyLevel} · ${finalScore}/100`,
    explanation,
    reasons: reasons.length > 0 ? reasons : ['Meets current governance controls.'],
    requiredControls: Array.from(new Set(requiredControls)),
    canAutoAct: autonomyLevel === 'Autonomous',
    canRecommend: autonomyLevel === 'Autonomous' || autonomyLevel === 'Supervised',
  };
}

export function assessDecisionAutonomy(
  input: IntelligenceDecisionGovernanceInput
): IntelligenceDecisionGovernanceAssessment {
  const confidence = clamp(Number(input.confidence ?? 0), 0, 100);
  const impact = clamp(Number(input.impact ?? 0), 0, 100);
  const evidenceCoverage = clamp(Number(input.evidenceCoverage ?? 0), 0, 100);
  const outcomeCount = Math.max(0, Number(input.outcomeCount ?? 0));
  const linkedExecutionCount = Math.max(0, Number(input.linkedExecutionCount ?? 0));
  const activeAlertCount = Math.max(0, Number(input.activeAlertCount ?? 0));
  const sourceLabel = input.sourceLabel || 'Heuristic';
  const freshnessState = input.freshnessState || getFreshnessState(input.lastEvidenceAt);
  const riskSeverity = input.riskSeverity || 'medium';
  const reasons: string[] = [];
  const requiredControls: string[] = [];

  let score = 0;
  score += confidence * 0.3;
  score += impact * 0.16;
  score += evidenceCoverage * 0.22;
  score += sourceLabel === 'Source-backed' ? 14 : sourceLabel === 'Derived' ? 9 : sourceLabel === 'Inferred' ? 5 : 0;
  score += freshnessState === 'live' ? 10 : freshnessState === 'delayed' ? 5 : 0;
  score += Math.min(12, outcomeCount * 3);
  score += Math.min(8, linkedExecutionCount * 4);
  score += input.hasDedicatedInferenceService ? 8 : 2;
  score -= activeAlertCount > 0 ? Math.min(12, activeAlertCount * 3) : 0;
  score -= riskSeverity === 'critical' ? 4 : riskSeverity === 'high' ? 2 : 0;

  if (sourceLabel !== 'Source-backed') {
    reasons.push(`Evidence is ${sourceLabel.toLowerCase()}, not fully source-backed.`);
    requiredControls.push('Require human review before operational execution.');
  }

  if (freshnessState === 'stale') {
    reasons.push('The supporting evidence is stale.');
    requiredControls.push('Refresh the source data before using this for live decisions.');
  }

  if (confidence < 75) {
    reasons.push(`Decision confidence is ${confidence > 0 ? `${confidence.toFixed(1)}%` : 'not available'}.`);
    requiredControls.push('Collect stronger corroborating evidence before escalation.');
  }

  if (evidenceCoverage < 60) {
    reasons.push(`Evidence coverage is ${evidenceCoverage.toFixed(0)}%, below production decision threshold.`);
    requiredControls.push('Connect more independent evidence signals before autonomy.');
  }

  if (outcomeCount < 3) {
    reasons.push('Outcome-learning history is still limited.');
    requiredControls.push('Feed at least 3 verified outcomes back into the intelligence layer.');
  }

  if (linkedExecutionCount < 1) {
    reasons.push('No linked execution history is available yet.');
    requiredControls.push('Route through Action Tracker before allowing autonomous action.');
  }

  if (!input.hasDedicatedInferenceService) {
    reasons.push('No dedicated inference service is declared for this decision family.');
    requiredControls.push('Keep this recommendation supervised until inference ownership is explicit.');
  }

  if (activeAlertCount > 0) {
    reasons.push(`${activeAlertCount} active alert${activeAlertCount === 1 ? '' : 's'} still need review.`);
    requiredControls.push('Resolve or acknowledge related alerts before autonomous execution.');
  }

  const finalScore = Math.round(clamp(score, 0, 100));
  let autonomyLevel: AutonomyLevel = 'Blocked';

  if (
    finalScore >= 90 &&
    confidence >= 88 &&
    evidenceCoverage >= 80 &&
    sourceLabel === 'Source-backed' &&
    freshnessState === 'live' &&
    outcomeCount >= 5 &&
    linkedExecutionCount >= 2 &&
    activeAlertCount === 0 &&
    input.hasDedicatedInferenceService
  ) {
    autonomyLevel = 'Autonomous';
  } else if (
    finalScore >= 72 &&
    confidence >= 75 &&
    evidenceCoverage >= 60 &&
    sourceLabel !== 'Heuristic' &&
    freshnessState !== 'stale'
  ) {
    autonomyLevel = 'Supervised';
  } else if (finalScore >= 45 && freshnessState !== 'stale') {
    autonomyLevel = 'Advisory';
  }

  const explanation =
    autonomyLevel === 'Autonomous'
      ? 'Can execute inside configured guardrails with monitoring and audit capture.'
      : autonomyLevel === 'Supervised'
        ? 'Can recommend and create tracked work, but a person should approve the operational decision.'
        : autonomyLevel === 'Advisory'
          ? 'Useful for prioritization and review, not enough for operational execution.'
          : 'Blocked from decision support until evidence, freshness, and controls improve.';

  return {
    autonomyLevel,
    score: finalScore,
    label: `${autonomyLevel} · ${finalScore}/100`,
    explanation,
    reasons: reasons.length > 0 ? reasons : ['Meets current decision-governance controls.'],
    requiredControls: Array.from(new Set(requiredControls)),
    canAutoAct: autonomyLevel === 'Autonomous',
    canCreateWork: autonomyLevel === 'Autonomous' || autonomyLevel === 'Supervised',
    canRecommend: autonomyLevel !== 'Blocked',
  };
}

function getFreshnessState(timestamp?: string | null): 'live' | 'delayed' | 'stale' {
  const ageHours = getAgeHours(timestamp);
  if (ageHours <= 6) return 'live';
  if (ageHours <= 24) return 'delayed';
  return 'stale';
}
