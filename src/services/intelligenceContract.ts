export type IntelligenceReadiness =
  | 'Monitor only'
  | 'Directional'
  | 'Needs review'
  | 'Action-ready';

export type IntelligenceSourceLabel =
  | 'Source-backed'
  | 'Derived'
  | 'Inferred'
  | 'Heuristic';

export type IntelligenceFreshnessState = 'live' | 'delayed' | 'stale';

export interface IntelligenceEvidenceContract {
  decisionReadiness: IntelligenceReadiness;
  sourceLabel: IntelligenceSourceLabel;
  freshnessLabel: string;
  freshnessState: IntelligenceFreshnessState;
  evidenceSummary: string;
  evidenceSignals?: number;
  evidenceCoverage?: number;
  confidenceScore?: number;
  confidenceState?: string;
  lastRecomputedAt?: string;
  assumptions?: string[];
  missingEvidence?: string[];
}

export function getIntelligenceFreshnessState(
  timestamp: string | null | undefined
): IntelligenceFreshnessState {
  if (!timestamp) return 'stale';
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'live';
  const ageHours = ageMs / 3600000;
  if (ageHours <= 6) return 'live';
  if (ageHours <= 24) return 'delayed';
  return 'stale';
}

export function formatIntelligenceFreshnessLabel(timestamp: string | null | undefined) {
  if (!timestamp) return 'Awaiting fresh source telemetry';
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'Source refreshed just now';
  const ageMinutes = Math.floor(ageMs / 60000);
  if (ageMinutes < 1) return 'Source refreshed just now';
  if (ageMinutes < 60) return `Last source update ${ageMinutes}m ago`;
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `Last source update ${ageHours}h ago`;
  return `Last source update ${Math.floor(ageHours / 24)}d ago`;
}

export function getIntelligenceConfidenceState(score: number) {
  if (score >= 85) return 'High confidence';
  if (score >= 70) return 'Moderate confidence';
  if (score > 0) return 'Awaiting stronger evidence';
  return 'Confidence pending';
}

export function getAIMDecisionReadiness(input: {
  confidenceScore: number;
  freshnessAgeHours: number;
  hasActionSignals: boolean;
  liveSignalCount: number;
}): IntelligenceReadiness {
  const { confidenceScore, freshnessAgeHours, hasActionSignals, liveSignalCount } = input;

  if (confidenceScore >= 80 && freshnessAgeHours <= 24 && hasActionSignals) {
    return 'Action-ready';
  }
  if (confidenceScore >= 65 && hasActionSignals) {
    return 'Needs review';
  }
  if (liveSignalCount >= 3) {
    return 'Directional';
  }
  return 'Monitor only';
}

export function getRecommendationDecisionReadiness(input: {
  confidenceScore?: number | null;
  impactScore?: number | null;
}): IntelligenceReadiness {
  const confidence = input.confidenceScore || 0;
  const impact = input.impactScore || 0;

  if (confidence >= 80 && impact >= 60) return 'Action-ready';
  if (confidence >= 65) return 'Needs review';
  return 'Directional';
}

export function getAlertDecisionReadiness(input: {
  confidenceScore?: number | null;
  severity?: string | null;
}): IntelligenceReadiness {
  const confidence = input.confidenceScore || 0;
  const severity = input.severity || 'medium';

  if (confidence >= 85 && severity === 'critical') return 'Action-ready';
  if (confidence >= 70 || severity === 'high') return 'Needs review';
  return 'Directional';
}

export function buildCPIEvidenceContract(input: {
  latestAt: string | null | undefined;
  metricNames: string[];
  sourceLabel: Exclude<IntelligenceSourceLabel, 'Heuristic'>;
  rationale: string;
}): Pick<
  IntelligenceEvidenceContract,
  'freshnessLabel' | 'freshnessState' | 'sourceLabel' | 'evidenceSummary' | 'lastRecomputedAt'
> {
  const { latestAt, metricNames, sourceLabel, rationale } = input;

  return {
    freshnessLabel: formatIntelligenceFreshnessLabel(latestAt),
    freshnessState: getIntelligenceFreshnessState(latestAt),
    sourceLabel,
    evidenceSummary: `${rationale} Inputs: ${metricNames.join(', ')}.`,
    lastRecomputedAt: latestAt ?? new Date().toISOString(),
  };
}

export function buildAIMEvidenceContract(input: {
  latestAt: string | null | undefined;
  sourceLabel: IntelligenceSourceLabel;
  decisionReadiness: IntelligenceReadiness;
  evidenceSignals: number;
  totalSignals: number;
  confidenceScore: number;
  summary: string;
  missingEvidence?: string[];
  assumptions?: string[];
}): IntelligenceEvidenceContract {
  const {
    latestAt,
    sourceLabel,
    decisionReadiness,
    evidenceSignals,
    totalSignals,
    confidenceScore,
    summary,
    missingEvidence,
    assumptions,
  } = input;

  return {
    decisionReadiness,
    sourceLabel,
    freshnessLabel: formatIntelligenceFreshnessLabel(latestAt),
    freshnessState: getIntelligenceFreshnessState(latestAt),
    evidenceSummary: summary,
    evidenceSignals,
    evidenceCoverage: totalSignals > 0 ? Math.round((evidenceSignals / totalSignals) * 100) : 0,
    confidenceScore,
    confidenceState: getIntelligenceConfidenceState(confidenceScore),
    lastRecomputedAt: latestAt ?? new Date().toISOString(),
    missingEvidence,
    assumptions,
  };
}
