import type { Recommendation } from './recommendationsEngine';

export type IntelligenceHealthSeverity = 'Healthy' | 'Watch' | 'Needs attention';

export interface IntelligenceHealthIssue {
  key: string;
  label: string;
  count: number;
  severity: IntelligenceHealthSeverity;
  detail: string;
}

export interface IntelligenceHealthSummary {
  severity: IntelligenceHealthSeverity;
  score: number;
  issues: IntelligenceHealthIssue[];
  headline: string;
  note: string;
}

interface AIMAlertLike {
  status?: string | null;
  confidence?: number | null;
}

interface AIMActionLike {
  status?: string | null;
  progress?: number | null;
  due_date?: string | null;
  tags?: string[] | null;
}

interface CPIDomainLike {
  freshness_state?: 'live' | 'delayed' | 'stale' | string | null;
  source_label?: string | null;
  status?: 'stable' | 'elevated' | 'critical' | string | null;
}

interface CPIFeedLike {
  severity?: 'critical' | 'warning' | 'info' | string | null;
  acknowledged?: boolean | null;
}

function buildSummary(issues: IntelligenceHealthIssue[], defaultHeadline: string, defaultNote: string): IntelligenceHealthSummary {
  const relevantIssues = issues.filter((issue) => issue.count > 0);

  if (relevantIssues.length === 0) {
    return {
      severity: 'Healthy',
      score: 92,
      issues,
      headline: defaultHeadline,
      note: defaultNote,
    };
  }

  const hasAttentionIssue = relevantIssues.some((issue) => issue.severity === 'Needs attention');
  const hasWatchIssue = relevantIssues.some((issue) => issue.severity === 'Watch');
  const severity: IntelligenceHealthSeverity = hasAttentionIssue ? 'Needs attention' : hasWatchIssue ? 'Watch' : 'Healthy';

  const scorePenalty = relevantIssues.reduce((sum, issue) => {
    const basePenalty = issue.severity === 'Needs attention' ? 16 : issue.severity === 'Watch' ? 10 : 4;
    return sum + Math.min(24, basePenalty + issue.count * 2);
  }, 0);

  const topIssue = relevantIssues
    .slice()
    .sort((a, b) => {
      const severityRank = { 'Needs attention': 3, Watch: 2, Healthy: 1 };
      const severityDelta = severityRank[b.severity] - severityRank[a.severity];
      if (severityDelta !== 0) return severityDelta;
      return b.count - a.count;
    })[0];

  return {
    severity,
    score: Math.max(34, 94 - scorePenalty),
    issues,
    headline:
      severity === 'Needs attention'
        ? `${topIssue.label} need attention`
        : `${topIssue.label} should be watched`,
    note: topIssue.detail,
  };
}

