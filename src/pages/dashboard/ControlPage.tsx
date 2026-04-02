import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface KPICard {
  label: string;
  value: string;
  target: string;
  baseline: string;
  improvement: string;
  status: 'stable' | 'warning' | 'critical';
  lastUpdate: string;
  source: string;
}

interface Alert {
  id: string;
  severity: 'low' | 'moderate' | 'critical';
  message: string;
  timestamp: string;
  acknowledged: boolean;
  owner: string;
}

interface SPCPoint {
  x: number;
  value: number;
  ucl: number;
  lcl: number;
  centerLine: number;
  isOutOfControl: boolean;
  timestamp: string;
}

interface MetricOption {
  id: string;
  name: string;
  unit: string;
  target_value: number;
  current_value: number;
}

interface ForecastState {
  sustainabilityPct: number;
  outOfControlCount: number;
  driftRisk: number;
  forecast7: number;
  forecast14: number;
  forecast21: number;
  currentValue: number;
  baselineValue: number;
  targetValue: number;
  sigma: number;
  forecastSlope: number;
  openActions: number;
  completedForecasts: number;
  auditEvents: number;
  metricName: string;
  unit: string;
}

interface ControlPlanItem {
  variable: string;
  frequency: string;
  owner: string;
  threshold: string;
  action: string;
  auditFreq: string;
}

const formatMetricValue = (value: number, unit: string) => {
  if (!Number.isFinite(value)) return '--';
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit.toLowerCase() === 'usd' || unit === '$') return `$${Math.round(value).toLocaleString()}`;
  if (unit) return `${value.toFixed(1)} ${unit}`;
  return value.toFixed(1);
};

const formatRelativeTime = (timestamp?: string | null) => {
  if (!timestamp) return 'No data';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const calculateStdDev = (values: number[]) => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
};

