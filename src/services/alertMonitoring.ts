import { supabase } from '../lib/supabase';

export interface Alert {
  id: string;
  organization_id: string;
  metric_id?: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  alert_type: 'critical' | 'warning' | 'info';
  predicted_date?: string;
  days_until?: number;
  confidence?: number;
  category?: string;
  actions?: string[];
  status: 'new' | 'acknowledged' | 'snoozed' | 'resolved' | 'dismissed';
  is_read: boolean;
  acknowledged_at?: string;
  snoozed_until?: string;
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
}

export interface AlertPreferences {
  id?: string;
  organization_id: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  sms_enabled: boolean;
  slack_enabled: boolean;
  frequency: 'realtime' | 'daily' | 'weekly';
  critical_always: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

// Monitor metrics and generate predictive alerts
export async function monitorMetricsForAlerts(organizationId: string): Promise<Alert[]> {
  try {
    const generatedAlerts: Alert[] = [];

    // Fetch all metrics for the organization
    const { data: metrics } = await supabase
      .from('metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (!metrics || metrics.length === 0) {
      return generatedAlerts;
    }

    for (const metric of metrics) {
      // Fetch recent metric data (last 30 days)
      const { data: metricData } = await supabase
        .from('metric_data')
        .select('value, timestamp')
        .eq('metric_id', metric.id)
        .order('timestamp', { ascending: false })
        .limit(30);

      if (!metricData || metricData.length < 10) continue;

      const values = metricData.map(d => d.value).reverse();
      
      // Calculate trend
      const recentValues = values.slice(-7);
      const olderValues = values.slice(0, Math.min(7, values.length - 7));
      
      if (olderValues.length === 0) continue;
      
      const recentAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
      const olderAvg = olderValues.reduce((a, b) => a + b, 0) / olderValues.length;
      const changeRate = ((recentAvg - olderAvg) / olderAvg) * 100;

      // Check if metric is trending towards target breach
      if (metric.target_value && Math.abs(changeRate) > 5) {
        const currentValue = values[values.length - 1];
        const targetValue = metric.target_value;
        const targetDirection = metric.target_direction || 'maximize';
        const isIncreasing = changeRate > 0;

        let willBreachTarget = false;
        let breachType = '';

        if (targetDirection === 'maximize' && !isIncreasing && currentValue < targetValue) {
          willBreachTarget = true;
          breachType = 'fall below';
        } else if (targetDirection === 'minimize' && isIncreasing && currentValue > targetValue) {
          willBreachTarget = true;
          breachType = 'exceed';
        }

        if (willBreachTarget) {
          const difference = Math.abs(currentValue - targetValue);
          const daysUntil = Math.max(3, Math.min(30, Math.round(difference / Math.abs(changeRate) * 30)));
          const confidence = Math.min(95, 70 + Math.abs(changeRate));

          const predictedDate = new Date();
          predictedDate.setDate(predictedDate.getDate() + daysUntil);

          const severity = daysUntil <= 7 ? 'critical' : daysUntil <= 14 ? 'high' : 'medium';
          const alertType = daysUntil <= 7 ? 'critical' : daysUntil <= 14 ? 'warning' : 'info';

          // Check if alert already exists
          const { data: existingAlert } = await supabase
            .from('alerts')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('metric_id', metric.id)
            .eq('status', 'new')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .single();

          if (!existingAlert) {
            const alert: Alert = {
              id: '',
              organization_id: organizationId,
              metric_id: metric.id,
              title: `${metric.name} Predicted to ${breachType.charAt(0).toUpperCase() + breachType.slice(1)} Target`,
              description: `Based on current trend (${changeRate > 0 ? '+' : ''}${changeRate.toFixed(1)}% change), ${metric.name} is predicted to ${breachType} target of ${targetValue} in ${daysUntil} days.`,
              severity,
              alert_type: alertType,
              predicted_date: predictedDate.toISOString(),
              days_until: daysUntil,
              confidence,
              category: metric.category || 'Performance',
              actions: [
                `Review ${metric.name} process for root causes`,
                'Implement corrective actions immediately',
                'Monitor daily until trend reverses',
                'Escalate to management if no improvement in 3 days'
              ],
              status: 'new',
              is_read: false,
              message: `${metric.name} alert`,
              created_at: new Date().toISOString()
            };

            generatedAlerts.push(alert);
          }
        }
      }

      // Check for anomalies
      const { data: recentAnomalies } = await supabase
        .from('anomalies')
        .select('*')
        .eq('metric_id', metric.id)
        .eq('status', 'new')
        .gte('detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (recentAnomalies && recentAnomalies.length > 0) {
        for (const anomaly of recentAnomalies) {
          const severity = anomaly.severity as 'critical' | 'high' | 'medium' | 'low';
          const alertType = severity === 'critical' ? 'critical' : severity === 'high' ? 'warning' : 'info';

          const alert: Alert = {
            id: '',
            organization_id: organizationId,
            metric_id: metric.id,
            title: `Anomaly Detected in ${metric.name}`,
            description: `${anomaly.anomaly_type.charAt(0).toUpperCase() + anomaly.anomaly_type.slice(1)} detected with ${anomaly.deviation?.toFixed(1)}% deviation from expected value.`,
            severity,
            alert_type: alertType,
            confidence: anomaly.confidence_score || 85,
            category: 'Anomaly Detection',
            actions: [
              'Investigate root cause of anomaly',
              'Check data quality and sources',
              'Review recent process changes',
              'Document findings and resolution'
            ],
            status: 'new',
            is_read: false,
            message: `Anomaly in ${metric.name}`,
            created_at: new Date().toISOString()
          };

          generatedAlerts.push(alert);
        }
      }
    }

    // Check for data quality issues
    const { data: qualityResults } = await supabase
      .from('data_quality_results')
      .select('*, data_quality_checks(*)')
      .eq('organization_id', organizationId)
      .eq('status', 'failed')
      .gte('checked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (qualityResults && qualityResults.length >= 3) {
      const alert: Alert = {
        id: '',
        organization_id: organizationId,
        title: 'Multiple Data Quality Issues Detected',
        description: `${qualityResults.length} data quality checks have failed in the last 24 hours. This may impact data accuracy and decision-making.`,
        severity: qualityResults.length >= 5 ? 'high' : 'medium',
        alert_type: qualityResults.length >= 5 ? 'warning' : 'info',
        confidence: 90,
        category: 'Data Quality',
        actions: [
          'Review failed data quality checks',
          'Identify root cause of data issues',
          'Implement automated validation rules',
          'Schedule data cleanup activities'
        ],
        status: 'new',
        is_read: false,
        message: 'Data quality issues detected',
        created_at: new Date().toISOString()
      };

      generatedAlerts.push(alert);
    }

    // Check for projects approaching deadlines
    const { data: projects } = await supabase
      .from('dmaic_projects')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'in_progress')
      .not('target_completion_date', 'is', null);

    if (projects) {
      for (const project of projects) {
        const dueDate = new Date(project.target_completion_date);
        const today = new Date();
        const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil > 0 && daysUntil <= 14) {
          const severity = daysUntil <= 3 ? 'critical' : daysUntil <= 7 ? 'high' : 'medium';
          const alertType = daysUntil <= 3 ? 'critical' : daysUntil <= 7 ? 'warning' : 'info';

          const alert: Alert = {
            id: '',
            organization_id: organizationId,
            title: `Project "${project.name}" Approaching Deadline`,
            description: `Project is due in ${daysUntil} days. Current status: ${project.status}. Ensure all deliverables are on track.`,
            severity,
            alert_type: alertType,
            predicted_date: dueDate.toISOString(),
            days_until: daysUntil,
            confidence: 95,
            category: 'Project Management',
            actions: [
              'Review project progress and milestones',
              'Identify any blockers or risks',
              'Allocate additional resources if needed',
              'Communicate status to stakeholders'
            ],
            status: 'new',
            is_read: false,
            message: `Project ${project.name} deadline approaching`,
            created_at: new Date().toISOString()
          };

          generatedAlerts.push(alert);
        }
      }
    }

