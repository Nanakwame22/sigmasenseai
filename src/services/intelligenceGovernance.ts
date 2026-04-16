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
