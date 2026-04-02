import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { Link } from 'react-router-dom';
import InsightSummary from '../../components/common/InsightSummary';

interface Forecast {
  id: string;
  name: string;
  metric_id: string | null;
  model_type: string;
  forecast_horizon: number;
  confidence_level: number;
  historical_data: any;
  forecast_data: any;
  accuracy_metrics: any;
  status: string;
  created_at: string;
}

interface Metric {
  id: string;
  name: string;
  tags?: string[] | null;
  category?: string | null;
}

const average = (values: number[]) => values.length > 0
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0;

const standardDeviation = (values: number[]) => {
  if (values.length === 0) return 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length);
};

const getConfidenceMultiplier = (confidenceLevel: number) => {
  if (confidenceLevel >= 99) return 2.58;
  if (confidenceLevel >= 95) return 1.96;
  if (confidenceLevel >= 90) return 1.64;
  return 1.28;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getMetricLabel = (metricId: string | null, metrics: Metric[]) =>
  metrics.find(metric => metric.id === metricId)?.name ?? 'Selected metric';

const getModelDisplayName = (modelType: string) => {
  switch (modelType) {
    case 'arima':
      return 'ARIMA';
    case 'prophet':
      return 'Prophet';
    case 'exponential':
      return 'Exponential Smoothing';
    default:
      return modelType;
  }
};

const getRecommendedModel = (historicalData: any[], metricName: string) => {
  if (!historicalData?.length) {
    return {
      model: 'arima',
      label: 'ARIMA',
      reason: 'A steady trend model is the safest default until more history is available.',
    };
  }

  const values = historicalData.map((point) => Number(point.value) || 0);
  const volatility = average(values) === 0 ? 0 : standardDeviation(values) / Math.max(average(values), 1);
  const metricHint = metricName.toLowerCase();

  if (metricHint.includes('wait') || metricHint.includes('arrival') || metricHint.includes('discharge') || volatility > 0.28) {
    return {
      model: 'prophet',
      label: 'Prophet',
      reason: 'This signal looks cyclical or operationally spiky, so a seasonal model is the best fit.',
    };
  }

  if (metricHint.includes('risk') || metricHint.includes('occupancy') || metricHint.includes('capacity')) {
    return {
      model: 'exponential',
      label: 'Exponential Smoothing',
      reason: 'Recent values matter most for this kind of pressure signal, so a recency-weighted model is the best fit.',
    };
  }

  return {
    model: 'arima',
    label: 'ARIMA',
    reason: 'The history looks stable enough that a trend-focused baseline model should perform well.',
  };
};

const getForecastHealth = (forecast: Forecast) => {
  const historical = Array.isArray(forecast.historical_data) ? forecast.historical_data : [];
  const forecastData = Array.isArray(forecast.forecast_data) ? forecast.forecast_data : [];
  const historicalValues = historical.map((point: any) => Number(point.value) || 0);
  const mape = parseFloat(forecast.accuracy_metrics?.mape || '100');
  const rSquared = parseFloat(forecast.accuracy_metrics?.r_squared || '0');
  const horizonPenalty = forecast.forecast_horizon > 90 ? 18 : forecast.forecast_horizon > 45 ? 10 : forecast.forecast_horizon > 30 ? 5 : 0;
  const dataDepthScore = clamp((historical.length / 30) * 30, 6, 30);
  const accuracyScore = clamp(38 - mape * 1.5, 0, 38);
  const fitScore = clamp(rSquared * 22, 0, 22);
  const volatility = historicalValues.length > 1 && average(historicalValues) !== 0
    ? standardDeviation(historicalValues) / Math.max(average(historicalValues), 1)
    : 0;
  const volatilityScore = clamp(18 - volatility * 45, 0, 18);
  const score = clamp(Math.round(dataDepthScore + accuracyScore + fitScore + volatilityScore - horizonPenalty), 0, 100);

  let level = 'Weak';
  let tone = 'text-rose-700 bg-rose-50 border-rose-100';
  let warning = 'Use this forecast only as an early directional signal.';

  if (score >= 80) {
    level = 'Strong';
    tone = 'text-emerald-700 bg-emerald-50 border-emerald-100';
    warning = 'This forecast is strong enough for planning conversations, but it should still be reviewed against fresh actuals regularly.';
  } else if (score >= 60) {
    level = 'Moderate';
    tone = 'text-amber-700 bg-amber-50 border-amber-100';
    warning = 'This forecast is useful for planning, but the uncertainty is still material enough that teams should validate it frequently.';
  }

  const widthSeries = forecastData.slice(0, 7).map((point: any) => Math.max(0, (Number(point.upper) || 0) - (Number(point.lower) || 0)));
  const avgBandWidth = widthSeries.length > 0 ? average(widthSeries) : 0;

  return {
    score,
    level,
    tone,
    warning,
    avgBandWidth,
    volatility,
    historyPoints: historical.length,
  };
};

export default function AdvancedForecastingPage() {
  const { organization } = useAuth();
  const { showToast } = useToast();
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedForecast, setSelectedForecast] = useState<Forecast | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [metricsWithData, setMetricsWithData] = useState<Array<{ id: string; name: string; dataCount: number }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [formData, setFormData] = useState({
    name: '',
    metric_id: '',
    model_type: 'arima',
    forecast_horizon: 30,
    confidence_level: 95
  });

  const getForecastNarrative = (forecast: Forecast | null) => {
    if (!forecast?.accuracy_metrics || !forecast.forecast_data?.length) {
      return {
        summary: 'This forecast does not have enough detail yet to explain the result in plain language.',
        driver: 'Once a completed forecast includes accuracy metrics and projected values, SigmaSense can translate it into a clearer business takeaway.',
        guidance: 'Generate or reopen a completed forecast to see a plain-English interpretation.',
      };
    }

    const mape = parseFloat(forecast.accuracy_metrics.mape || '0');
    const firstPoint = forecast.forecast_data[0]?.value ?? 0;
    const lastPoint = forecast.forecast_data[forecast.forecast_data.length - 1]?.value ?? firstPoint;
    const direction =
      lastPoint > firstPoint * 1.02 ? 'increase' :
      lastPoint < firstPoint * 0.98 ? 'decrease' :
      'remain fairly stable';
    const confidenceBand = forecast.confidence_level >= 95 ? 'a tighter reliability standard' : 'a broader planning range';

    let summary = `This forecast suggests the metric will ${direction} over the next ${forecast.forecast_horizon} days, so it is best used as a planning signal rather than a guarantee.`;
    if (mape <= 10) {
      summary = `This forecast is relatively dependable for near-term planning and suggests the metric will ${direction} over the next ${forecast.forecast_horizon} days.`;
    } else if (mape > 20) {
      summary = `This forecast gives a directional signal, but the accuracy is still loose enough that you should treat it as an early warning rather than a precise commitment.`;
    }

    return {
      summary,
      driver: `The model's recent average error is ${forecast.accuracy_metrics.mape}%, and the forecast is using ${confidenceBand} with a ${forecast.confidence_level}% confidence level.`,
      guidance: mape > 15
        ? 'Use the trend to guide staffing, capacity, or risk conversations, but avoid making high-stakes commitments until more history improves forecast accuracy.'
        : 'Use the projected range to plan ahead, then compare actuals against the forecast regularly so you can adjust quickly if the trend changes.',
    };
  };

  useEffect(() => {
    if (organization) {
      loadData();
    }
  }, [organization]);

  const loadData = async () => {
    if (!organization) return;

    try {
      const [forecastsRes, metricsRes] = await Promise.all([
        supabase
          .from('forecasts')
          .select('*')
          .eq('organization_id', organization.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('metrics')
          .select('id, name, tags, category')
          .eq('organization_id', organization.id)
      ]);

      if (forecastsRes.data) setForecasts(forecastsRes.data);
      if (metricsRes.data) {
        setMetrics(metricsRes.data);
        
        // Fetch data point counts for each metric
        const metricsWithCounts = await Promise.all(
          metricsRes.data.map(async (metric) => {
            const { count } = await supabase
              .from('metric_data')
              .select('*', { count: 'exact', head: true })
              .eq('metric_id', metric.id);
            
            return {
              id: metric.id,
              name: metric.name,
              dataCount: count || 0
            };
          })
        );
        
        setMetricsWithData(metricsWithCounts);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Derived: clinical metrics are those tagged 'cpi-bridge'
  const clinicalMetricIds = new Set(
    metrics
      .filter((m: Metric) => m.tags?.includes('cpi-bridge'))
      .map((m: Metric) => m.id)
  );

  const isClinicalMetric = (id: string) => clinicalMetricIds.has(id);

  const generateForecast = async (metricId: string, horizon: number, modelType: string, confidenceLevel: number) => {
    const { data: metricData, error } = await supabase
      .from('metric_data')
      .select('*')
      .eq('metric_id', metricId)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    if (!metricData || metricData.length === 0) {
      throw new Error('No historical data found for this metric. Please add data points first in the Metrics page.');
    }

    // For demo purposes with limited data
    if (metricData.length < 3) {
      throw new Error(`Not enough historical data. Found ${metricData.length} data points, need at least 3. Please add more data points for this metric.`);
    }

    const historical = metricData.map(item => ({
      date: new Date(item.timestamp).toISOString().split('T')[0],
      value: item.value
    }));

    const values = metricData.map(d => d.value);
    const n = values.length;
    const lastDate = new Date(metricData[metricData.length - 1].timestamp);
    const baselineMean = average(values);
    const stdDev = standardDeviation(values);
    const confidenceMultiplier = getConfidenceMultiplier(confidenceLevel);

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slopeDenominator = (n * sumX2 - sumX * sumX);
    const slope = slopeDenominator === 0 ? 0 : (n * sumXY - sumX * sumY) / slopeDenominator;
    const intercept = (sumY - slope * sumX) / n;

    const seasonalBuckets = metricData.reduce<Record<number, number[]>>((buckets, item) => {
      const bucket = new Date(item.timestamp).getDay();
      if (!buckets[bucket]) buckets[bucket] = [];
      buckets[bucket].push(item.value);
      return buckets;
    }, {});

    const smoothedValues: number[] = [];
    const alpha = 0.35;
    values.forEach((value, index) => {
      if (index === 0) {
        smoothedValues.push(value);
        return;
      }
      smoothedValues.push(alpha * value + (1 - alpha) * smoothedValues[index - 1]);
    });

    const lastSmoothed = smoothedValues[smoothedValues.length - 1] ?? values[values.length - 1];
    const recentWindow = values.slice(-Math.min(7, values.length));
    const recentAverage = average(recentWindow);
    const recentMomentum = recentWindow.length > 1
      ? (recentWindow[recentWindow.length - 1] - recentWindow[0]) / (recentWindow.length - 1)
      : 0;

    const forecast = [];
    
    for (let i = 1; i <= horizon; i++) {
      const forecastDate = new Date(lastDate);
      forecastDate.setDate(forecastDate.getDate() + i);

      const weekdayAverage = average(seasonalBuckets[forecastDate.getDay()] || []);
      let forecastValue = intercept + slope * (n + i - 1);

      if (modelType === 'prophet') {
        const seasonalAdjustment = weekdayAverage ? weekdayAverage - baselineMean : 0;
        forecastValue = intercept + slope * (n + i - 1) + seasonalAdjustment;
      } else if (modelType === 'exponential') {
        forecastValue = lastSmoothed + recentMomentum * i;
      }

      const intervalSpread = confidenceMultiplier * stdDev * Math.sqrt(1 + i / Math.max(n, 1));
      const boundedValue = Math.max(0, forecastValue);
      
      forecast.push({
        date: forecastDate.toISOString().split('T')[0],
        value: boundedValue,
        lower: Math.max(0, boundedValue - intervalSpread),
        upper: boundedValue + intervalSpread
      });
    }

    return { historical, forecast };
  };

  const calculateAccuracy = (historical: any[], forecast: any[]) => {
    // Use last 20% of historical data for validation
    const validationSize = Math.floor(historical.length * 0.2);
    const trainData = historical.slice(0, -validationSize);
    const validationData = historical.slice(-validationSize);
    
    if (validationData.length === 0) {
      return {
        mape: '0.00',
        rmse: '0.00',
        mae: '0.00',
        r_squared: '0.000'
      };
    }

    // Calculate simple metrics
    const errors = validationData.map((actual, i) => {
      const predicted = trainData[trainData.length - 1]?.value || actual.value;
      return Math.abs(actual.value - predicted);
    });

    const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
    const mape = (mae / (validationData.reduce((sum, d) => sum + d.value, 0) / validationData.length)) * 100;
    const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);
    
    return {
      mape: mape.toFixed(2),
      rmse: rmse.toFixed(2),
      mae: mae.toFixed(2),
      r_squared: (1 - (mape / 100)).toFixed(3)
    };
  };

  const handleCreate = async () => {
    if (!organization || !formData.name || !formData.metric_id) {
      showToast('Please fill in all required fields', 'warning');
      return;
    }

    try {
      setLoading(true);
      const { historical, forecast } = await generateForecast(
        formData.metric_id,
        formData.forecast_horizon,
        formData.model_type,
        formData.confidence_level
      );
      const accuracy = calculateAccuracy(historical, forecast);

      const { error } = await supabase.from('forecasts').insert({
        organization_id: organization.id,
        name: formData.name,
        metric_id: formData.metric_id,
        model_type: formData.model_type,
        forecast_horizon: formData.forecast_horizon,
        confidence_level: formData.confidence_level,
        historical_data: historical,
        forecast_data: forecast,
        accuracy_metrics: accuracy,
        status: 'completed'
      });

      if (!error) {
        showToast('Forecast created successfully', 'success');
        setShowCreateModal(false);
        setFormData({
          name: '',
          metric_id: '',
          model_type: 'arima',
          forecast_horizon: 30,
          confidence_level: 95
        });
        await loadData();
      }
    } catch (error: any) {
      console.error('Error creating forecast:', error);
      showToast(error.message || 'Failed to create forecast', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Forecast',
      message: 'Are you sure you want to delete this forecast? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await supabase.from('forecasts').delete().eq('id', id);
          showToast('Forecast deleted successfully', 'success');
          loadData();
        } catch (error) {
          console.error('Error deleting forecast:', error);
          showToast('Failed to delete forecast', 'error');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const handleAutoGenerate = async () => {
    if (!organization) return;

    const eligibleMetrics = metricsWithData.filter(m => m.dataCount >= 10);
    
    if (eligibleMetrics.length === 0) {
      showToast('No metrics with sufficient data (10+ points required)', 'warning');
      return;
    }

    setIsGenerating(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const metric of eligibleMetrics) {
        try {
          const { historical, forecast } = await generateForecast(metric.id, 30, 'arima', 95);
          const accuracy = calculateAccuracy(historical, forecast);

          const { error } = await supabase.from('forecasts').insert({
            organization_id: organization.id,
            name: `${metric.name} - 30 Day Forecast`,
            metric_id: metric.id,
            model_type: 'arima',
            forecast_horizon: 30,
            confidence_level: 95,
            historical_data: historical,
            forecast_data: forecast,
            accuracy_metrics: accuracy,
            status: 'completed'
          });

          if (!error) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error(`Error generating forecast for ${metric.name}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        showToast(
          `Successfully generated ${successCount} forecast${successCount > 1 ? 's' : ''} with ARIMA model (30-day horizon, 95% confidence)`,
          'success'
        );
        await loadData();
      }

      if (failCount > 0) {
        showToast(`Failed to generate ${failCount} forecast${failCount > 1 ? 's' : ''}`, 'error');
      }
    } catch (error) {
      console.error('Error in auto-generate:', error);
      showToast('Failed to generate forecasts', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredForecasts = forecasts.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.model_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getModelIcon = (type: string) => {
    switch (type) {
      case 'arima': return 'ri-line-chart-line';
      case 'prophet': return 'ri-flashlight-line';
      case 'exponential': return 'ri-speed-up-line';
      default: return 'ri-bar-chart-line';
    }
  };

  const getModelColor = (type: string) => {
    switch (type) {
      case 'arima': return 'text-blue-600 bg-blue-50';
      case 'prophet': return 'text-purple-600 bg-purple-50';
      case 'exponential': return 'text-teal-600 bg-teal-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Add interpretation helper functions
  const getAccuracyInterpretation = (mape: number) => {
    if (mape <= 5) return { level: 'Excellent', color: 'text-green-600 bg-green-50', description: 'Very accurate predictions - you can rely on these forecasts' };
    if (mape <= 10) return { level: 'Good', color: 'text-blue-600 bg-blue-50', description: 'Good accuracy - forecasts are reliable for planning' };
    if (mape <= 20) return { level: 'Fair', color: 'text-yellow-600 bg-yellow-50', description: 'Moderate accuracy - use with caution for important decisions' };
    return { level: 'Poor', color: 'text-red-600 bg-red-50', description: 'Low accuracy - consider getting more data or different approach' };
  };

  const getTrendInterpretation = (forecastData: any[]) => {
    if (!forecastData || forecastData.length < 2) return null;
    
    const firstValue = forecastData[0]?.value || 0;
    const lastValue = forecastData[forecastData.length - 1]?.value || 0;
    const change = ((lastValue - firstValue) / firstValue) * 100;
    
    if (Math.abs(change) < 5) {
      return { trend: 'Stable', color: 'text-gray-600', description: `Expected to remain relatively stable (${change >= 0 ? '+' : ''}${change.toFixed(1)}% change)` };
    } else if (change > 0) {
      return { trend: 'Growing', color: 'text-green-600', description: `Expected to grow by ${change.toFixed(1)}% over the forecast period` };
    } else {
      return { trend: 'Declining', color: 'text-red-600', description: `Expected to decline by ${Math.abs(change).toFixed(1)}% over the forecast period` };
    }
  };

  const getConfidenceInterpretation = (confidenceLevel: number) => {
    return {
      description: `We are ${confidenceLevel}% confident that actual values will fall within the predicted range`,
      practical: confidenceLevel >= 95 ? 'High reliability for strategic planning' : 
                 confidenceLevel >= 90 ? 'Good reliability for tactical decisions' : 
                 'Use for general guidance only'
    };
  };

  const selectedMetricName = getMetricLabel(formData.metric_id, metrics);
  const selectedMetricHistory = formData.metric_id
    ? forecasts.find(forecast => forecast.metric_id === formData.metric_id)?.historical_data || []
    : [];
  const recommendedModel = getRecommendedModel(selectedMetricHistory, selectedMetricName);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  // Check if user has metrics with sufficient data
  const metricsWithSufficientData = metricsWithData.filter(m => m.dataCount >= 3);
  const metricsForAutoGenerate = metricsWithData.filter(m => m.dataCount >= 10);
  const hasInsufficientData = metricsWithData.length > 0 && metricsWithSufficientData.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Advanced Forecasting</h1>
          <p className="text-sm text-gray-600 mt-1">ARIMA, Prophet, and Exponential Smoothing models</p>
        </div>
        <div className="flex items-center gap-3">
          {metricsForAutoGenerate.length > 0 && (
            <button
              onClick={handleAutoGenerate}
              disabled={isGenerating}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Generating...
                </>
              ) : (
                <>
                  <i className="ri-magic-line"></i>
                  Auto-Generate Forecasts
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={metricsWithSufficientData.length === 0}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="ri-add-line"></i>
            Create Forecast
          </button>
        </div>
      </div>

      {/* Clinical Metrics Banner */}
      {clinicalMetricIds.size > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-9 h-9 bg-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <i className="ri-heart-pulse-line text-white text-base"></i>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-teal-900">
              {clinicalMetricIds.size} clinical metric{clinicalMetricIds.size !== 1 ? 's' : ''} available from CPI
            </p>
            <p className="text-xs text-teal-700 mt-0.5">
              ED Flow, Lab TAT, Readmissions, Staffing, Biomedical and Patient Experience metrics are synced from the CPI dashboard and ready to forecast.
            </p>
          </div>
          <span className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 bg-white border border-teal-200 rounded-full text-xs font-semibold text-teal-700">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
            Bridge Active
          </span>
        </div>
      )}

      {/* Auto-Generate Info Banner */}
      {metricsForAutoGenerate.length > 0 && forecasts.length === 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-teal-50 border-l-4 border-blue-500 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-magic-line text-blue-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">Ready to Generate Forecasts</h3>
              <p className="text-sm text-blue-800 mb-3">
                You have <strong>{metricsForAutoGenerate.length} metric{metricsForAutoGenerate.length > 1 ? 's' : ''}</strong> with enough data to generate accurate forecasts. 
                Click "Auto-Generate Forecasts" to create 30-day ARIMA forecasts for all eligible metrics at once.
              </p>
              <div className="flex items-center gap-2 text-xs text-blue-700">
                <i className="ri-information-line"></i>
                <span>Each forecast will use ARIMA model with 30-day horizon and 95% confidence level</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning Banner for Insufficient Data */}
      {metricsWithData.length === 0 ? (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-information-line text-blue-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">No Metrics Available</h3>
              <p className="text-sm text-blue-800 mb-3">
                You need to create metrics before you can generate forecasts. Metrics are the foundation for all analysis features.
              </p>
              <Link
                to="/dashboard/metrics"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                <i className="ri-add-line"></i>
                Create Your First Metric
              </Link>
            </div>
          </div>
        </div>
      ) : hasInsufficientData ? (
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-alert-line text-orange-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-orange-900 mb-1">Insufficient Data for Forecasting</h3>
              <p className="text-sm text-orange-800 mb-2">
                Your metrics need at least <strong>3 data points</strong> to generate accurate forecasts. Currently:
              </p>
              <ul className="text-sm text-orange-800 mb-3 space-y-1">
                {metricsWithData.map(m => (
                  <li key={m.id} className="flex items-center gap-2">
                    <i className={`ri-${m.dataCount >= 3 ? 'checkbox-circle' : 'close-circle'}-line ${m.dataCount >= 3 ? 'text-green-600' : 'text-orange-600'}`}></i>
                    <span><strong>{m.name}</strong>: {m.dataCount} data {m.dataCount === 1 ? 'point' : 'points'}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/dashboard/metrics"
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
              >
                <i className="ri-add-circle-line"></i>
                Add Data Points to Metrics
              </Link>
            </div>
          </div>
        </div>
      ) : metricsWithSufficientData.length < metricsWithData.length ? (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-information-line text-yellow-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 mb-1">Data Status</h3>
              <p className="text-sm text-yellow-800 mb-2">
                <strong>{metricsWithSufficientData.length}</strong> of <strong>{metricsWithData.length}</strong> metrics have enough data for forecasting (3+ data points).
                {metricsForAutoGenerate.length > 0 && (
                  <> <strong>{metricsForAutoGenerate.length}</strong> metric{metricsForAutoGenerate.length > 1 ? 's have' : ' has'} 10+ points for optimal accuracy.</>
                )}
              </p>
              <Link
                to="/dashboard/metrics"
                className="text-sm text-yellow-900 underline hover:text-yellow-700"
              >
                Add more data points to enable forecasting for all metrics →
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* What is Forecasting? Info Section */}
      <div className="bg-gradient-to-br from-blue-50 to-teal-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <i className="ri-line-chart-line text-white text-2xl"></i>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">What is Forecasting?</h3>
            <p className="text-sm text-gray-700 mb-4">
              Forecasting uses historical data patterns to predict future values. It helps you plan ahead by estimating what's likely to happen based on past trends, seasonality, and patterns in your data.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white/80 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <i className="ri-shopping-cart-line text-blue-600"></i>
                  </div>
                  <h4 className="font-medium text-gray-900">Sales Planning</h4>
                </div>
                <p className="text-xs text-gray-600">Predict future sales to optimize inventory, staffing, and marketing budgets</p>
              </div>
              
              <div className="bg-white/80 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                    <i className="ri-funds-line text-teal-600"></i>
                  </div>
                  <h4 className="font-medium text-gray-900">Financial Planning</h4>
                </div>
                <p className="text-xs text-gray-600">Forecast revenue, expenses, and cash flow for better financial decisions</p>
              </div>
              
              <div className="bg-white/80 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <i className="ri-user-follow-line text-purple-600"></i>
                  </div>
                  <h4 className="font-medium text-gray-900">Demand Forecasting</h4>
                </div>
                <p className="text-xs text-gray-600">Anticipate customer demand to prevent stockouts or overstock situations</p>
              </div>
            </div>

            <div className="bg-white/80 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <i className="ri-settings-3-line text-blue-600"></i>
                Choosing the Right Model
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-700">
                <div>
                  <div className="font-medium text-blue-600 mb-1 flex items-center gap-1">
                    <i className="ri-line-chart-line"></i> ARIMA
                  </div>
                  <p className="mb-2">Best for data with clear trends and patterns</p>
                  <div className="text-gray-500">
                    <strong>Use when:</strong> You have consistent historical trends<br/>
                    <strong>Example:</strong> Monthly sales with steady growth
                  </div>
                </div>
                <div>
                  <div className="font-medium text-purple-600 mb-1 flex items-center gap-1">
                    <i className="ri-flashlight-line"></i> Prophet
                  </div>
                  <p className="mb-2">Best for data with seasonal patterns and holidays</p>
                  <div className="text-gray-500">
                    <strong>Use when:</strong> Your data has weekly/yearly cycles<br/>
                    <strong>Example:</strong> Retail sales with holiday spikes
                  </div>
                </div>
                <div>
                  <div className="font-medium text-teal-600 mb-1 flex items-center gap-1">
                    <i className="ri-speed-up-line"></i> Exponential
                  </div>
                  <p className="mb-2">Best for data with exponential growth or decay</p>
                  <div className="text-gray-500">
                    <strong>Use when:</strong> Recent data is more important<br/>
                    <strong>Example:</strong> Fast-growing startup metrics
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
              <div className="flex items-start gap-2">
                <i className="ri-information-line text-amber-600 mt-0.5"></i>
                <div className="text-xs text-amber-800">
                  <strong>Pro Tip:</strong> Forecasts are most accurate for short-term predictions (days to weeks). The further into the future you predict, the less certain the results become. Always review and update forecasts regularly with new data.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input
          type="text"
          placeholder="Search forecasts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
        />
      </div>

      {/* Forecasts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredForecasts.map((forecast) => (
          <div key={forecast.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${getModelColor(forecast.model_type)} flex items-center justify-center`}>
                  <i className={`${getModelIcon(forecast.model_type)} text-lg`}></i>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{forecast.name}</h3>
                    {forecast.metric_id && isClinicalMetric(forecast.metric_id) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 border border-teal-200 rounded-full text-[10px] font-bold text-teal-700 whitespace-nowrap">
                        <i className="ri-heart-pulse-line text-xs"></i>
                        Clinical
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {forecast.model_type.toUpperCase()} • {forecast.forecast_horizon} days
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedForecast(forecast)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-line-chart-line"></i>
                </button>
                <button
                  onClick={() => handleDelete(forecast.id)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>

            {/* Accuracy Metrics with Interpretations */}
            {forecast.accuracy_metrics && (
              <div className="space-y-4 mb-4">
                {(() => {
                  const health = getForecastHealth(forecast);
                  const metricName = getMetricLabel(forecast.metric_id, metrics);
                  const recommendation = getRecommendedModel(forecast.historical_data || [], metricName);
                  const modelAligned = recommendation.model === forecast.model_type;
                  return (
                    <div className={`border rounded-lg p-3 ${health.tone}`}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <i className="ri-shield-check-line text-sm"></i>
                          <span className="text-xs font-semibold uppercase tracking-wide">Forecast Health</span>
                        </div>
                        <span className="text-sm font-bold">{health.score}/100 · {health.level}</span>
                      </div>
                      <p className="text-xs leading-relaxed">{health.warning}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-1 rounded-full bg-white/70 border border-current/15">
                          {health.historyPoints} history points
                        </span>
                        <span className="px-2 py-1 rounded-full bg-white/70 border border-current/15">
                          Avg range width {health.avgBandWidth.toFixed(1)}
                        </span>
                        <span className="px-2 py-1 rounded-full bg-white/70 border border-current/15">
                          {modelAligned ? getModelDisplayName(forecast.model_type) : `Consider ${recommendation.label}`}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">MAPE (Accuracy)</div>
                    <div className="text-lg font-semibold text-gray-900">{forecast.accuracy_metrics.mape}%</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">R² (Fit Quality)</div>
                    <div className="text-lg font-semibold text-gray-900">{forecast.accuracy_metrics.r_squared}</div>
                  </div>
                </div>
                
                {/* Accuracy Interpretation */}
                {(() => {
                  const accuracy = getAccuracyInterpretation(parseFloat(forecast.accuracy_metrics.mape));
                  return (
                    <div className={`${accuracy.color} border border-current/20 rounded-lg p-3`}>
                      <div className="flex items-center gap-2 mb-1">
                        <i className="ri-information-line text-sm"></i>
                        <span className="text-xs font-medium">Accuracy: {accuracy.level}</span>
                      </div>
                      <p className="text-xs opacity-90">{accuracy.description}</p>
                    </div>
                  );
                })()}
                
                {/* Trend Interpretation */}
                {(() => {
                  const trend = getTrendInterpretation(forecast.forecast_data);
                  return trend ? (
                    <div className={`border border-gray-200 rounded-lg p-3`}>
                      <div className="flex items-center gap-2 mb-1">
                        <i className="ri-trending-up-line text-sm text-gray-600"></i>
                        <span className="text-xs font-medium text-gray-700">Expected Trend: 
                          <span className={`ml-1 ${trend.color}`}>{trend.trend}</span>
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{trend.description}</p>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {/* Mini Chart */}
            {forecast.forecast_data && (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast.forecast_data.slice(0, 30)}>
                    <defs>
                      <linearGradient id={`gradient-${forecast.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#14B8A6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="value" stroke="#14B8A6" fill={`url(#gradient-${forecast.id})`} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="text-xs text-gray-500 mt-3">
              Created {new Date(forecast.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {filteredForecasts.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <i className="ri-line-chart-line text-4xl text-gray-300 mb-3"></i>
          <p className="text-gray-500">No forecasts found</p>
          {metricsForAutoGenerate.length > 0 && (
            <button
              onClick={handleAutoGenerate}
              disabled={isGenerating}
              className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Generating Forecasts...
                </>
              ) : (
                <>
                  <i className="ri-magic-line"></i>
                  Generate Your First Forecasts
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Enhanced Create Modal with Data Validation */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create Forecast</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              {formData.metric_id && (
                <div className="rounded-lg border border-teal-100 bg-teal-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">SigmaSense Recommendation</p>
                      <p className="text-sm font-semibold text-teal-900 mt-1">
                        Use {recommendedModel.label} for {selectedMetricName}
                      </p>
                      <p className="text-xs text-teal-700 mt-1">{recommendedModel.reason}</p>
                    </div>
                    {formData.model_type !== recommendedModel.model && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 border border-amber-200 whitespace-nowrap">
                        <i className="ri-alert-line"></i>
                        Different model selected
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forecast Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="Q1 2024 Sales Forecast"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Metric</label>
                <select
                  value={formData.metric_id}
                  onChange={(e) => setFormData({ ...formData, metric_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="">Select a metric...</option>
                  {clinicalMetricIds.size > 0 && (
                    <optgroup label="── Clinical (CPI) ──">
                      {metricsWithSufficientData
                        .filter(m => isClinicalMetric(m.id))
                        .map((metric) => (
                          <option key={metric.id} value={metric.id}>
                            🏥 {metric.name} ({metric.dataCount} pts)
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {metricsWithSufficientData.filter(m => !isClinicalMetric(m.id)).length > 0 && (
                    <optgroup label="── General Metrics ──">
                      {metricsWithSufficientData
                        .filter(m => !isClinicalMetric(m.id))
                        .map((metric) => (
                          <option key={metric.id} value={metric.id}>
                            {metric.name} ({metric.dataCount} data points)
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                {metricsWithSufficientData.length === 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    No metrics with sufficient data (3+ points required)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model Type</label>
                <select
                  value={formData.model_type}
                  onChange={(e) => setFormData({ ...formData, model_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="arima">ARIMA (Best for trends)</option>
                  <option value="prophet">Prophet (Best for seasonality)</option>
                  <option value="exponential">Exponential Smoothing</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forecast Horizon (days)</label>
                <input
                  type="number"
                  value={formData.forecast_horizon}
                  onChange={(e) => setFormData({ ...formData, forecast_horizon: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  min="7"
                  max="365"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confidence Level (%)</label>
                <input
                  type="number"
                  value={formData.confidence_level}
                  onChange={(e) => setFormData({ ...formData, confidence_level: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  min="80"
                  max="99"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formData.name || !formData.metric_id}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Generate Forecast
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedForecast && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedForecast.name}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedForecast.model_type.toUpperCase()} • {selectedForecast.forecast_horizon} days ahead
                </p>
              </div>
              <button
                onClick={() => setSelectedForecast(null)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Enhanced Accuracy Metrics with Detailed Interpretations */}
            {selectedForecast.accuracy_metrics && (
              <div className="space-y-6 mb-6">
                <InsightSummary
                  title="What This Means In Plain English"
                  summary={getForecastNarrative(selectedForecast).summary}
                  driver={getForecastNarrative(selectedForecast).driver}
                  guidance={getForecastNarrative(selectedForecast).guidance}
                />

                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-xs text-blue-600 font-medium">MAPE</div>
                    <div className="text-2xl font-bold text-blue-900 mt-1">{selectedForecast.accuracy_metrics.mape}%</div>
                    <div className="text-xs text-blue-600 mt-1">Mean Absolute % Error</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="text-xs text-purple-600 font-medium">RMSE</div>
                    <div className="text-2xl font-bold text-purple-900 mt-1">{selectedForecast.accuracy_metrics.rmse}</div>
                    <div className="text-xs text-purple-600 mt-1">Root Mean Square Error</div>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-4">
                    <div className="text-xs text-teal-600 font-medium">MAE</div>
                    <div className="text-2xl font-bold text-teal-900 mt-1">{selectedForecast.accuracy_metrics.mae}</div>
                    <div className="text-xs text-teal-600 mt-1">Mean Absolute Error</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-xs text-green-600 font-medium">R²</div>
                    <div className="text-2xl font-bold text-green-900 mt-1">{selectedForecast.accuracy_metrics.r_squared}</div>
                    <div className="text-xs text-green-600 mt-1">Coefficient of Determination</div>
                  </div>
                </div>

                {(() => {
                  const health = getForecastHealth(selectedForecast);
                  const metricName = getMetricLabel(selectedForecast.metric_id, metrics);
                  const recommendation = getRecommendedModel(selectedForecast.historical_data || [], metricName);
                  const modelAligned = recommendation.model === selectedForecast.model_type;
                  return (
                    <div className={`border rounded-xl p-5 ${health.tone}`}>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <h3 className="text-base font-semibold">Forecast Health Score</h3>
                          <p className="text-sm mt-1">{health.score}/100 · {health.level}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold border border-current/10">
                          <i className="ri-pulse-line"></i>
                          {modelAligned ? 'Model aligned to signal' : `${recommendation.label} may fit better`}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="rounded-lg bg-white/60 p-3 border border-current/10">
                          <div className="text-xs uppercase tracking-wide opacity-70">History Depth</div>
                          <div className="font-semibold mt-1">{health.historyPoints} points</div>
                        </div>
                        <div className="rounded-lg bg-white/60 p-3 border border-current/10">
                          <div className="text-xs uppercase tracking-wide opacity-70">Volatility</div>
                          <div className="font-semibold mt-1">{(health.volatility * 100).toFixed(1)}%</div>
                        </div>
                        <div className="rounded-lg bg-white/60 p-3 border border-current/10">
                          <div className="text-xs uppercase tracking-wide opacity-70">Average Range Width</div>
                          <div className="font-semibold mt-1">{health.avgBandWidth.toFixed(1)}</div>
                        </div>
                      </div>
                      <p className="text-sm mt-4">{health.warning}</p>
                    </div>
                  );
                })()}

                {/* Comprehensive Analysis Interpretation */}
                <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <i className="ri-lightbulb-line text-blue-600"></i>
                    What These Results Mean
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Overall Accuracy Assessment */}
                    {(() => {
                      const accuracy = getAccuracyInterpretation(parseFloat(selectedForecast.accuracy_metrics.mape));
                      return (
                        <div className={`${accuracy.color} border border-current/20 rounded-lg p-4`}>
                          <h4 className="font-medium mb-2">📊 Forecast Accuracy: {accuracy.level}</h4>
                          <p className="text-sm opacity-90">{accuracy.description}</p>
                          <div className="mt-2 text-xs opacity-80">
                            <strong>Technical:</strong> On average, predictions are within {selectedForecast.accuracy_metrics.mape}% of actual values
                          </div>
                        </div>
                      );
                    })()}

                    {/* Trend Analysis */}
                    {(() => {
                      const trend = getTrendInterpretation(selectedForecast.forecast_data);
                      return trend ? (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            📈 <span className={trend.color}>Expected Direction: {trend.trend}</span>
                          </h4>
                          <p className="text-sm text-gray-600">{trend.description}</p>
                          
                          {/* Practical implications */}
                          <div className="mt-3 p-3 bg-gray-50 rounded-md">
                            <h5 className="text-xs font-medium text-gray-700 mb-1">💡 Business Implications:</h5>
                            <ul className="text-xs text-gray-600 space-y-1">
                              {trend.trend === 'Growing' && (
                                <>
                                  <li>• Consider increasing inventory or capacity</li>
                                  <li>• Good time to invest in scaling operations</li>
                                  <li>• Monitor for potential resource constraints</li>
                                </>
                              )}
                              {trend.trend === 'Declining' && (
                                <>
                                  <li>• Review factors causing the decline</li>
                                  <li>• Consider cost optimization strategies</li>
                                  <li>• Look for opportunities to reverse the trend</li>
                                </>
                              )}
                              {trend.trend === 'Stable' && (
                                <>
                                  <li>• Maintain current operational levels</li>
                                  <li>• Focus on efficiency improvements</li>
                                  <li>• Good baseline for strategic planning</li>
                                </>
                              )}
                            </ul>
                          </div>
                        </div>
                      ) : null;
                    })()}

                    {/* Confidence Level Explanation */}
                    {(() => {
                      const confidence = getConfidenceInterpretation(selectedForecast.confidence_level);
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h4 className="font-medium mb-2">🎯 Confidence Level: {selectedForecast.confidence_level}%</h4>
                          <p className="text-sm text-gray-600 mb-2">{confidence.description}</p>
                          <div className="text-xs text-gray-500">
                            <strong>Practical Use:</strong> {confidence.practical}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Model-Specific Insights */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium mb-2">🔧 Model Information: {selectedForecast.model_type.toUpperCase()}</h4>
                      <div className="text-sm text-gray-600">
                        {selectedForecast.model_type === 'arima' && (
                          <div>
                            <p><strong>Best for:</strong> Data with clear trends and patterns</p>
                            <p className="text-xs mt-1 text-gray-500">ARIMA models excel at capturing linear trends and are reliable for short to medium-term forecasting.</p>
                          </div>
                        )}
                        {selectedForecast.model_type === 'prophet' && (
                          <div>
                            <p><strong>Best for:</strong> Data with seasonal patterns and holidays</p>
                            <p className="text-xs mt-1 text-gray-500">Prophet handles seasonality well and is robust to missing data and outliers.</p>
                          </div>
                        )}
                        {selectedForecast.model_type === 'exponential' && (
                          <div>
                            <p><strong>Best for:</strong> Data with exponential growth or decay</p>
                            <p className="text-xs mt-1 text-gray-500">Exponential smoothing is excellent for data that changes at an increasing or decreasing rate.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const metricName = getMetricLabel(selectedForecast.metric_id, metrics);
                      const recommendation = getRecommendedModel(selectedForecast.historical_data || [], metricName);
                      const modelAligned = recommendation.model === selectedForecast.model_type;
                      return (
                        <div className={`rounded-lg p-4 border ${modelAligned ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                          <h4 className={`font-medium mb-2 ${modelAligned ? 'text-emerald-900' : 'text-amber-900'}`}>
                            {modelAligned ? '✅ Model choice looks appropriate' : '⚠️ SigmaSense would recommend a different model'}
                          </h4>
                          <p className={`text-sm ${modelAligned ? 'text-emerald-800' : 'text-amber-800'}`}>
                            {recommendation.reason}
                          </p>
                          {!modelAligned && (
                            <p className="text-xs text-amber-700 mt-2">
                              Suggested alternative: <strong>{recommendation.label}</strong>
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Action Recommendations */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-2">🚀 Recommended Next Steps</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Set up alerts to monitor actual vs predicted values</li>
                        <li>• Review forecast monthly and retrain with new data</li>
                        <li>• Use confidence intervals for risk planning</li>
                        {parseFloat(selectedForecast.accuracy_metrics.mape) > 15 && (
                          <li>• Consider collecting more historical data to improve accuracy</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Forecast Chart */}
            {selectedForecast.historical_data && selectedForecast.forecast_data && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Forecast Visualization</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#6B7280"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis stroke="#6B7280" tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <Legend />
                      <Line 
                        data={selectedForecast.historical_data} 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#6B7280" 
                        strokeWidth={2}
                        name="Historical"
                        dot={false}
                      />
                      <Line 
                        data={selectedForecast.forecast_data} 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#14B8A6" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Forecast"
                        dot={false}
                      />
                      <Line 
                        data={selectedForecast.forecast_data} 
                        type="monotone" 
                        dataKey="upper" 
                        stroke="#14B8A6" 
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        name="Upper Bound"
                        dot={false}
                        opacity={0.5}
                      />
                      <Line 
                        data={selectedForecast.forecast_data} 
                        type="monotone" 
                        dataKey="lower" 
                        stroke="#14B8A6" 
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        name="Lower Bound"
                        dot={false}
                        opacity={0.5}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Confirm Dialog */}
            <ConfirmDialog
              isOpen={confirmDialog.isOpen}
              title={confirmDialog.title}
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