    return generatedAlerts;
  } catch (error) {
    console.error('Error monitoring metrics for alerts:', error);
    return [];
  }
}

// Save alerts to database
export async function saveAlerts(alerts: Alert[]): Promise<void> {
  if (alerts.length === 0) return;

  try {
    const alertsToInsert = alerts.map(alert => ({
      organization_id: alert.organization_id,
      metric_id: alert.metric_id,
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      alert_type: alert.alert_type,
      predicted_date: alert.predicted_date,
      days_until: alert.days_until,
      confidence: alert.confidence,
      category: alert.category,
      actions: alert.actions,
      status: alert.status,
      is_read: alert.is_read,
      message: alert.message
    }));

    const { error } = await supabase
      .from('alerts')
      .insert(alertsToInsert);

    if (error) throw error;
  } catch (error) {
    console.error('Error saving alerts:', error);
    throw error;
  }
}

// Get all alerts for organization
export async function getAlerts(organizationId: string, filters?: {
  status?: string;
  severity?: string;
  category?: string;
}): Promise<Alert[]> {
  try {
    let query = supabase
      .from('alerts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.severity && filters.severity !== 'all') {
      query = query.eq('severity', filters.severity);
    }

    if (filters?.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return [];
  }
}

// Acknowledge alert
export async function acknowledgeAlert(alertId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
        is_read: true
      })
      .eq('id', alertId);

    if (error) throw error;
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    throw error;
  }
}