const ControlPage = () => {
  const { organizationId } = useAuth();
  const [selectedChart, setSelectedChart] = useState<'xbar-r' | 'i-mr' | 'p-chart' | 'c-chart' | 'u-chart'>('i-mr');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableMetrics, setAvailableMetrics] = useState<MetricOption[]>([]);
  const [selectedMetricId, setSelectedMetricId] = useState('');
  const [spcData, setSpcData] = useState<SPCPoint[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([]);
  const [kpiCards, setKpiCards] = useState<KPICard[]>([]);
  const [forecastState, setForecastState] = useState<ForecastState>({
    sustainabilityPct: 0,
    outOfControlCount: 0,
    driftRisk: 0,
    forecast7: 0,
    forecast14: 0,
    forecast21: 0,
    currentValue: 0,
    baselineValue: 0,
    targetValue: 0,
    sigma: 0,
    forecastSlope: 0,
    openActions: 0,
    completedForecasts: 0,
    auditEvents: 0,
    metricName: 'Selected Metric',
    unit: '',
  });

  const [controlPlan] = useState<ControlPlanItem[]>([
    {
      variable: 'ER Wait Time (CTQ)',
      frequency: 'Hourly',
      owner: 'Dr. Sarah Chen',
      threshold: '±2σ from target',
      action: 'Immediate escalation to Operations',
      auditFreq: 'Daily'
    },
    {
      variable: 'Patient Satisfaction Score',
      frequency: 'Daily',
      owner: 'Quality Manager',
      threshold: '&lt;4.0/5.0',
      action: 'Review staffing levels',
      auditFreq: 'Weekly'
    },
    {
      variable: 'Staff Utilization Rate',
      frequency: 'Shift-based',
      owner: 'Operations Team',
      threshold: '&lt;75% or &gt;95%',
      action: 'Adjust scheduling',
      auditFreq: 'Weekly'
    },
    {
      variable: 'Equipment Downtime',
      frequency: 'Real-time',
      owner: 'Maintenance Lead',
      threshold: '&gt;15 min/day',
      action: 'Preventive maintenance review',
      auditFreq: 'Monthly'
    }
  ]);

  useEffect(() => {
    const loadControlData = async () => {
      if (!organizationId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data: metricsData, error: metricsError } = await supabase
          .from('metrics')
          .select('id, name, unit, target_value, current_value')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (metricsError) throw metricsError;

        const metrics = (metricsData || []) as MetricOption[];
        setAvailableMetrics(metrics);

        const fallbackMetricId = selectedMetricId || metrics[0]?.id || '';
        setSelectedMetricId(fallbackMetricId);

        const [
          metricDataResponse,
          alertsResponse,
          actionItemsResponse,
          forecastsResponse,
          auditLogResponse,
        ] = await Promise.all([
          fallbackMetricId
            ? supabase
                .from('metric_data')
                .select('value, timestamp')
                .eq('organization_id', organizationId)
                .eq('metric_id', fallbackMetricId)
                .order('timestamp', { ascending: true })
                .limit(60)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('alerts')
            .select('id, severity, message, title, created_at, acknowledged_at')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('action_items')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .in('status', ['pending', 'in_progress']),
          supabase
            .from('forecasts')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('status', 'completed'),
          supabase
            .from('audit_logs')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId),
        ]);

        if (metricDataResponse.error) throw metricDataResponse.error;
        if (alertsResponse.error) throw alertsResponse.error;

        const metricPoints = (metricDataResponse.data || [])
          .map((point: any) => ({
            value: Number(point.value),
            timestamp: point.timestamp as string,
          }))
          .filter((point) => Number.isFinite(point.value));

        const selectedMetric = metrics.find((metric) => metric.id === fallbackMetricId) || null;
        const values = metricPoints.map((point) => point.value);
        const currentValue = values[values.length - 1] ?? Number(selectedMetric?.current_value || 0);
        const baselineValue = values[0] ?? currentValue;
        const targetValue = Number(selectedMetric?.target_value || 0);
        const centerLine = values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : currentValue;
        const sigma = calculateStdDev(values);
        const ucl = centerLine + sigma * 3;
        const lcl = Math.max(0, centerLine - sigma * 3);
        const outOfControlCount = metricPoints.filter((point) => point.value > ucl || point.value < lcl).length;
        const improvementPct = baselineValue !== 0
          ? ((baselineValue - currentValue) / Math.abs(baselineValue)) * 100
          : 0;
        const sustainabilityPct = baselineValue !== targetValue
          ? Math.max(0, Math.min(100, ((baselineValue - currentValue) / (baselineValue - targetValue || 1)) * 100))
          : 0;
        const driftSigma = sigma > 0 ? Math.abs(currentValue - centerLine) / sigma : 0;
        const driftRisk = Math.max(0, Math.min(10, driftSigma * 2.5));
        const recentTrendWindow = values.slice(-7);
        const forecastSlope = recentTrendWindow.length > 1
          ? (recentTrendWindow[recentTrendWindow.length - 1] - recentTrendWindow[0]) / (recentTrendWindow.length - 1)
          : 0;
        const forecast7 = currentValue + forecastSlope * 7;
        const forecast14 = currentValue + forecastSlope * 14;
        const forecast21 = currentValue + forecastSlope * 21;
        const latestTimestamp = metricPoints[metricPoints.length - 1]?.timestamp ?? null;

        setSpcData(
          metricPoints.slice(-30).map((point, idx) => ({
            x: idx + 1,
            value: Number(point.value.toFixed(2)),
            ucl,
            lcl,
            centerLine,
            isOutOfControl: point.value > ucl || point.value < lcl,
            timestamp: point.timestamp,
          }))
        );

        setActiveAlerts(
          (alertsResponse.data || []).map((alert: any) => ({
            id: alert.id,
            severity: alert.severity === 'high' ? 'critical' : alert.severity === 'medium' ? 'moderate' : (alert.severity || 'low'),
            message: alert.title || alert.message || 'Alert triggered',
            timestamp: formatRelativeTime(alert.created_at),
            acknowledged: Boolean(alert.acknowledged_at),
            owner: 'Operations Team',
          }))
        );

        const stabilityStatus: KPICard['status'] =
          outOfControlCount === 0 ? 'stable' : outOfControlCount <= 2 ? 'warning' : 'critical';
        const driftStatus: KPICard['status'] =
          driftRisk < 3 ? 'stable' : driftRisk < 6 ? 'warning' : 'critical';
        const targetDelta = targetValue > 0 ? ((currentValue - targetValue) / targetValue) * 100 : 0;

        setKpiCards([
          {
            label: 'Current CTQ Value',
            value: formatMetricValue(currentValue, selectedMetric?.unit || ''),
            target: formatMetricValue(targetValue, selectedMetric?.unit || ''),
            baseline: formatMetricValue(baselineValue, selectedMetric?.unit || ''),
            improvement: `${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}%`,
            status: driftStatus,
            lastUpdate: formatRelativeTime(latestTimestamp),
            source: selectedMetric?.name || 'Metric Data',
          },
          {
            label: 'Target Value',
            value: formatMetricValue(targetValue, selectedMetric?.unit || ''),
            target: formatMetricValue(targetValue, selectedMetric?.unit || ''),
            baseline: formatMetricValue(baselineValue, selectedMetric?.unit || ''),
            improvement: `${targetDelta >= 0 ? '+' : ''}${targetDelta.toFixed(1)}% vs target`,
            status: targetDelta <= 0 ? 'stable' : 'warning',
            lastUpdate: 'Configured',
            source: 'Metrics',
          },
          {
            label: 'Baseline Value',
            value: formatMetricValue(baselineValue, selectedMetric?.unit || ''),
            target: formatMetricValue(targetValue, selectedMetric?.unit || ''),
            baseline: formatMetricValue(baselineValue, selectedMetric?.unit || ''),
            improvement: 'Historical reference',
            status: 'stable',
            lastUpdate: metricPoints[0]?.timestamp ? formatRelativeTime(metricPoints[0].timestamp) : 'Historical',
            source: 'Metric Data',
          },
          {
            label: 'Improvement Sustained',
            value: `${sustainabilityPct.toFixed(0)}%`,
            target: '100%',
            baseline: '0%',
            improvement: `${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}%`,
            status: sustainabilityPct >= 80 ? 'stable' : sustainabilityPct >= 50 ? 'warning' : 'critical',
            lastUpdate: 'Live',
            source: 'Control Engine',
          },
          {
            label: 'Process Stability',
            value: outOfControlCount === 0 ? 'Stable' : outOfControlCount <= 2 ? 'Watch' : 'Unstable',
            target: 'Stable',
            baseline: sigma > 0 ? `${sigma.toFixed(2)}σ spread` : 'No spread',
            improvement: `${outOfControlCount} rule breach${outOfControlCount === 1 ? '' : 'es'}`,
            status: stabilityStatus,
            lastUpdate: formatRelativeTime(latestTimestamp),
            source: 'SPC Engine',
          },
          {
            label: 'Drift Risk Score',
            value: `${driftRisk.toFixed(1)}/10`,
            target: '<3.0',
            baseline: sigma > 0 ? `${driftSigma.toFixed(1)}σ shift` : '0σ shift',
            improvement: forecastSlope <= 0 ? 'Trend improving' : 'Trend rising',
            status: driftStatus,
            lastUpdate: 'Live',
            source: 'Forecast Engine',
          },
        ]);

        setForecastState({
          sustainabilityPct,
          outOfControlCount,
          driftRisk,
          forecast7,
          forecast14,
          forecast21,
          currentValue,
          baselineValue,
          targetValue,
          sigma,
          forecastSlope,
          openActions: actionItemsResponse.count || 0,
          completedForecasts: forecastsResponse.count || 0,
          auditEvents: auditLogResponse.count || 0,
          metricName: selectedMetric?.name || 'Selected Metric',
          unit: selectedMetric?.unit || '',
        });
      } catch (loadError: any) {
        console.error('Error loading control page data:', loadError);
        setError(loadError?.message || 'Failed to load control data');
      } finally {
        setLoading(false);
      }
    };

    loadControlData();
  }, [organizationId, selectedMetricId]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'moderate': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'stable': return 'bg-emerald-500';
      case 'warning': return 'bg-amber-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const selectedMetric = availableMetrics.find((metric) => metric.id === selectedMetricId) || null;
  const recentValues = spcData.slice(-20).map((point) => point.value);
  const minRecentValue = recentValues.length > 0 ? Math.min(...recentValues) : 0;
  const maxRecentValue = recentValues.length > 0 ? Math.max(...recentValues) : 0;
  const sparklineHeights = recentValues.length > 0
    ? recentValues.map((value) => {
        if (maxRecentValue === minRecentValue) return 60;
        return 20 + ((value - minRecentValue) / (maxRecentValue - minRecentValue)) * 80;
      })
    : Array.from({ length: 20 }, () => 20);
  const daysToThreshold = forecastState.forecastSlope > 0 && forecastState.currentValue < forecastState.targetValue
    ? Math.max(
        1,
        Math.round((forecastState.targetValue - forecastState.currentValue) / forecastState.forecastSlope)
      )
    : null;
  const forecastRiskLabel = daysToThreshold && daysToThreshold <= 21
    ? `${daysToThreshold} days`
    : 'Stable trend';
  const processStatusLabel =
    forecastState.outOfControlCount === 0 ? 'Stable' :
    forecastState.outOfControlCount <= 2 ? 'Watch' : 'Escalate';
  const financialSavings = Math.max(0, (forecastState.baselineValue - forecastState.currentValue) * 365);
  const roiAchieved = forecastState.targetValue > 0
    ? Math.max(0, ((forecastState.baselineValue - forecastState.currentValue) / forecastState.targetValue) * 100)
    : 0;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full border-4 border-teal-100 border-t-teal-600 animate-spin"></div>
            <p className="text-sm font-medium text-slate-600">Loading live control metrics...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
          <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-md shadow-sm">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <i className="ri-error-warning-line text-red-500 text-2xl"></i>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Control data unavailable</h2>
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        
        {/* Page Header */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center">
                    <i className="ri-shield-check-line text-xl text-white"></i>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Control Phase</h1>
                    <p className="text-sm text-slate-600">
                      Continuous monitoring for {selectedMetric?.name || 'your monitored metric'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 bg-gradient-to-r from-teal-50 to-indigo-50 border border-teal-200/60 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-sm font-semibold text-slate-700">Continuous Intelligence Active</span>
                  </div>
                </div>
                
                <button
                  onClick={() => setShowAIPanel(!showAIPanel)}
                  className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:scale-105 transition-all duration-300 flex items-center gap-2"
                >
                  <i className="ri-sparkling-line"></i>
                  AI Insights
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-600">Metric</span>
              <select
                value={selectedMetricId}
                onChange={(e) => setSelectedMetricId(e.target.value)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[240px]"
              >
                {availableMetrics.map((metric) => (
                  <option key={metric.id} value={metric.id}>
                    {metric.name}
                  </option>
                ))}
              </select>
            </div>

            {/* DMAIC Stepper */}
            <div className="flex items-center gap-2">
              {['Define', 'Measure', 'Analyze', 'Improve', 'Control'].map((phase, idx) => (
                <div key={phase} className="flex items-center">
                  <div className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                    phase === 'Control'
                      ? 'bg-gradient-to-r from-teal-500 to-indigo-600 text-white shadow-lg'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {phase}
                  </div>
                  {idx < 4 && (
                    <i className="ri-arrow-right-s-line text-slate-400 mx-1"></i>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-8 py-8 space-y-8">
          
          {/* 1. Continuous Performance Overview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Live Performance Monitoring</h2>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <i className="ri-refresh-line"></i>
                <span>Auto-refresh: 30s</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {kpiCards.map((card, idx) => (
                <div
                  key={idx}
                  className="group bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-200/60 hover:shadow-xl hover:border-teal-300/60 transition-all duration-300"
                  style={{ animation: `fadeInUp 0.5s ease-out ${idx * 0.1}s both` }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(card.status)}`}></div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{card.label}</span>
                      </div>
                      <div className="text-3xl font-bold text-slate-900 mb-1">{card.value}</div>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Target:</span>
                      <span className="font-semibold text-slate-900">{card.target}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Baseline:</span>
                      <span className="font-semibold text-slate-900">{card.baseline}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Improvement:</span>
                      <span className="font-semibold text-emerald-600">{card.improvement}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="ri-database-2-line text-xs text-slate-400"></i>
                      <span className="text-xs text-slate-500">{card.source}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                      <span className="text-xs text-slate-500">{card.lastUpdate}</span>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div className="mt-4 h-12 flex items-end gap-1">
                    {sparklineHeights.map((height, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-teal-500/30 to-indigo-500/30 rounded-t"
                        style={{ height: `${height}%` }}
                      ></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Sustainability Gauge */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/60">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">Improvement Sustainability Gauge</h3>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold">
                  {forecastState.sustainabilityPct.toFixed(0)}% Sustained
                </span>
              </div>
              
              <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-500 to-indigo-600 rounded-full transition-all duration-1000"
                  style={{ width: `${forecastState.sustainabilityPct}%`, animation: 'progressBar 2s ease-out' }}
                ></div>
              </div>
              
              <div className="flex justify-between mt-2 text-sm text-slate-600">
                <span>Baseline</span>
                <span className="font-semibold text-slate-900">Current: {forecastState.sustainabilityPct.toFixed(0)}%</span>
                <span>Target: 95%</span>
              </div>
            </div>
          </div>

          {/* 2. Statistical Process Control Lab */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/60">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Statistical Process Control Lab</h2>
                <p className="text-sm text-slate-600">Real-time control chart monitoring with special cause detection</p>
              </div>
              
              <div className="flex items-center gap-3">
                <select
                  value={selectedChart}
                  onChange={(e) => setSelectedChart(e.target.value as any)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="i-mr">I-MR Chart</option>
                  <option value="xbar-r">X-bar / R Chart</option>
                  <option value="p-chart">P-Chart</option>
                  <option value="c-chart">C-Chart</option>
                  <option value="u-chart">U-Chart</option>
                </select>
                
                <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold text-slate-700 transition-colors">
                  <i className="ri-settings-3-line mr-2"></i>
                  Recalculate Limits
                </button>
              </div>
            </div>

            {/* Control Chart */}
            <div className="relative h-96 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl p-6 border border-slate-200/60">
              <svg className="w-full h-full">
                {/* Grid lines */}
                {Array.from({ length: 6 }).map((_, i) => (
                  <line
                    key={i}
                    x1="40"
                    y1={60 + i * 50}
                    x2="95%"
                    y2={60 + i * 50}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* UCL Line */}
                <line x1="40" y1="80" x2="95%" y2="80" stroke="#ef4444" strokeWidth="2" strokeDasharray="6 4" />
                <text x="10" y="85" fill="#ef4444" fontSize="12" fontWeight="600">UCL</text>

                {/* Center Line */}
                <line x1="40" y1="185" x2="95%" y2="185" stroke="#14b8a6" strokeWidth="2" />
                <text x="10" y="190" fill="#14b8a6" fontSize="12" fontWeight="600">CL</text>

                {/* LCL Line */}
                <line x1="40" y1="290" x2="95%" y2="290" stroke="#ef4444" strokeWidth="2" strokeDasharray="6 4" />
                <text x="10" y="295" fill="#ef4444" fontSize="12" fontWeight="600">LCL</text>

                {/* Data points */}
                {spcData.map((point, idx) => {
                  const x = 60 + (idx * 30);
                  const y = 310 - ((point.value - 25) / 35 * 250);
                  
                  return (
                    <g key={idx}>
                      {idx > 0 && (
                        <line
                          x1={60 + ((idx - 1) * 30)}
                          y1={310 - ((spcData[idx - 1].value - 25) / 35 * 250)}
                          x2={x}
                          y2={y}
                          stroke="#64748b"
                          strokeWidth="2"
                        />
                      )}
                      <circle
                        cx={x}
                        cy={y}
                        r={point.isOutOfControl ? "8" : "5"}
                        fill={point.isOutOfControl ? "#ef4444" : "#3b82f6"}
                        className={point.isOutOfControl ? "animate-pulse" : ""}
                      />
                      {point.isOutOfControl && (
                        <circle
                          cx={x}
                          cy={y}
                          r="12"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="2"
                          opacity="0.5"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* AI Insight Badge */}
              <div className="absolute top-4 right-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <i className="ri-alert-line text-amber-600 mt-0.5"></i>
                  <div>
                    <div className="text-xs font-semibold text-amber-900 mb-1">
                      {forecastState.outOfControlCount > 0 ? 'Special Cause Detected' : 'Process In Control'}
                    </div>
                    <div className="text-xs text-amber-700">
                      {forecastState.outOfControlCount > 0
                        ? `${forecastState.outOfControlCount} point(s) outside control limits`
                        : 'No current control-limit breaches in the latest sample window'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Western Electric Rules Status */}
            <div className="grid grid-cols-4 gap-4 mt-6">
              {[
                { rule: 'Rule 1', desc: 'Point beyond 3σ', status: 'violated', count: 2 },
                { rule: 'Rule 2', desc: '9 points same side', status: 'ok', count: 0 },
                { rule: 'Rule 3', desc: '6 points trending', status: 'warning', count: 1 },
                { rule: 'Rule 4', desc: '14 points alternating', status: 'ok', count: 0 }
              ].map((item, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-900">{item.rule}</span>
                    <div className={`w-2 h-2 rounded-full ${
                      item.status === 'violated' ? 'bg-red-500' :
                      item.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}></div>
                  </div>
                  <div className="text-xs text-slate-600 mb-2">{item.desc}</div>
                  <div className="text-lg font-bold text-slate-900">{item.count} violations</div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Drift Detection & Predictive Monitoring */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/60">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Drift Detection Engine</h3>
              
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">Statistical Drift Risk</span>
                    <span className="text-2xl font-bold text-amber-600">{forecastState.driftRisk.toFixed(1)}/10</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-red-500 rounded-full" style={{ width: `${forecastState.driftRisk * 10}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">Mean Shift Detection</span>
                    <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold">
                      {forecastState.sigma > 0 ? `${(Math.abs(forecastState.currentValue - (spcData[0]?.centerLine ?? forecastState.currentValue)) / forecastState.sigma).toFixed(1)}σ` : '0.0σ'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">
                    {forecastState.forecastSlope > 0 ? 'Rolling average is moving upward' : 'Rolling average is stable or improving'}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">Variance Increase Alert</span>
                    <span className="px-2 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-semibold">
                      {forecastState.sigma > 0 ? `${forecastState.sigma.toFixed(2)}σ` : 'Low variance'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">Current process spread based on the latest metric window</div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-amber-50 to-red-50 rounded-xl border border-amber-200">
                    <i className="ri-alarm-warning-line text-xl text-amber-600 mt-0.5"></i>
                    <div>
                      <div className="text-sm font-bold text-slate-900 mb-1">Early Warning Forecast</div>
                      <div className="text-sm text-slate-700">
                        Based on current trend, {forecastState.metricName} is expected to
                        {daysToThreshold ? <> cross the threshold within <span className="font-bold text-red-600">{daysToThreshold} days</span></> : ' remain within threshold'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/60">
              <h3 className="text-lg font-bold text-slate-900 mb-6">30-Day Forecast Projection</h3>
              
              <div className="relative h-64 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl p-4">
                <svg className="w-full h-full">
                  {/* Confidence bands */}
                  <path
                    d="M 40 180 Q 200 160, 360 140 L 360 200 Q 200 220, 40 240 Z"
                    fill="#3b82f6"
                    opacity="0.1"
                  />
                  
                  {/* Forecast line */}
                  <path
                    d="M 40 210 Q 200 190, 360 170"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray="6 4"
                  />
                  
                  {/* Threshold line */}
                  <line x1="40" y1="120" x2="360" y2="120" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 4" />
                  <text x="300" y="115" fill="#ef4444" fontSize="11" fontWeight="600">Threshold</text>
                  
                  {/* Current point */}
                  <circle cx="40" cy="210" r="6" fill="#14b8a6" />
                  <text x="10" y="215" fill="#14b8a6" fontSize="11" fontWeight="600">Now</text>
                </svg>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="text-center">
                  <div className="text-xs text-slate-600 mb-1">7-Day Forecast</div>
                  <div className="text-lg font-bold text-slate-900">{formatMetricValue(forecastState.forecast7, forecastState.unit)}</div>
                  <div className="text-xs text-emerald-600">{forecastState.forecast7 <= forecastState.targetValue ? 'Within limits' : 'Watch closely'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-600 mb-1">14-Day Forecast</div>
                  <div className="text-lg font-bold text-slate-900">{formatMetricValue(forecastState.forecast14, forecastState.unit)}</div>
                  <div className="text-xs text-amber-600">{forecastState.forecast14 <= forecastState.targetValue ? 'Within limits' : 'Approaching'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-600 mb-1">21-Day Forecast</div>
                  <div className="text-lg font-bold text-red-600">{formatMetricValue(forecastState.forecast21, forecastState.unit)}</div>
                  <div className="text-xs text-red-600">{forecastState.forecast21 <= forecastState.targetValue ? 'Within limits' : 'Exceeds limit'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Control Plan Manager */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/60">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Control Plan Manager</h2>
                <p className="text-sm text-slate-600">Governance framework for sustained performance</p>
              </div>
              
              <button className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:scale-105 transition-all duration-300">
                <i className="ri-add-line mr-2"></i>
                Add Control Variable
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-4 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Control Variable</th>
                    <th className="text-left py-4 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Frequency</th>
                    <th className="text-left py-4 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Owner</th>
                    <th className="text-left py-4 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Threshold</th>
                    <th className="text-left py-4 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Response Action</th>
                    <th className="text-left py-4 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Audit Freq</th>
                    <th className="text-center py-4 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {controlPlan.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-900">{item.variable}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-lg text-sm font-semibold">{item.frequency}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                            {item.owner.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="text-sm text-slate-700">{item.owner}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm text-slate-700">{item.threshold}</td>
                      <td className="py-4 px-4 text-sm text-slate-700">{item.action}</td>
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold">{item.auditFreq}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors">
                            <i className="ri-edit-line text-slate-600"></i>
                          </button>
                          <button className="w-8 h-8 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors">
                            <i className="ri-delete-bin-line text-red-600"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-6 bg-gradient-to-r from-indigo-50 to-teal-50 rounded-xl border border-indigo-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                  <i className="ri-flow-chart text-xl text-white"></i>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Escalation Workflow Builder</h4>
                  <p className="text-sm text-slate-700 mb-4">Configure automated escalation paths when thresholds are breached. Define notification chains, approval requirements, and corrective action triggers.</p>
                  <button className="px-4 py-2 bg-white border border-indigo-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-indigo-50 transition-colors">
                    Configure Workflows
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Sustainability Performance Tracker */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/60">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Sustainability Performance Tracker</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wide">Before vs After Comparison</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">Baseline (Before)</span>
                        <span className="text-lg font-bold text-slate-900">{formatMetricValue(forecastState.baselineValue, forecastState.unit)}</span>
                      </div>
                      <div className="h-3 bg-red-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: '100%' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">Current (After)</span>
                        <span className="text-lg font-bold text-emerald-600">{formatMetricValue(forecastState.currentValue, forecastState.unit)}</span>
                      </div>
                      <div className="h-3 bg-emerald-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: '62%' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">Target</span>
                        <span className="text-lg font-bold text-teal-600">{formatMetricValue(forecastState.targetValue, forecastState.unit)}</span>
                      </div>
                      <div className="h-3 bg-teal-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: '51%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-900">Variance Reduction</span>
                    <span className="text-2xl font-bold text-emerald-600">{kpiCards[0]?.improvement || '0.0%'}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wide">Financial Impact</h3>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                    <div className="text-xs text-slate-600 mb-1">Cost Savings Realized</div>
                    <div className="text-2xl font-bold text-emerald-600">${Math.round(financialSavings).toLocaleString()}</div>
                    <div className="text-xs text-emerald-700 mt-1">Modeled annual impact</div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-200">
                    <div className="text-xs text-slate-600 mb-1">ROI Achieved</div>
                    <div className="text-2xl font-bold text-indigo-600">{roiAchieved.toFixed(0)}%</div>
                    <div className="text-xs text-indigo-700 mt-1">Current modeled return</div>
                  </div>
                </div>

                <div className="p-6 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-slate-700">Stability Classification</span>
                    <span className="px-3 py-1 bg-emerald-500 text-white rounded-lg text-sm font-bold">{processStatusLabel}</span>
                  </div>
                  
                  <div className="space-y-2 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <i className="ri-checkbox-circle-fill text-emerald-500"></i>
                      <span>{forecastState.outOfControlCount === 0 ? 'Process within statistical control' : 'Control limit exceptions detected'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="ri-checkbox-circle-fill text-emerald-500"></i>
                      <span>Improvement sustained against baseline</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="ri-alert-fill text-amber-500"></i>
                      <span>{forecastState.driftRisk >= 6 ? 'Elevated drift detected - monitoring' : 'Drift remains manageable'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-gradient-to-r from-teal-500 to-indigo-600 rounded-xl text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs opacity-90 mb-1">Financial Impact Sustained</div>
                      <div className="text-2xl font-bold">${Math.round(financialSavings * 0.78).toLocaleString()}</div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <i className="ri-money-dollar-circle-line text-2xl"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 6. KPI Sync & Data Lineage */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/60">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">KPI Synchronization & Data Lineage</h2>
                <p className="text-sm text-slate-600">Cross-phase integration and audit trail</p>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold">
                  <i className="ri-link mr-1"></i>
                  {forecastState.completedForecasts} forecasts synced
                </span>
              </div>
            </div>

            {/* Data Lineage Flow */}
            <div className="relative p-8 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                {[
                  { phase: 'Define', value: formatMetricValue(forecastState.baselineValue, forecastState.unit), label: 'Baseline', icon: 'ri-flag-line', color: 'from-blue-500 to-indigo-600' },
                  { phase: 'Measure', value: `${forecastState.sigma.toFixed(2)}σ`, label: 'Variability', icon: 'ri-bar-chart-line', color: 'from-purple-500 to-pink-600' },
                  { phase: 'Analyze', value: 'R² = 0.84', label: 'Drivers', icon: 'ri-line-chart-line', color: 'from-amber-500 to-orange-600' },
                  { phase: 'Improve', value: formatMetricValue(forecastState.targetValue, forecastState.unit), label: 'Target', icon: 'ri-rocket-line', color: 'from-emerald-500 to-teal-600' },
                  { phase: 'Control', value: formatMetricValue(forecastState.currentValue, forecastState.unit), label: 'Current', icon: 'ri-shield-check-line', color: 'from-teal-500 to-indigo-600' }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center">
                    <div className="text-center">
                      <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-3 shadow-lg`}>
                        <i className={`${item.icon} text-2xl text-white`}></i>
                      </div>
                      <div className="text-sm font-bold text-slate-900 mb-1">{item.phase}</div>
                      <div className="text-lg font-bold text-slate-900 mb-1">{item.value}</div>
                      <div className="text-xs text-slate-600">{item.label}</div>
                    </div>
                    
                    {idx < 4 && (
                      <div className="mx-4">
                        <i className="ri-arrow-right-line text-2xl text-slate-400"></i>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Audit Trail */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <i className="ri-history-line text-indigo-600"></i>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">Model Version</div>
                    <div className="text-xs text-slate-600">v3.2.1 (Current)</div>
                  </div>
                </div>
                <button className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  View History
                </button>
              </div>

              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
                    <i className="ri-shield-check-line text-teal-600"></i>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">Compliance</div>
                    <div className="text-xs text-slate-600">ISO 9001 / HIPAA</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-semibold">ISO</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">HIPAA</span>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                    <i className="ri-file-list-3-line text-amber-600"></i>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">Audit Trail</div>
                    <div className="text-xs text-slate-600">{forecastState.auditEvents} events logged</div>
                  </div>
                </div>
                <button className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  Export Log
                </button>
              </div>
            </div>
          </div>

          {/* 7. Alert & Escalation Engine */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/60">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Alert & Escalation Engine</h2>
                <p className="text-sm text-slate-600">Real-time monitoring and incident management</p>
              </div>
              
              <div className="flex items-center gap-3">
                <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold text-slate-700 transition-colors">
                  <i className="ri-settings-3-line mr-2"></i>
                  Alert Settings
                </button>
                <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold text-slate-700 transition-colors">
                  <i className="ri-history-line mr-2"></i>
                  View History
                </button>
              </div>
            </div>

            {/* Active Alerts */}
            <div className="space-y-3 mb-6">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-5 rounded-xl border-2 ${getSeverityColor(alert.severity)} ${
                    alert.severity === 'critical' && !alert.acknowledged ? 'animate-pulse' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                          alert.severity === 'critical' ? 'bg-red-600 text-white' :
                          alert.severity === 'moderate' ? 'bg-amber-600 text-white' :
                          'bg-blue-600 text-white'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className="text-xs text-slate-500">{alert.timestamp}</span>
                        {alert.acknowledged && (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-semibold">
                            <i className="ri-checkbox-circle-line mr-1"></i>
                            Acknowledged
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm font-semibold text-slate-900 mb-2">{alert.message}</div>
                      
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <i className="ri-user-line"></i>
                        <span>Assigned to: <span className="font-semibold text-slate-900">{alert.owner}</span></span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      {!alert.acknowledged && (
                        <button
                          onClick={() => {
                            const updated = activeAlerts.map(a =>
                              a.id === alert.id ? { ...a, acknowledged: true } : a
                            );
                            setActiveAlerts(updated);
                          }}
                          className="px-4 py-2 bg-white border-2 border-current rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">
                        Resolve
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Alert Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                <div className="text-xs text-red-600 mb-1 font-semibold uppercase">Critical</div>
                <div className="text-3xl font-bold text-red-600">{activeAlerts.filter((alert) => alert.severity === 'critical').length}</div>
                <div className="text-xs text-red-700 mt-1">Requires immediate action</div>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="text-xs text-amber-600 mb-1 font-semibold uppercase">Moderate</div>
                <div className="text-3xl font-bold text-amber-600">{activeAlerts.filter((alert) => alert.severity === 'moderate').length}</div>
                <div className="text-xs text-amber-700 mt-1">Monitor closely</div>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="text-xs text-blue-600 mb-1 font-semibold uppercase">Low</div>
                <div className="text-3xl font-bold text-blue-600">{activeAlerts.filter((alert) => alert.severity === 'low').length}</div>
                <div className="text-xs text-blue-700 mt-1">Informational</div>
              </div>

              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="text-xs text-emerald-600 mb-1 font-semibold uppercase">Resolved (24h)</div>
                <div className="text-3xl font-bold text-emerald-600">{forecastState.completedForecasts}</div>
                <div className="text-xs text-emerald-700 mt-1">{forecastState.openActions} open actions tracked</div>
              </div>
            </div>
          </div>

          {/* Export & Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <button className="p-6 bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-slate-200 hover:border-teal-300 hover:shadow-lg transition-all duration-300 text-left group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i className="ri-file-pdf-line text-xl text-white"></i>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 mb-1">Export Control Report</div>
                  <div className="text-xs text-slate-600">Generate executive summary PDF</div>
                </div>
              </div>
            </button>

            <button className="p-6 bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-300 text-left group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i className="ri-notification-3-line text-xl text-white"></i>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 mb-1">Configure Notifications</div>
                  <div className="text-xs text-slate-600">Set up alert preferences</div>
                </div>
              </div>
            </button>

            <button className="p-6 bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-slate-200 hover:border-amber-300 hover:shadow-lg transition-all duration-300 text-left group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i className="ri-lock-line text-xl text-white"></i>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 mb-1">Lock Project Version</div>
                  <div className="text-xs text-slate-600">Finalize and archive</div>
                </div>
              </div>
            </button>
          </div>

        </div>

        {/* AI Insight Panel (Slide-in) */}
        <div
          className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl transform transition-transform duration-500 ease-out z-50 ${
            showAIPanel ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="h-full flex flex-col">
            {/* Panel Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-teal-50 to-indigo-50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center">
                    <i className="ri-sparkling-line text-xl text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Sigma AI</h3>
                    <p className="text-xs text-slate-600">Sustainability Insight Engine</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setShowAIPanel(false)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-lg transition-colors"
                >
                  <i className="ri-close-line text-xl text-slate-600"></i>
                </button>
              </div>

              <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-sm font-semibold text-slate-700">Analysis Complete</span>
              </div>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Stability Classification */}
              <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-slate-900">Stability Classification</span>
                  <span className="px-3 py-1 bg-emerald-500 text-white rounded-lg text-sm font-bold">{processStatusLabel}</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {forecastState.metricName} is showing <span className="font-bold">{processStatusLabel.toLowerCase()}</span> behavior with
                  {' '}a current drift score of {forecastState.driftRisk.toFixed(1)}/10 and {forecastState.outOfControlCount} recent control-limit breach(es).
                </p>
              </div>

              {/* Risk Forecast */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Risk Forecast</h4>
                <div className="space-y-3">
                  <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-red-900">High Risk</span>
                      <span className="text-xs text-red-700">{forecastRiskLabel}</span>
                    </div>
                    <p className="text-xs text-red-800">
                      {daysToThreshold
                        ? `${forecastState.metricName} may exceed target if the current slope continues`
                        : 'No immediate threshold breach predicted from the recent slope'}
                    </p>
                  </div>

                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-amber-900">Moderate Risk</span>
                      <span className="text-xs text-amber-700">14 days</span>
                    </div>
                    <p className="text-xs text-amber-800">Process spread is currently {forecastState.sigma.toFixed(2)}σ across the sampled window</p>
                  </div>
                </div>
              </div>

              {/* Top Drivers */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Key Performance Drivers</h4>
                <div className="space-y-3">
                  {[
                    { rank: 1, driver: 'Recent metric trend', impact: forecastState.forecastSlope > 0 ? 'High' : 'Low', value: `${forecastState.forecastSlope.toFixed(2)}/day` },
                    { rank: 2, driver: 'Process variation', impact: forecastState.sigma > 2 ? 'Moderate' : 'Low', value: `${forecastState.sigma.toFixed(2)}σ` },
                    { rank: 3, driver: 'Control-limit breaches', impact: forecastState.outOfControlCount > 0 ? 'High' : 'Low', value: `${forecastState.outOfControlCount}` }
                  ].map((item) => (
                    <div key={item.rank} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                          {item.rank}
                        </div>
                        <span className="text-sm font-bold text-slate-900">{item.driver}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">Impact: <span className="font-semibold">{item.impact}</span></span>
                        <span className="font-mono font-bold text-slate-900">{item.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Escalation Recommendation */}
              <div className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ri-alarm-warning-line text-indigo-600"></i>
                  <span className="text-sm font-bold text-slate-900">Escalation Recommendation</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed mb-3">
                  Immediate review recommended with Operations Team. Focus on {forecastState.metricName.toLowerCase()} if the drift score rises above 6 or new control-limit breaches appear.
                </p>
                <button className="w-full px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all">
                  Create Action Item
                </button>
              </div>

              {/* KPI Health Rating */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">KPI Health Rating</h4>
                <div className="space-y-3">
                  {[
                    { kpi: 'CTQ Performance', score: Math.max(0, Math.min(10, 10 - forecastState.driftRisk)), status: forecastState.driftRisk < 4 ? 'good' : 'warning' },
                    { kpi: 'Process Stability', score: Math.max(0, Math.min(10, 10 - forecastState.outOfControlCount * 2)), status: forecastState.outOfControlCount === 0 ? 'excellent' : 'warning' },
                    { kpi: 'Sustainability', score: Math.max(0, Math.min(10, forecastState.sustainabilityPct / 10)), status: forecastState.sustainabilityPct >= 80 ? 'excellent' : forecastState.sustainabilityPct >= 50 ? 'good' : 'warning' }
                  ].map((item, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-900">{item.kpi}</span>
                        <span className={`text-lg font-bold ${
                          item.status === 'excellent' ? 'text-emerald-600' :
                          item.status === 'good' ? 'text-teal-600' : 'text-amber-600'
                        }`}>{item.score}/10</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            item.status === 'excellent' ? 'bg-emerald-500' :
                            item.status === 'good' ? 'bg-teal-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${item.score * 10}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Executive Summary */}
              <div className="p-5 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-slate-200">
                <h4 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Executive Summary</h4>
                <p className="text-sm text-slate-700 leading-relaxed mb-4">
                  {forecastState.metricName} has achieved <span className="font-bold text-emerald-600">{kpiCards[0]?.improvement || '0.0%'}</span> from baseline, with
                  {' '}<span className="font-bold">${Math.round(financialSavings).toLocaleString()} annual modeled savings</span>. Process stability is currently classified as
                  {' '}<span className="font-bold">{processStatusLabel}</span>, with drift monitoring indicating {daysToThreshold ? `a possible threshold breach in ${daysToThreshold} days` : 'no immediate threshold breach'}.
                </p>
                <button className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  <i className="ri-download-line mr-2"></i>
                  Download Executive Report
                </button>
              </div>

              {/* Monitoring Frequency Adjustment */}
              <div className="p-5 bg-gradient-to-br from-teal-50 to-indigo-50 rounded-xl border border-teal-200">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ri-time-line text-teal-600"></i>
                  <span className="text-sm font-bold text-slate-900">Suggested Monitoring Adjustment</span>
                </div>
                <p className="text-sm text-slate-700 mb-3">
                  Based on drift risk analysis, recommend increasing monitoring frequency from <span className="font-bold">hourly</span> to
                  {' '}<span className="font-bold text-teal-600">{forecastState.driftRisk >= 6 ? 'every 30 minutes' : 'every 2 hours'}</span> for the next 14 days.
                </p>
                <button className="w-full px-4 py-2 bg-gradient-to-r from-teal-600 to-indigo-600 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all">
                  Apply Recommendation
                </button>
              </div>

              {/* Project Stabilized Indicator */}
              <div className="p-6 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl text-white text-center">
                <i className="ri-checkbox-circle-line text-4xl mb-3"></i>
                <div className="text-lg font-bold mb-1">Project Status</div>
                <div className="text-sm opacity-90">{forecastState.sustainabilityPct.toFixed(0)}% of target improvement sustained</div>
                <div className="text-xs opacity-75 mt-2">Target: 95% sustained improvement</div>
              </div>

            </div>
          </div>
        </div>

        {/* Overlay */}
        {showAIPanel && (
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setShowAIPanel(false)}
          ></div>
        )}

      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes progressBar {
          from {
            width: 0%;
          }
        }
      `}</style>
    </DashboardLayout>
  );
};

export default ControlPage;
