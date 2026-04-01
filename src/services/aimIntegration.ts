import { supabase } from '../lib/supabase';

/**
 * AIM Integration Service
 * Automatically triggers AIM insights when new KPI data is aggregated
 */

interface KPIMetric {
  id: string;
  name: string;
  values: number[];
  timestamps: string[];
  unit: string;
}

export const triggerAIMAnalysis = async (
  userId: string,
  organizationId: string,
  metricIds: string[]
) => {
  try {
    console.log('🤖 Triggering AIM analysis for metrics:', metricIds);

    // Fetch metric data for analysis
    const { data: metricData, error: metricError } = await supabase
      .from('metric_data')
      .select('metric_id, value, timestamp')
      .in('metric_id', metricIds)
      .order('timestamp', { ascending: true });

    if (metricError) throw metricError;

    // Group data by metric
    const metricGroups: Record<string, KPIMetric> = {};
    
    for (const point of metricData || []) {
      if (!metricGroups[point.metric_id]) {
        metricGroups[point.metric_id] = {
          id: point.metric_id,
          name: '',
          values: [],
          timestamps: [],
          unit: ''
        };
      }
      metricGroups[point.metric_id].values.push(point.value);
      metricGroups[point.metric_id].timestamps.push(point.timestamp);
    }

    // Run anomaly detection
    await detectAnomalies(userId, organizationId, metricGroups);

    // Generate forecasts
    await generateForecasts(userId, organizationId, metricGroups);

    // Create alerts for significant findings
    await createAlerts(userId, organizationId, metricGroups);

    console.log('✅ AIM analysis completed successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error in AIM analysis:', error);
    return { success: false, error };
  }
};

const detectAnomalies = async (
  userId: string,
  organizationId: string,
  metrics: Record<string, KPIMetric>
) => {
  const anomalies = [];

  for (const [metricId, metric] of Object.entries(metrics)) {
    if (metric.values.length < 10) continue;

    // Calculate statistical thresholds
    const mean = metric.values.reduce((a, b) => a + b, 0) / metric.values.length;
    const variance = metric.values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / metric.values.length;
    const stdDev = Math.sqrt(variance);
    const upperThreshold = mean + (2 * stdDev);
    const lowerThreshold = mean - (2 * stdDev);

    // Detect anomalies
    metric.values.forEach((value, index) => {
      if (value > upperThreshold || value < lowerThreshold) {
        anomalies.push({
          metric_id: metricId,
          user_id: userId,
          organization_id: organizationId,
          detected_at: metric.timestamps[index],
          value: value,
          expected_value: mean,
          deviation: Math.abs(value - mean),
          severity: Math.abs(value - mean) > (3 * stdDev) ? 'high' : 'medium',
          type: value > upperThreshold ? 'spike' : 'drop',
          status: 'new'
        });
      }
    });
  }

  if (anomalies.length > 0) {
    const { error } = await supabase
      .from('anomalies')
      .insert(anomalies);

    if (error) {
      console.error('Error inserting anomalies:', error);
    } else {
      console.log(`✅ Detected ${anomalies.length} anomalies`);
    }
  }
};

const generateForecasts = async (
  userId: string,
  organizationId: string,
  metrics: Record<string, KPIMetric>
) => {
  const forecasts = [];

  for (const [metricId, metric] of Object.entries(metrics)) {
    if (metric.values.length < 30) continue;

    // Simple exponential smoothing for forecast
    const alpha = 0.3;
    let forecast = metric.values[0];
    const predictions = [];

    // Calculate trend
    for (let i = 1; i < metric.values.length; i++) {
      forecast = alpha * metric.values[i] + (1 - alpha) * forecast;
    }

    // Generate 7-day forecast
    const lastTimestamp = new Date(metric.timestamps[metric.timestamps.length - 1]);
    for (let i = 1; i <= 7; i++) {
      const forecastDate = new Date(lastTimestamp);
      forecastDate.setDate(forecastDate.getDate() + i);
      
      predictions.push({
        date: forecastDate.toISOString(),
        value: forecast,
        confidence: 0.85 - (i * 0.05) // Decreasing confidence
      });
    }

    forecasts.push({
      metric_id: metricId,
      user_id: userId,
      organization_id: organizationId,
      model_type: 'exponential_smoothing',
      forecast_horizon: 7,
      predictions: predictions,
      accuracy_score: 0.85,
      created_at: new Date().toISOString()
    });
  }

  if (forecasts.length > 0) {
    const { error } = await supabase
      .from('forecasts')
      .insert(forecasts);

    if (error) {
      console.error('Error inserting forecasts:', error);
    } else {
      console.log(`✅ Generated ${forecasts.length} forecasts`);
    }
  }
};

const createAlerts = async (
  userId: string,
  organizationId: string,
  metrics: Record<string, KPIMetric>
) => {
  const alerts = [];

  for (const [metricId, metric] of Object.entries(metrics)) {
    if (metric.values.length < 5) continue;

    const recentValues = metric.values.slice(-5);
    const avg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const latestValue = metric.values[metric.values.length - 1];

    // Check for significant changes
    const changePercent = ((latestValue - avg) / avg) * 100;

    if (Math.abs(changePercent) > 20) {
      alerts.push({
        user_id: userId,
        organization_id: organizationId,
        metric_id: metricId,
        type: changePercent > 0 ? 'threshold_exceeded' : 'threshold_below',
        severity: Math.abs(changePercent) > 50 ? 'high' : 'medium',
        message: `KPI ${metric.name || 'metric'} has ${changePercent > 0 ? 'increased' : 'decreased'} by ${Math.abs(changePercent).toFixed(1)}% in recent period`,
        threshold_value: avg,
        current_value: latestValue,
        status: 'active',
        triggered_at: new Date().toISOString()
      });
    }
  }

  if (alerts.length > 0) {
    const { error } = await supabase
      .from('alerts')
      .insert(alerts);

    if (error) {
      console.error('Error inserting alerts:', error);
    } else {
      console.log(`✅ Created ${alerts.length} alerts`);
    }
  }
};

export const getAIMInsights = async (userId: string, organizationId: string) => {
  try {
    // Fetch recent anomalies
    const { data: anomalies } = await supabase
      .from('anomalies')
      .select('*, metrics(name)')
      .eq('user_id', userId)
      .eq('status', 'new')
      .order('detected_at', { ascending: false })
      .limit(5);

    // Fetch recent forecasts
    const { data: forecasts } = await supabase
      .from('forecasts')
      .select('*, metrics(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Fetch active alerts
    const { data: alerts } = await supabase
      .from('alerts')
      .select('*, metrics(name)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('triggered_at', { ascending: false })
      .limit(5);

    return {
      anomalies: anomalies || [],
      forecasts: forecasts || [],
      alerts: alerts || [],
      summary: {
        total_anomalies: anomalies?.length || 0,
        total_forecasts: forecasts?.length || 0,
        active_alerts: alerts?.length || 0
      }
    };
  } catch (error) {
    console.error('Error fetching AIM insights:', error);
    return null;
  }
};