// Snooze alert
export async function snoozeAlert(alertId: string, hours: number = 24): Promise<void> {
  try {
    const snoozeUntil = new Date();
    snoozeUntil.setHours(snoozeUntil.getHours() + hours);

    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'snoozed',
        snoozed_until: snoozeUntil.toISOString(),
        is_read: true
      })
      .eq('id', alertId);

    if (error) throw error;
  } catch (error) {
    console.error('Error snoozing alert:', error);
    throw error;
  }
}

// Resolve alert
export async function resolveAlert(alertId: string, notes?: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: notes,
        is_read: true
      })
      .eq('id', alertId);

    if (error) throw error;
  } catch (error) {
    console.error('Error resolving alert:', error);
    throw error;
  }
}

// Dismiss alert
export async function dismissAlert(alertId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'dismissed',
        is_read: true
      })
      .eq('id', alertId);

    if (error) throw error;
  } catch (error) {
    console.error('Error dismissing alert:', error);
    throw error;
  }
}

// Get alert preferences
export async function getAlertPreferences(organizationId: string): Promise<AlertPreferences | null> {
  try {
    const { data, error } = await supabase
      .from('alert_preferences')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return data;
  } catch (error) {
    console.error('Error fetching alert preferences:', error);
    return null;
  }
}

// Save alert preferences
export async function saveAlertPreferences(preferences: AlertPreferences): Promise<void> {
  try {
    const { error } = await supabase
      .from('alert_preferences')
      .upsert({
        ...preferences,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error saving alert preferences:', error);
    throw error;
  }
}

// Check for snoozed alerts that should be reactivated
export async function reactivateSnoozedAlerts(organizationId: string): Promise<void> {
  try {
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'new',
        snoozed_until: null
      })
      .eq('organization_id', organizationId)
      .eq('status', 'snoozed')
      .lt('snoozed_until', now);

    if (error) throw error;
  } catch (error) {
    console.error('Error reactivating snoozed alerts:', error);
  }
}

// Get alert statistics
export async function getAlertStats(organizationId: string): Promise<{
  total: number;
  new: number;
  acknowledged: number;
  resolved: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}> {
  try {
    const { data: alerts } = await supabase
      .from('alerts')
      .select('status, severity')
      .eq('organization_id', organizationId);

    if (!alerts) {
      return {
        total: 0,
        new: 0,
        acknowledged: 0,
        resolved: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      };
    }

    return {
      total: alerts.length,
      new: alerts.filter(a => a.status === 'new').length,
      acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
      resolved: alerts.filter(a => a.status === 'resolved').length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      high: alerts.filter(a => a.severity === 'high').length,
      medium: alerts.filter(a => a.severity === 'medium').length,
      low: alerts.filter(a => a.severity === 'low').length
    };
  } catch (error) {
    console.error('Error fetching alert stats:', error);
    return {
      total: 0,
      new: 0,
      acknowledged: 0,
      resolved: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };
  }
}
