import type { Alert } from './alertMonitoring';
import type { Recommendation } from './recommendationsEngine';
import {
  buildAIMEvidenceContract,
  formatIntelligenceFreshnessLabel,
  getAlertDecisionReadiness,
  getIntelligenceConfidenceState,
  getRecommendationDecisionReadiness,
  type IntelligenceEvidenceContract,
  type IntelligenceReadiness,
  type IntelligenceSourceLabel,
} from './intelligenceContract';

export interface CanonicalAlertSignal {
  id: string;
  kind: 'alert';
  title: string;
  summary: string;
  category: string;
  status: Alert['status'];
  severity: Alert['severity'];
  alertType: Alert['alert_type'];
  confidenceScore: number;
  predictedDate?: string;
  daysUntil?: number;
  recommendedActions: string[];
  evidence: IntelligenceEvidenceContract;
  createdAt: string;
}

export interface CanonicalRecommendationSignal {
  id: string;
  kind: 'recommendation';
  title: string;
  summary: string;
  category: Recommendation['category'];
  status: Recommendation['status'];
  priority: Recommendation['priority'];
  impactScore: number;
  effortScore: number;
  confidenceScore: number;
  recommendedActions: string[];
  expectedImpact?: string;
  evidence: IntelligenceEvidenceContract;
  createdAt: string;
}

export interface CanonicalTrackedWorkItem {
  id: string;
  kind: 'tracked_work';
  title: string;
  workType: 'Task' | 'DMAIC' | 'Kaizen';
  status: 'Not Started' | 'In Progress' | 'Completed' | 'On Hold';
  priority: 'High' | 'Medium' | 'Low';
  owner?: string;
  linkedRecommendationId?: string | null;
  outcomeState: 'Captured' | 'Awaiting Verification' | 'Monitoring' | 'At Risk' | 'Baseline Ready';
  outcomeDetail: string;
  dueDate?: string | null;
  impactValue?: number;
}

export interface CanonicalDecisionBrief {
  id: string;
  kind: 'decision';
  title: string;
  recommendation: string;
  score: number;
  confidenceScore: number;
  evidence: IntelligenceEvidenceContract;
}

export interface CanonicalForecastScenario {
  id: string;
  kind: 'forecast';
  name: string;
  projectedImpact: string;
  confidenceScore: number;
  evidence: IntelligenceEvidenceContract;
}

function getRecommendationSourceLabel(rec: Recommendation): IntelligenceSourceLabel {
  if (Array.isArray(rec.source_data?.values) || rec.source_data?.metric || rec.source_data?.forecast) {
    return 'Source-backed';
  }
  if (rec.source_data) return 'Derived';
  return 'Heuristic';
}

function getAlertSourceLabel(alert: Alert): IntelligenceSourceLabel {
  if (alert.metric_id || alert.predicted_date || typeof alert.days_until === 'number') {
    return 'Source-backed';
  }
  if (alert.category) return 'Derived';
  return 'Heuristic';
}

export function toRecommendationSignal(rec: Recommendation): CanonicalRecommendationSignal {
  const decisionReadiness = getRecommendationDecisionReadiness({
    confidenceScore: rec.confidence_score,
    impactScore: rec.impact_score,
  });

  const evidence = buildAIMEvidenceContract({
    latestAt: rec.updated_at || rec.created_at,
    sourceLabel: getRecommendationSourceLabel(rec),
    decisionReadiness,
    evidenceSignals: rec.source_data ? 3 : 1,
    totalSignals: 5,
    confidenceScore: rec.confidence_score || 0,
    summary:
      rec.source_data
        ? `AIM promoted this recommendation from live signal pressure across ${rec.category} data with ${rec.recommended_actions?.length || 0} proposed actions.`
        : 'AIM is holding this recommendation with limited source context until stronger corroborating evidence arrives.',
    missingEvidence:
      decisionReadiness === 'Action-ready'
        ? ['Outcome capture after execution']
        : ['Fresh corroborating data', 'Sustained source pressure', 'Execution proof from similar work'],
    assumptions: [
      `Impact ${rec.impact_score || 0}%`,
      `Effort ${rec.effort_score || 0}%`,
      getIntelligenceConfidenceState(rec.confidence_score || 0),
    ],
  });

  return {
    id: rec.id,
    kind: 'recommendation',
    title: rec.title,
    summary: rec.description,
    category: rec.category,
    status: rec.status,
    priority: rec.priority,
    impactScore: rec.impact_score || 0,
    effortScore: rec.effort_score || 0,
    confidenceScore: rec.confidence_score || 0,
    recommendedActions: rec.recommended_actions || [],
    expectedImpact: rec.expected_impact,
    evidence,
    createdAt: rec.created_at,
  };
}

export function toAlertSignal(alert: Alert): CanonicalAlertSignal {
  const decisionReadiness = getAlertDecisionReadiness({
    confidenceScore: alert.confidence,
    severity: alert.severity,
  });

  const evidence = buildAIMEvidenceContract({
    latestAt: (alert as any).updated_at || alert.created_at,
    sourceLabel: getAlertSourceLabel(alert),
    decisionReadiness,
    evidenceSignals: alert.metric_id ? 3 : 2,
    totalSignals: 5,
    confidenceScore: alert.confidence || 0,
    summary:
      typeof alert.days_until === 'number'
        ? `AIM sees a ${alert.days_until}-day lead window from current signal movement and alert-engine pressure.`
        : 'AIM is holding this alert as directional pressure while more lead-time evidence accumulates.',
    missingEvidence:
      typeof alert.days_until === 'number'
        ? ['Outcome confirmation after response']
        : ['Reliable lead window', 'More corroborating signal history'],
    assumptions: [
      formatIntelligenceFreshnessLabel((alert as any).updated_at || alert.created_at),
      getIntelligenceConfidenceState(alert.confidence || 0),
    ],
  });

  return {
    id: alert.id,
    kind: 'alert',
    title: alert.title,
    summary: alert.description,
    category: alert.category || 'Operational Monitoring',
    status: alert.status,
    severity: alert.severity,
    alertType: alert.alert_type,
    confidenceScore: alert.confidence || 0,
    predictedDate: alert.predicted_date,
    daysUntil: typeof alert.days_until === 'number' ? alert.days_until : undefined,
    recommendedActions: alert.actions || [],
    evidence,
    createdAt: alert.created_at,
  };
}
