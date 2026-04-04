import type { Alert } from './alertMonitoring';

type AlertReadiness = 'Action-ready' | 'Needs review' | 'Directional';

const safeSeverity = (severity: unknown): Alert['severity'] => {
  return severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low'
    ? severity
    : 'medium';
};

const safeAlertType = (alertType: unknown): Alert['alert_type'] => {
  return alertType === 'critical' || alertType === 'warning' || alertType === 'info'
    ? alertType
    : 'info';
};

const safeStatus = (status: unknown): Alert['status'] => {
  return status === 'new' || status === 'acknowledged' || status === 'snoozed' || status === 'resolved' || status === 'dismissed'
    ? status
    : 'new';
};

export const normalizeAIMAlert = (alert: Alert): Alert => ({
  ...alert,
  title: alert.title || 'Operational alert',
  description: alert.description || 'AIM detected an alert signal that needs review.',
  severity: safeSeverity(alert.severity),
  alert_type: safeAlertType(alert.alert_type),
  status: safeStatus(alert.status),
  category: alert.category || 'Operational Monitoring',
  actions: Array.isArray(alert.actions)
    ? alert.actions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [],
});

export const dedupeAIMAlerts = (alerts: Alert[]) => {
  const bySignature = new Map<string, Alert>();

  for (const rawAlert of alerts) {
    const alert = normalizeAIMAlert(rawAlert);
    const signature = [
      alert.title || 'untitled',
      alert.category || 'uncategorized',
      alert.severity,
      alert.status,
      alert.metric_id || 'metricless',
    ].join('::');

    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, alert);
      continue;
    }

    const existingTimestamp = new Date((existing as any).updated_at || existing.created_at).getTime();
    const nextTimestamp = new Date((alert as any).updated_at || alert.created_at).getTime();

    if (nextTimestamp > existingTimestamp) {
      bySignature.set(signature, alert);
    }
  }

  return Array.from(bySignature.values());
};

export const getAIMAlertReadiness = (alert: Alert): AlertReadiness => {
  if ((alert.confidence || 0) >= 85 && alert.severity === 'critical') {
    return 'Action-ready';
  }
  if ((alert.confidence || 0) >= 70 || alert.severity === 'high') {
    return 'Needs review';
  }
  return 'Directional';
};

export const summarizeAIMAlerts = (alerts: Alert[]) => {
  const groupedAlerts = dedupeAIMAlerts(alerts);

  return groupedAlerts.reduce(
    (acc, alert) => {
      const readiness = getAIMAlertReadiness(alert);

      acc.total += 1;
      if (readiness === 'Action-ready') acc.actionReady += 1;
      if (readiness === 'Needs review') acc.needsReview += 1;
      if (alert.status === 'new') acc.new += 1;
      if (alert.status === 'acknowledged') acc.acknowledged += 1;
      if (alert.status === 'resolved') acc.resolved += 1;
      if (alert.status === 'critical') acc.critical += 1;
      if (alert.severity === 'high') acc.high += 1;
      if (alert.severity === 'medium') acc.medium += 1;
      if (alert.severity === 'low') acc.low += 1;
      if (alert.status === 'new') acc.unacknowledged += 1;
      if (alert.status !== 'resolved' && alert.status !== 'dismissed') acc.active += 1;
      return acc;
    },
    {
      total: 0,
      new: 0,
      acknowledged: 0,
      resolved: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      actionReady: 0,
      needsReview: 0,
      unacknowledged: 0,
      active: 0,
    }
  );
};