export function buildAIMIntelligenceHealth(input: {
  latestMetricTimestamp: string | null | undefined;
  recommendations: Recommendation[];
  alerts: AIMAlertLike[];
  actionItems: AIMActionLike[];
}): IntelligenceHealthSummary {
  const { latestMetricTimestamp, recommendations, alerts, actionItems } = input;
  const now = Date.now();
  const ageHours = latestMetricTimestamp ? (now - new Date(latestMetricTimestamp).getTime()) / 3600000 : Number.POSITIVE_INFINITY;

  const weakVerification = recommendations.filter((rec) => {
    if (rec.status !== 'completed' && rec.status !== 'dismissed') return false;
    const feedback = rec.source_data?.verification_feedback;
    return !feedback || feedback.evidence_strength === 'limited' || feedback.verification_status !== 'complete';
  }).length;

  const linkedRecommendationIds = new Set(
    actionItems
      .flatMap((item) => (Array.isArray(item.tags) ? item.tags : []))
      .filter((tag) => typeof tag === 'string' && tag.startsWith('rec:'))
      .map((tag) => tag.replace('rec:', ''))
  );

  const linkageDrift = recommendations.filter((rec) => {
    if (!['in_progress', 'completed'].includes(rec.status)) return false;
    return !linkedRecommendationIds.has(rec.id);
  }).length;

  const lowConfidenceOutputs =
    recommendations.filter((rec) => ['pending', 'in_progress'].includes(rec.status) && (rec.confidence_score || 0) < 65).length +
    alerts.filter((alert) => alert.status !== 'resolved' && (alert.confidence || 0) < 70).length;

  const overdueVerification = actionItems.filter((item) => {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    if (!tags.includes('aim-verification:pending')) return false;
    if (!item.due_date) return false;
    return new Date(item.due_date).getTime() < now;
  }).length;

  const issues: IntelligenceHealthIssue[] = [
    {
      key: 'stale_evidence',
      label: 'Stale evidence inputs',
      count: ageHours > 24 ? 1 : 0,
      severity: 'Needs attention',
      detail: 'Core AIM metric telemetry is older than 24 hours, so recommendations and confidence may be drifting from live conditions.',
    },
    {
      key: 'weak_verification',
      label: 'Weak outcome verification',
      count: weakVerification,
      severity: weakVerification >= 2 ? 'Needs attention' : 'Watch',
      detail: 'Completed or dismissed recommendations are missing strong verification evidence, which weakens future learning quality.',
    },
    {
      key: 'linkage_drift',
      label: 'Recommendation linkage gaps',
      count: linkageDrift,
      severity: linkageDrift > 0 ? 'Needs attention' : 'Healthy',
      detail: 'Some live recommendations have no linked Action Tracker record, so AIM cannot reliably observe execution outcomes.',
    },
    {
      key: 'low_confidence_outputs',
      label: 'Low-confidence outputs',
      count: lowConfidenceOutputs,
      severity: lowConfidenceOutputs >= 4 ? 'Watch' : 'Healthy',
      detail: 'Several live alerts or recommendations are still running with limited supporting evidence and should be reviewed before escalation.',
    },
    {
      key: 'overdue_verification',
      label: 'Overdue verification loops',
      count: overdueVerification,
      severity: overdueVerification > 0 ? 'Watch' : 'Healthy',
      detail: 'Linked work has finished or is past due while verification is still pending, which slows outcome-based learning.',
    },
  ];

  return buildSummary(
    issues,
    'AIM intelligence health is stable',
    'Live telemetry, action linkage, and verification loops are healthy enough for continued decision support.'
  );
}

export function buildCPIIntelligenceHealth(input: {
  domains: CPIDomainLike[];
  feed: CPIFeedLike[];
}): IntelligenceHealthSummary {
  const { domains, feed } = input;

  const staleDomains = domains.filter((domain) => domain.freshness_state === 'stale').length;
  const inferredDomains = domains.filter((domain) => domain.source_label === 'Inferred').length;
  const criticalUnacknowledged = feed.filter((item) => item.severity === 'critical' && !item.acknowledged).length;
  const elevatedPressure = domains.filter((domain) => domain.status === 'critical' || domain.status === 'elevated').length;

  const issues: IntelligenceHealthIssue[] = [
    {
      key: 'stale_domains',
      label: 'Stale domain telemetry',
      count: staleDomains,
      severity: staleDomains > 0 ? 'Needs attention' : 'Healthy',
      detail: 'One or more CPI domains are being driven by stale source updates, so current workflow guidance may no longer match live operations.',
    },
    {
      key: 'critical_unacknowledged',
      label: 'Critical feed items unacknowledged',
      count: criticalUnacknowledged,
      severity: criticalUnacknowledged >= 2 ? 'Needs attention' : criticalUnacknowledged > 0 ? 'Watch' : 'Healthy',
      detail: 'Critical feed items are still unacknowledged, which means CPI escalation logic may be outrunning human review.',
    },
    {
      key: 'derived_domains',
      label: 'Derived domains under watch',
      count: inferredDomains,
      severity: inferredDomains >= 2 ? 'Watch' : 'Healthy',
      detail: 'Some CPI domains are still inferred rather than directly source-backed, so operators should validate pressure before closing cases.',
    },
    {
      key: 'elevated_pressure',
      label: 'Elevated domain pressure',
      count: elevatedPressure,
      severity: elevatedPressure >= 4 ? 'Watch' : 'Healthy',
      detail: 'Several domains are elevated or critical at once, which increases the chance that workflow signals need tighter operational supervision.',
    },
  ];

  return buildSummary(
    issues,
    'CPI intelligence health is stable',
    'Domain telemetry and feed acknowledgment are healthy enough for live CPI decision support.'
  );
}
