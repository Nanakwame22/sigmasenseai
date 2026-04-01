import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useToast } from '../../hooks/useToast';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { createAlertsFromAnomalies } from '../../services/anomalyAlertBridge';

interface Anomaly {
  id: string;
  metric_id: string | null;
  detection_method: string;
  anomaly_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detected_at: string;
  value: number;
  expected_value: number | null;
  deviation: number | null;
  confidence_score: number | null;
  status: 'new' | 'acknowledged' | 'resolved';
  resolution_notes: string | null;
  resolved_at: string | null;
  metadata: any;
  created_at: string;
  metric?: {
    name: string;
    unit: string;
  };
}

interface Metric {
  id: string;
  name: string;
  unit: string;
}

interface MetricDataPoint {
  timestamp: string;
  value: number;
  isAnomaly?: boolean;
}

export default function AnomalyDetectionPage() {
  const { user, organization } = useAuth();
  const { showToast } = useToast();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [detecting, setDetecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRunComplete, setAutoRunComplete] = useState<boolean>(false);
  const [newAnomaliesCount, setNewAnomaliesCount] = useState<number>(0);
  const [alertsCreatedCount, setAlertsCreatedCount] = useState<number>(0);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedMetric, setSelectedMetric] = useState<string>('all');

  // Chart data
  const [chartData, setChartData] = useState<MetricDataPoint[]>([]);
  const [selectedAnomalyForChart, setSelectedAnomalyForChart] = useState<string | null>(null);

  // Modals
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => {
    if (!user || !organization) {
      setError('Authentication required');
      setLoading(false);
      return;
    }
    fetchData();
  }, [user, organization]);

  useEffect(() => {
    if (!loading && !autoRunComplete && metrics.length > 0 && anomalies.length === 0) {
      checkAndAutoRunDetection();
    }
  }, [loading, metrics, anomalies, autoRunComplete]);

  async function checkAndAutoRunDetection() {
    if (!organization) return;
    try {
      let hasDataToAnalyze = false;
      for (const metric of metrics) {
        const { data: metricData, error: dataError } = await supabase
          .from('metric_data')
          .select('id')
          .eq('metric_id', metric.id)
          .limit(10);
        if (!dataError && metricData && metricData.length >= 10) {
          hasDataToAnalyze = true;
          break;
        }
      }
      if (hasDataToAnalyze) {
        await detectAnomalies(true);
      }
      setAutoRunComplete(true);
    } catch (err) {
      console.error('Error checking for auto-run:', err);
      setAutoRunComplete(true);
    }
  }

  async function fetchData() {
    try {
      setError(null);
      const { data: metricsData, error: metricsError } = await supabase
        .from('metrics')
        .select('id, name, unit')
        .eq('organization_id', organization!.id);
      if (metricsError) throw metricsError;
      setMetrics(metricsData || []);

      const { data: anomaliesData, error: anomaliesError } = await supabase
        .from('anomalies')
        .select('*, metric:metrics(name, unit)')
        .eq('organization_id', organization!.id)
        .order('detected_at', { ascending: false });
      if (anomaliesError) throw anomaliesError;
      setAnomalies(anomaliesData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }

  async function detectAnomalies(isAutoRun: boolean = false) {
    if (!organization) return;
    setDetecting(true);

    try {
      let detectedCount = 0;
      const newAnomalyIds: string[] = [];

      for (const metric of metrics) {
        const { data: metricData, error: dataError } = await supabase
          .from('metric_data')
          .select('timestamp, value')
          .eq('metric_id', metric.id)
          .order('timestamp', { ascending: true });

        if (dataError || !metricData || metricData.length < 3) continue;

        const values = metricData.map(d => d.value);
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        for (const dataPoint of metricData) {
          const zScore = Math.abs((dataPoint.value - mean) / stdDev);
          if (zScore > 3) {
            const { data: existing } = await supabase
              .from('anomalies')
              .select('id')
              .eq('metric_id', metric.id)
              .eq('detected_at', dataPoint.timestamp)
              .maybeSingle();

            if (!existing) {
              let severity: 'critical' | 'high' | 'medium' | 'low';
              if (zScore > 5) severity = 'critical';
              else if (zScore > 4) severity = 'high';
              else if (zScore > 3.5) severity = 'medium';
              else severity = 'low';

              const deviation = dataPoint.value - mean;
              const confidenceScore = Math.min(zScore / 5, 1);

              const { data: inserted, error: insertError } = await supabase
                .from('anomalies')
                .insert({
                  organization_id: organization.id,
                  metric_id: metric.id,
                  detection_method: 'z-score',
                  anomaly_type: deviation > 0 ? 'spike' : 'drop',
                  severity,
                  detected_at: dataPoint.timestamp,
                  value: dataPoint.value,
                  expected_value: mean,
                  deviation,
                  confidence_score: confidenceScore,
                  status: 'new',
                  metadata: { z_score: zScore, std_dev: stdDev, mean },
                })
                .select('id')
                .maybeSingle();

              if (!insertError && inserted?.id) {
                detectedCount++;
                newAnomalyIds.push(inserted.id);
              }
            }
          }
        }
      }

      // ── Auto-create alerts for every new anomaly ──
      if (newAnomalyIds.length > 0) {
        const alertResult = await createAlertsFromAnomalies(organization.id, newAnomalyIds);
        if (alertResult.created > 0) {
          setAlertsCreatedCount(alertResult.created);
        }
      }

      if (isAutoRun) {
        if (detectedCount > 0) {
          setNewAnomaliesCount(detectedCount);
          showToast(`Auto-detection complete: ${detectedCount} anomalies found, alerts created`, 'success');
        }
      } else {
        const alertMsg = newAnomalyIds.length > 0
          ? ` — ${newAnomalyIds.length} alert${newAnomalyIds.length > 1 ? 's' : ''} created`
          : '';
        showToast(`Detected ${detectedCount} new anomalies${alertMsg}`, 'success');
      }

      await fetchData();
    } catch (err) {
      console.error('Error detecting anomalies:', err);
      if (!isAutoRun) showToast('Failed to detect anomalies', 'error');
    } finally {
      setDetecting(false);
    }
  }

  async function acknowledgeAnomaly(anomalyId: string) {
    try {
      const { error } = await supabase
        .from('anomalies')
        .update({ status: 'acknowledged' })
        .eq('id', anomalyId);
      if (error) throw error;
      showToast('Anomaly acknowledged', 'success');
      await fetchData();
    } catch (err) {
      showToast('Failed to acknowledge anomaly', 'error');
    }
  }

  async function resolveAnomaly() {
    if (!selectedAnomaly) return;
    try {
      const { error } = await supabase
        .from('anomalies')
        .update({
          status: 'resolved',
          resolution_notes: resolutionNotes,
          resolved_at: new Date().toISOString(),
          resolved_by: user!.id,
        })
        .eq('id', selectedAnomaly.id);
      if (error) throw error;
      showToast('Anomaly resolved', 'success');
      setResolveModalOpen(false);
      setSelectedAnomaly(null);
      setResolutionNotes('');
      await fetchData();
    } catch (err) {
      showToast('Failed to resolve anomaly', 'error');
    }
  }

  async function loadChartData(metricId: string) {
    try {
      const { data: metricData, error } = await supabase
        .from('metric_data')
        .select('timestamp, value')
        .eq('metric_id', metricId)
        .order('timestamp', { ascending: true })
        .limit(100);
      if (error) throw error;
      const metricAnomalies = anomalies.filter(a => a.metric_id === metricId);
      const anomalyTimestamps = new Set(metricAnomalies.map(a => a.detected_at));
      const chartPoints: MetricDataPoint[] = (metricData || []).map(d => ({
        timestamp: new Date(d.timestamp).toLocaleDateString(),
        value: d.value,
        isAnomaly: anomalyTimestamps.has(d.timestamp),
      }));
      setChartData(chartPoints);
    } catch (err) {
      console.error('Error loading chart data:', err);
    }
  }

  const filteredAnomalies = anomalies.filter(anomaly => {
    if (severityFilter !== 'all' && anomaly.severity !== severityFilter) return false;
    if (statusFilter !== 'all' && anomaly.status !== statusFilter) return false;
    if (selectedMetric !== 'all' && anomaly.metric_id !== selectedMetric) return false;
    return true;
  });

  const stats = {
    total: anomalies.length,
    critical: anomalies.filter(a => a.severity === 'critical').length,
    new: anomalies.filter(a => a.status === 'new').length,
    resolved: anomalies.filter(a => a.status === 'resolved').length,
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-teal-600 bg-teal-50 border-teal-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return 'ri-error-warning-fill';
      case 'high': return 'ri-alert-fill';
      case 'medium': return 'ri-information-fill';
      case 'low': return 'ri-checkbox-circle-fill';
      default: return 'ri-checkbox-circle-line';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Anomaly Detection</h1>
            {newAnomaliesCount > 0 && (
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold animate-pulse">
                {newAnomaliesCount} New
              </span>
            )}
          </div>
          <button
            onClick={() => detectAnomalies(false)}
            disabled={detecting || metrics.length === 0}
            className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            {detecting ? (
              <><i className="ri-loader-4-line animate-spin"></i>Detecting...</>
            ) : (
              <><i className="ri-search-eye-line"></i>Run Detection</>
            )}
          </button>
        </div>
        <p className="text-sm text-gray-600">Identify unusual patterns and outliers in your metrics — alerts are auto-created for every new anomaly</p>
      </div>

      {/* Alerts Created Banner */}
      {alertsCreatedCount > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center">
              <i className="ri-alarm-warning-line text-teal-600 text-lg"></i>
            </div>
            <div>
              <p className="text-sm font-semibold text-teal-900">
                {alertsCreatedCount} alert{alertsCreatedCount > 1 ? 's' : ''} auto-created from detected anomalies
              </p>
              <p className="text-xs text-teal-700">Head to the Alerts page to review and act on them</p>
            </div>
          </div>
          <a
            href="/dashboard/alerts"
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <i className="ri-arrow-right-line"></i>
            View Alerts
          </a>
        </div>
      )}

      {/* Auto-Detection Banner */}
      {detecting && !autoRunComplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <i className="ri-loader-4-line text-amber-600 text-xl animate-spin"></i>
          <div>
            <p className="text-sm font-medium text-amber-900">Running automatic anomaly detection...</p>
            <p className="text-xs text-amber-700">Analyzing your metric data and creating alerts for any findings</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Anomalies</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <i className="ri-alert-line text-2xl text-gray-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-red-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 mb-1">Critical</p>
              <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
            </div>
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
              <i className="ri-error-warning-fill text-2xl text-red-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-amber-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-amber-600 mb-1">New</p>
              <p className="text-2xl font-bold text-amber-600">{stats.new}</p>
            </div>
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
              <i className="ri-notification-badge-line text-2xl text-amber-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-emerald-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-600 mb-1">Resolved</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.resolved}</p>
            </div>
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
              <i className="ri-checkbox-circle-fill text-2xl text-emerald-600"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-6 border border-red-100 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <i className="ri-alert-line text-white text-2xl"></i>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">What is Anomaly Detection?</h3>
            <p className="text-sm text-gray-700 mb-4">
              Anomaly detection automatically identifies unusual patterns, outliers, or unexpected events in your data. Every new anomaly automatically creates an alert so your team is notified immediately.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white/80 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                    <i className="ri-shield-check-line text-red-600"></i>
                  </div>
                  <h4 className="font-medium text-gray-900">Fraud Detection</h4>
                </div>
                <p className="text-xs text-gray-600">Catch suspicious transactions, unusual login patterns, or fraudulent activities before they cause damage</p>
              </div>
              <div className="bg-white/80 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <i className="ri-tools-line text-orange-600"></i>
                  </div>
                  <h4 className="font-medium text-gray-900">System Monitoring</h4>
                </div>
                <p className="text-xs text-gray-600">Detect server failures, performance issues, or unusual system behavior before users are affected</p>
              </div>
              <div className="bg-white/80 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <i className="ri-line-chart-line text-amber-600"></i>
                  </div>
                  <h4 className="font-medium text-gray-900">Business Insights</h4>
                </div>
                <p className="text-xs text-gray-600">Spot unexpected sales spikes, unusual customer behavior, or market changes that need attention</p>
              </div>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <h4 className="font-medium text-teal-900 mb-1 flex items-center gap-2">
                <i className="ri-alarm-warning-line"></i>
                Automatic Alert Creation
              </h4>
              <p className="text-xs text-gray-700">
                Every anomaly detected automatically generates a corresponding alert in the Alerts page — no manual steps needed. Alerts include the metric name, deviation %, confidence score, and recommended actions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Empty / Detection States */}
      {metrics.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-line-chart-line text-3xl text-gray-400"></i>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Metrics Available</h3>
          <p className="text-sm text-gray-600 mb-4">You need to create metrics with data points before running anomaly detection.</p>
          <a href="/dashboard/metrics" className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap">
            <i className="ri-add-line"></i>Create Your First Metric
          </a>
        </div>
      ) : anomalies.length === 0 && !detecting ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-search-eye-line text-3xl text-orange-600"></i>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Anomalies Detected Yet</h3>
          <p className="text-sm text-gray-600 mb-4">Run detection to analyze your metrics. Alerts will be created automatically for any findings.</p>
          <button
            onClick={() => detectAnomalies(false)}
            disabled={detecting}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 transition-colors whitespace-nowrap"
          >
            <i className="ri-search-eye-line"></i>Run Detection Now
          </button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <i className="ri-filter-3-line text-gray-600"></i>
                <span className="text-sm font-medium text-gray-700">Filters:</span>
              </div>
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
              </select>
              <select value={selectedMetric} onChange={e => setSelectedMetric(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="all">All Metrics</option>
                {metrics.map(metric => (
                  <option key={metric.id} value={metric.id}>{metric.name}</option>
                ))}
              </select>
              <div className="ml-auto text-sm text-gray-600">
                Showing {filteredAnomalies.length} of {anomalies.length} anomalies
              </div>
            </div>
          </div>

          {/* Chart Section */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 mb-6">
              <h3 className="text-lg font-semibold mb-4">Metric Values with Anomalies</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#0d9488"
                    strokeWidth={2}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (payload.isAnomaly) {
                        return <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="#fff" strokeWidth={2} />;
                      }
                      return <circle cx={cx} cy={cy} r={3} fill="#0d9488" />;
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
                  <span className="text-gray-600">Normal Values</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-gray-600">Anomalies</span>
                </div>
              </div>
            </div>
          )}

          {/* Anomalies Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deviation</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detected</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAnomalies.map(anomaly => (
                    <tr
                      key={anomaly.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => { if (anomaly.metric_id) { loadChartData(anomaly.metric_id); setSelectedAnomalyForChart(anomaly.id); } }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{anomaly.metric?.name || 'Unknown Metric'}</div>
                        <div className="text-xs text-gray-500">{anomaly.detection_method}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${getSeverityColor(anomaly.severity)}`}>
                          <i className={getSeverityIcon(anomaly.severity)}></i>
                          {anomaly.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 capitalize">{anomaly.anomaly_type}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-900">{anomaly.value.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">{anomaly.expected_value?.toFixed(2) || 'N/A'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${anomaly.deviation && anomaly.deviation > 0 ? 'text-red-600' : 'text-teal-600'}`}>
                          {anomaly.deviation ? `${anomaly.deviation > 0 ? '+' : ''}${anomaly.deviation.toFixed(2)}` : 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{new Date(anomaly.detected_at).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">{new Date(anomaly.detected_at).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          anomaly.status === 'new' ? 'bg-amber-100 text-amber-800' :
                          anomaly.status === 'acknowledged' ? 'bg-sky-100 text-sky-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {anomaly.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          {anomaly.status === 'new' && (
                            <button onClick={() => acknowledgeAnomaly(anomaly.id)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Acknowledge">
                              <i className="ri-check-line"></i>
                            </button>
                          )}
                          {anomaly.status !== 'resolved' && (
                            <button onClick={() => { setSelectedAnomaly(anomaly); setResolveModalOpen(true); }} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Resolve">
                              <i className="ri-checkbox-circle-line"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Resolve Modal */}
      {resolveModalOpen && selectedAnomaly && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Resolve Anomaly</h3>
              <button onClick={() => { setResolveModalOpen(false); setSelectedAnomaly(null); setResolutionNotes(''); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2"><strong>Metric:</strong> {selectedAnomaly.metric?.name}</p>
              <p className="text-sm text-gray-600 mb-2"><strong>Type:</strong> {selectedAnomaly.anomaly_type}</p>
              <p className="text-sm text-gray-600"><strong>Detected:</strong> {new Date(selectedAnomaly.detected_at).toLocaleString()}</p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Resolution Notes</label>
              <textarea
                value={resolutionNotes}
                onChange={e => setResolutionNotes(e.target.value)}
                placeholder="Describe how this anomaly was resolved..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={4}
                maxLength={500}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setResolveModalOpen(false); setSelectedAnomaly(null); setResolutionNotes(''); }} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                Cancel
              </button>
              <button onClick={resolveAnomaly} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap">
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}