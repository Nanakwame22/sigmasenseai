/**
 * Anomaly → Alert Bridge
 * Automatically creates alerts when anomalies are detected.
 * Deduplicates so the same anomaly never spawns two alerts.
 */
import { supabase } from '../lib/supabase';

export interface AnomalyAlertResult {
  created: number;
  skipped: number;
  errors: number;
}

/**
 * Given a list of freshly-inserted anomaly IDs, create corresponding alerts
 * for any that don't already have one.
 */
export async function createAlertsFromAnomalies(
  organizationId: string,
  anomalyIds: string[]
): Promise<AnomalyAlertResult> {
  const result: AnomalyAlertResult = { created: 0, skipped: 0, errors: 0 };
  if (!anomalyIds.length) return result;

  // Fetch full anomaly records with metric names
  const { data: anomalies, error: fetchErr } = await supabase
    .from('anomalies')
    .select('*, metric:metrics(name, unit)')
    .in('id', anomalyIds)
    .eq('organization_id', organizationId);

  if (fetchErr || !anomalies) return result;

  for (const anomaly of anomalies) {
    try {
      // Deduplicate: check if an alert already exists for this anomaly
      const { data: existing } = await supabase
        .from('alerts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('anomaly_source_id', anomaly.id)
        .maybeSingle();

      if (existing) { result.skipped++; continue; }

      const metricName: string = anomaly.metric?.name ?? 'Unknown Metric';
      const unit: string = anomaly.metric?.unit ? ` ${anomaly.metric.unit}` : '';
      const deviationPct = anomaly.deviation != null && anomaly.expected_value
        ? Math.abs((anomaly.deviation / anomaly.expected_value) * 100).toFixed(1)
        : null;

      const typeLabel = anomaly.anomaly_type === 'spike' ? 'Spike' : 'Drop';
      const title = `${typeLabel} Detected — ${metricName}`;

      const message = deviationPct
        ? `${typeLabel} of ${deviationPct}% deviation detected in ${metricName}. Observed: ${anomaly.value.toFixed(2)}${unit}, Expected: ${anomaly.expected_value?.toFixed(2) ?? 'N/A'}${unit}.`
        : `Anomaly detected in ${metricName}. Observed value: ${anomaly.value.toFixed(2)}${unit}.`;

      const description = [
        `Detection method: Z-score statistical analysis.`,
        anomaly.confidence_score != null
          ? `Confidence: ${Math.round(anomaly.confidence_score * 100)}%.`
          : null,
        anomaly.metadata?.z_score != null
          ? `Z-score: ${(anomaly.metadata.z_score as number).toFixed(2)} (threshold: 3.0).`
          : null,
        `Detected at: ${new Date(anomaly.detected_at).toLocaleString()}.`,
      ]
        .filter(Boolean)
        .join(' ');

      const severityMap: Record<string, string> = {
        critical: 'critical',
        high: 'high',
        medium: 'medium',
        low: 'low',
      };

      const { error: insertErr } = await supabase.from('alerts').insert({
        organization_id: organizationId,
        metric_id: anomaly.metric_id ?? null,
        anomaly_source_id: anomaly.id,
        title,
        message,
        description,
        severity: severityMap[anomaly.severity] ?? 'medium',
        alert_type: 'anomaly',
        category: 'Anomaly Detection',
        confidence: anomaly.confidence_score ?? null,
        status: 'new',
        is_read: false,
        auto_generated: true,
      });

      if (insertErr) {
        // If column doesn't exist yet, fall back without extra columns
        const { error: fallbackErr } = await supabase.from('alerts').insert({
          organization_id: organizationId,
          metric_id: anomaly.metric_id ?? null,
          title,
          message,
          description,
          severity: severityMap[anomaly.severity] ?? 'medium',
          alert_type: 'anomaly',
          category: 'Anomaly Detection',
          confidence: anomaly.confidence_score ?? null,
          status: 'new',
          is_read: false,
        });
        if (fallbackErr) { result.errors++; continue; }
      }

      result.created++;
    } catch {
      result.errors++;
    }
  }

  return result;
}

/**
 * Scan all unalerted anomalies for an org and create missing alerts.
 * Used on-demand from the Alerts page "Sync" button.
 */
export async function syncAnomalyAlerts(organizationId: string): Promise<AnomalyAlertResult> {
  const result: AnomalyAlertResult = { created: 0, skipped: 0, errors: 0 };

  // Get all active anomalies
  const { data: anomalies, error } = await supabase
    .from('anomalies')
    .select('id')
    .eq('organization_id', organizationId)
    .in('status', ['new', 'acknowledged']);

  if (error || !anomalies) return result;

  const ids = anomalies.map(a => a.id);
  if (!ids.length) return result;

  return createAlertsFromAnomalies(organizationId, ids);
}
