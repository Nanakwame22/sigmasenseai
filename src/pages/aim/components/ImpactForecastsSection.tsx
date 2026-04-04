import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { generateAdvancedForecast } from '../../../services/aiEngine';
import {
  generateImpactScenarios,
  generateKPIForecast,
  calculateImpactBreakdown,
  calculateROI,
} from '../../../services/impactForecastEngine';
import type { ImpactScenario, ForecastData, ImpactBreakdown, ROIMetrics } from '../../../services/impactForecastEngine';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { exportToCSV, exportToJSON } from '../../../utils/exportUtils';
import { addToast } from '../../../hooks/useToast';
import { AIMEmptyState, AIMMetricTiles, AIMPanel, AIMSectionIntro } from './AIMSectionSystem';

interface Metric {
  id: string;
  name: string;
  current_value: number;
  target_value: number;
}

const SCENARIO_THEME: Record<string, {
  shell: string;
  icon: string;
  activeShell: string;
  accent: string;
}> = {
  stabilize: {
    shell: 'border-slate-200 bg-white hover:border-slate-300',
    icon: 'from-slate-500 to-slate-700',
    activeShell: 'border-slate-500 bg-gradient-to-br from-slate-50 to-slate-100 shadow-lg shadow-slate-200/70',
    accent: 'text-slate-700',
  },
  balanced: {
    shell: 'border-teal-200 bg-white hover:border-teal-300',
    icon: 'from-teal-500 to-cyan-600',
    activeShell: 'border-teal-500 bg-gradient-to-br from-teal-50 to-cyan-50 shadow-lg shadow-teal-200/70',
    accent: 'text-teal-700',
  },
  capacity: {
    shell: 'border-blue-200 bg-white hover:border-blue-300',
    icon: 'from-blue-500 to-indigo-600',
    activeShell: 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg shadow-blue-200/70',
    accent: 'text-blue-700',
  },
  transformation: {
    shell: 'border-fuchsia-200 bg-white hover:border-fuchsia-300',
    icon: 'from-fuchsia-500 to-violet-600',
    activeShell: 'border-fuchsia-500 bg-gradient-to-br from-fuchsia-50 to-violet-50 shadow-lg shadow-fuchsia-200/70',
    accent: 'text-fuchsia-700',
  },
};

const ImpactForecastsSection: React.FC = () => {
  const { user } = useAuth();
  const [selectedScenario, setSelectedScenario] = useState<string>('balanced');
  const [timeHorizon, setTimeHorizon] = useState<number>(12);
  const [showComparison, setShowComparison] = useState(true);
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  const [loading, setLoading] = useState(true);
  const [implementationScope, setImplementationScope] = useState(70);
  const [successRate, setSuccessRate] = useState(85);
  const [timeline, setTimeline] = useState(12);

  const [advancedForecasts, setAdvancedForecasts] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [forecastMethod, setForecastMethod] = useState<'auto' | 'sma' | 'ema' | 'exponential_smoothing' | 'seasonal'>('auto');
  const [forecastPeriods, setForecastPeriods] = useState<number>(12);
  const [isGeneratingForecast, setIsGeneratingForecast] = useState(false);
  const [metrics, setMetrics] = useState<Metric[]>([]);

  const [scenarios, setScenarios] = useState<ImpactScenario[]>([]);
  const [impactBreakdown, setImpactBreakdown] = useState<ImpactBreakdown[]>([]);
  const [roiMetrics, setROIMetrics] = useState<ROIMetrics | null>(null);

  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    if (user) {
      loadMetrics();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadImpactData();
      updateROIMetrics();
      generateForecasts();
    }
  }, [timeHorizon, selectedScenario, user]);

  useEffect(() => {
    if (user) {
      updateROIMetrics();
    }
  }, [implementationScope, successRate, timeline, selectedScenario, user]);

  const formatMoney = (value: number) => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return '$0';

    const absolute = Math.abs(numeric);
    if (absolute >= 1_000_000) {
      return `$${(numeric / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
    }
    if (absolute >= 1_000) {
      return `$${(numeric / 1_000).toFixed(absolute >= 100_000 ? 0 : 1)}K`;
    }
    return `$${numeric.toFixed(0)}`;
  };

  async function loadMetrics() {
    if (!user) return;

    try {
      // First get the user's organization
      const { data: orgData, error: orgError } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!orgData) return;

      const { data, error } = await supabase
        .from('metrics')
        .select('id, name, current_value, target_value')
        .eq('organization_id', orgData.organization_id)
        .order('name');

      if (error) throw error;
      setMetrics(data || []);
      if (data && data.length > 0) {
        setSelectedMetric(data[0].id);
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    }
  }

  async function loadImpactData() {
    if (!user) return;

    try {
      const [scenariosData, breakdownData] = await Promise.all([
        generateImpactScenarios(user.id),
        calculateImpactBreakdown(user.id, selectedScenario)
      ]);

      setScenarios(scenariosData);
      setImpactBreakdown(breakdownData);
    } catch (error) {
      console.error('Error loading impact data:', error);
    }
  }

  async function updateROIMetrics() {
    if (!user) return;

    try {
      const roi = await calculateROI(user.id, selectedScenario, implementationScope, successRate, timeline);
      setROIMetrics(roi);
    } catch (error) {
      console.error('Error calculating ROI:', error);
    }
  }

  async function generateForecast() {
    if (!selectedMetric) return;
    
    setIsGeneratingForecast(true);
    try {
      const forecast = await generateAdvancedForecast(selectedMetric, forecastPeriods, forecastMethod);
      
      const metric = metrics.find(m => m.id === selectedMetric);
      setAdvancedForecasts(prev => [{
        id: Date.now().toString(),
        metric_name: metric?.name || 'Unknown Metric',
        method: forecast.method,
        accuracy: forecast.accuracy,
        trend_strength: forecast.trend_strength,
        seasonality_detected: forecast.seasonality_detected,
        outliers_count: forecast.outliers.length,
        forecast_data: forecast.forecast,
        generated_at: new Date().toISOString()
      }, ...prev]);
      
    } catch (error) {
      console.error('Error generating forecast:', error);
      addToast('Failed to generate forecast. Please ensure there is sufficient historical data.', 'error');
    } finally {
      setIsGeneratingForecast(false);
    }
  }

  const generateForecasts = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const forecasts = await generateKPIForecast(user.id, timeHorizon, selectedScenario);
      setForecastData(forecasts);

    } catch (error) {
      console.error('Error generating forecasts:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportForecast = (format: 'csv' | 'json') => {
    if (forecastData.length === 0) return;

    const exportData = forecastData.map(d => ({
      Month: d.month,
      Baseline: d.baseline,
      'With Actions': d.withActions,
      Optimistic: d.optimistic,
      Pessimistic: d.pessimistic
    }));

    if (format === 'csv') {
      exportToCSV(exportData, `impact-forecast-${selectedScenario}-${new Date().toISOString().split('T')[0]}.csv`);
    } else {
      exportToJSON({
        scenario: selectedScenario,
        timeHorizon,
        generatedAt: new Date().toISOString(),
        data: exportData,
        summary: {
          averageGain: Math.round(forecastData.reduce((sum, d) => sum + (d.withActions - d.baseline), 0) / forecastData.length),
          cumulativeImpact: Math.round(forecastData.reduce((sum, d) => sum + (d.withActions - d.baseline), 0)),
          roi: roiMetrics?.roi || 0
        }
      }, `impact-forecast-${selectedScenario}-${new Date().toISOString().split('T')[0]}.json`);
    }

    setShowExportModal(false);
  };

  const scenarioCards = scenarios.map(scenario => ({
    id: scenario.id,
    label: scenario.name,
    description: scenario.description,
    impact: formatMoney(scenario.annualImpact),
    probability: scenario.probability,
    investment: formatMoney(scenario.investment),
    roi: `${scenario.roi}% ROI`,
    timeline: scenario.timeline,
    risk: scenario.risk,
    icon:
      scenario.id === 'stabilize'
        ? 'ri-shield-check-line'
        : scenario.id === 'balanced'
          ? 'ri-scales-3-line'
          : scenario.id === 'capacity'
            ? 'ri-hospital-line'
            : 'ri-rocket-2-line'
  }));

  const calculateNetImpact = () => {
    return impactBreakdown.reduce((sum, item) => sum + (item.withActions - item.baseline), 0);
  };

  const activeScenario = scenarioCards.find((card) => card.id === selectedScenario) ?? scenarioCards[0];
  const activeTheme = SCENARIO_THEME[activeScenario?.id] || SCENARIO_THEME.balanced;
  const visibleSeries = forecastData.flatMap((point) => [
    point.baseline,
    point.withActions,
    ...(showComparison ? [point.optimistic] : []),
  ]);
  const seriesMin = visibleSeries.length > 0 ? Math.min(...visibleSeries) : 0;
  const seriesMax = visibleSeries.length > 0 ? Math.max(...visibleSeries) : 0;
  const seriesRange = Math.max(1, seriesMax - seriesMin);
  const domainPadding = Math.max(seriesRange * 0.18, Math.max(Math.abs(seriesMax), 1) * 0.04, 1);
  const chartDomain: [number, number] = [
    Math.max(0, seriesMin - domainPadding),
    seriesMax + domainPadding,
  ];
  const leadSeriesAverage =
    forecastData.length > 0
      ? forecastData.reduce((sum, point) => sum + point.withActions, 0) / forecastData.length
      : 0;

  if (loading && forecastData.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Generating forecasts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Export Format Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Export Forecast</h3>
            <p className="text-sm text-gray-600 mb-6">Choose your preferred export format.</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => exportForecast('csv')}
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-teal-500 hover:bg-teal-50 transition-all cursor-pointer"
              >
                <i className="ri-file-excel-2-line text-3xl text-teal-600"></i>
                <span className="text-sm font-semibold text-gray-800">CSV</span>
                <span className="text-xs text-gray-500">Spreadsheet format</span>
              </button>
              <button
                onClick={() => exportForecast('json')}
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-teal-500 hover:bg-teal-50 transition-all cursor-pointer"
              >
                <i className="ri-code-box-line text-3xl text-teal-600"></i>
                <span className="text-sm font-semibold text-gray-800">JSON</span>
                <span className="text-xs text-gray-500">Developer format</span>
              </button>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <AIMSectionIntro
        eyebrow="Impact Forecasts"
        title="Executive Impact Forecasting"
        description="Model strategic upside, compare investment paths, and translate recommendations into financial and KPI movement before you commit resources."
        actions={
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2"
          >
            <i className="ri-download-line"></i>
            Export Forecast
          </button>
        }
      />

      <AIMMetricTiles
        items={[
          {
            label: 'Selected Scenario',
            value: scenarioCards.find(card => card.id === selectedScenario)?.label ?? 'Balanced Improvement',
            detail: scenarioCards.find(card => card.id === selectedScenario)?.timeline ?? '8 months',
          },
          {
            label: 'Modeled Annual Upside',
            value: scenarioCards.find(card => card.id === selectedScenario)?.impact ?? '$0K',
            detail: scenarioCards.find(card => card.id === selectedScenario)?.roi ?? '0% ROI',
            accent: 'text-emerald-600',
          },
          {
            label: 'Execution Posture',
            value: `${scenarioCards.find(card => card.id === selectedScenario)?.risk ?? 'Low'} risk`,
            detail: `Investment ${scenarioCards.find(card => card.id === selectedScenario)?.investment ?? '$0K'}`,
          },
          {
            label: 'Net Annual Benefit',
            value: formatMoney(calculateNetImpact() * 1000),
            detail: 'Across current recommended actions',
            accent: calculateNetImpact() >= 0 ? 'text-teal-600' : 'text-red-600',
          },
        ]}
      />

      <AIMPanel
        title="Forecast Studio"
        description="Generate advanced statistical forecasts for any live metric and compare them with the broader scenario outlook."
        icon="ri-line-chart-line"
        accentClass="from-teal-500 to-cyan-600"
        actions={
          <button
            onClick={generateForecast}
            disabled={isGeneratingForecast || !selectedMetric}
            className="px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
          >
            {isGeneratingForecast ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                Generating...
              </>
            ) : (
              <>
                <i className="ri-line-chart-line"></i>
                Generate Forecast
              </>
            )}
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Metric</label>
            {metrics.length === 0 ? (
              <div className="col-span-3">
                <AIMEmptyState
                  icon="ri-line-chart-line"
                  title="No metrics found"
                  description="You need at least one metric before AIM can generate a statistical forecast."
                  action={
                    <a
                      href="/dashboard/metrics"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors whitespace-nowrap"
                    >
                      <i className="ri-add-line"></i>
                      Set Up Metrics
                    </a>
                  }
                />
              </div>
            ) : (
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                {metrics.map(metric => (
                  <option key={metric.id} value={metric.id}>
                    {metric.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Forecasting Method</label>
            <select
              value={forecastMethod}
              onChange={(e) => setForecastMethod(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="auto">Auto (Best Fit)</option>
              <option value="sma">Simple Moving Average</option>
              <option value="ema">Exponential Moving Average</option>
              <option value="exponential_smoothing">Exponential Smoothing (Holt)</option>
              <option value="seasonal">Seasonal Decomposition</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Forecast Periods</label>
            <select
              value={forecastPeriods}
              onChange={(e) => setForecastPeriods(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value={7}>7 Days</option>
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
              <option value={60}>60 Days</option>
              <option value={90}>90 Days</option>
            </select>
          </div>
        </div>

        {/* Method Descriptions */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Method Descriptions:</h4>
          <div className="space-y-2 text-sm text-gray-600">
            <div><strong>Auto:</strong> Automatically selects the best method based on data characteristics (seasonality, trend strength)</div>
            <div><strong>SMA:</strong> Simple Moving Average - Good for stable data with minimal trend</div>
            <div><strong>EMA:</strong> Exponential Moving Average - More responsive to recent changes</div>
            <div><strong>Exponential Smoothing:</strong> Holt's method - Captures both level and trend</div>
            <div><strong>Seasonal:</strong> Seasonal decomposition - Best for data with recurring patterns</div>
          </div>
        </div>
      </AIMPanel>

      {/* Advanced Forecasts Results */}
      {advancedForecasts.length > 0 && (
        <div className="space-y-6">
          {advancedForecasts.map((forecast) => (
            <AIMPanel
              key={forecast.id}
              title={forecast.metric_name}
              description={`Generated ${new Date(forecast.generated_at).toLocaleString()} using ${forecast.method.toUpperCase().replace('_', ' ')}`}
              icon="ri-pulse-line"
              accentClass="from-blue-500 to-indigo-600"
              actions={
                <button
                  onClick={() => setAdvancedForecasts(prev => prev.filter(f => f.id !== forecast.id))}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              }
            >
              <div className="flex items-start justify-between mb-6">
                <div></div>
              </div>

              {/* Forecast Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-accuracy-line text-teal-600"></i>
                    <span className="text-sm text-teal-700 font-medium">Accuracy</span>
                  </div>
                  <div className="text-2xl font-bold text-teal-900">{forecast.accuracy}%</div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-line-chart-line text-blue-600"></i>
                    <span className="text-sm text-blue-700 font-medium">Trend Strength</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-900">{(forecast.trend_strength * 100).toFixed(0)}%</div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-calendar-line text-purple-600"></i>
                    <span className="text-sm text-purple-700 font-medium">Seasonality</span>
                  </div>
                  <div className="text-2xl font-bold text-purple-900">
                    {forecast.seasonality_detected ? 'Yes' : 'No'}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-alert-line text-orange-600"></i>
                    <span className="text-sm text-orange-700 font-medium">Outliers</span>
                  </div>
                  <div className="text-2xl font-bold text-orange-900">{forecast.outliers_count}</div>
                </div>
              </div>

              {/* Forecast Chart with Confidence Intervals */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Forecast with Confidence Intervals</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={forecast.forecast_data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="confidence_upper" 
                      stackId="1"
                      stroke="none"
                      fill="#d1fae5" 
                      fillOpacity={0.3}
                      name="Upper Confidence"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stackId="2"
                      stroke="#14b8a6" 
                      fill="#14b8a6"
                      fillOpacity={0.6}
                      name="Forecast"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="confidence_lower" 
                      stackId="3"
                      stroke="none"
                      fill="#d1fae5" 
                      fillOpacity={0.3}
                      name="Lower Confidence"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Trend and Seasonal Components */}
              {(forecast.trend_strength > 0.3 || forecast.seasonality_detected) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {forecast.trend_strength > 0.3 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4">Trend Component</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={forecast.forecast_data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="trend" stroke="#3b82f6" strokeWidth={2} dot={false} name="Trend" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {forecast.seasonality_detected && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4">Seasonal Component</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={forecast.forecast_data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="seasonal" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Seasonal" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </AIMPanel>
          ))}
        </div>
      )}

      <AIMPanel
        title="Strategy Posture"
        description="Choose the operating posture you want to model, then review the financial and operational trade-offs before committing."
        icon="ri-compass-3-line"
        accentClass="from-cyan-500 to-blue-600"
      >
        <div className="grid gap-6 xl:grid-cols-[1.35fr,0.95fr]">
          <div className="space-y-3">
            {scenarioCards.map((scenario) => {
              const theme = SCENARIO_THEME[scenario.id] || SCENARIO_THEME.balanced;
              const isActive = selectedScenario === scenario.id;
              return (
                <button
                  key={scenario.id}
                  onClick={() => setSelectedScenario(scenario.id)}
                  className={`w-full rounded-[24px] border p-5 text-left transition-all duration-200 ${
                    isActive
                      ? `${theme.activeShell} ring-1 ring-offset-0`
                      : `${theme.shell} hover:shadow-md`
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${theme.icon}`}>
                      <i className={`${scenario.icon} text-2xl text-white`}></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">{scenario.label}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{scenario.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isActive ? 'bg-white/70 text-slate-700' : 'bg-slate-100 text-slate-600'}`}>
                            {scenario.timeline}
                          </span>
                          {isActive && (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-500">
                              <i className="ri-check-line text-sm text-white"></i>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white/70 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Annual impact</div>
                          <div className={`mt-1 text-xl font-bold ${theme.accent}`}>{scenario.impact}</div>
                        </div>
                        <div className="rounded-2xl bg-white/70 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Confidence</div>
                          <div className={`mt-1 text-xl font-bold ${theme.accent}`}>{scenario.probability}%</div>
                        </div>
                        <div className="rounded-2xl bg-white/70 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Investment posture</div>
                          <div className={`mt-1 text-xl font-bold ${theme.accent}`}>{scenario.investment}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {activeScenario && (
            <div className={`rounded-[28px] border p-6 ${activeTheme.activeShell}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${activeTheme.icon}`}>
                  <i className={`${activeScenario.icon} text-2xl text-white`}></i>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected posture</div>
                  <h3 className="text-2xl font-bold text-slate-900">{activeScenario.label}</h3>
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-600">
                {activeScenario.description}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Modeled annual upside</div>
                  <div className={`mt-2 text-3xl font-bold ${activeTheme.accent}`}>{activeScenario.impact}</div>
                  <div className="mt-1 text-xs text-slate-500">{activeScenario.roi}</div>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Delivery confidence</div>
                  <div className={`mt-2 text-3xl font-bold ${activeTheme.accent}`}>{activeScenario.probability}%</div>
                  <div className="mt-1 text-xs text-slate-500">{activeScenario.timeline}</div>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Investment level</div>
                  <div className="mt-2 text-3xl font-bold text-slate-900">{activeScenario.investment}</div>
                  <div className="mt-1 text-xs text-slate-500">Estimated commitment required</div>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Risk posture</div>
                  <div className="mt-2 text-3xl font-bold text-slate-900">{activeScenario.risk}</div>
                  <div className="mt-1 text-xs text-slate-500">Execution pressure and change load</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AIMPanel>

      {/* Net Impact Summary */}
      {impactBreakdown.length > 0 && (
        <AIMPanel
          title="Net Impact Calculation"
          description="Total modeled value from implementing the current recommendation set."
          icon="ri-money-dollar-circle-line"
          accentClass="from-teal-500 to-cyan-600"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Net Impact Calculation</h2>
              <p className="text-sm text-slate-600">Total modeled value from implementing the current recommendation set.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:w-[520px]">
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Annual net benefit</div>
                <div className="mt-2 text-3xl font-bold text-teal-600">{formatMoney(calculateNetImpact() * 1000)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Focus scenario</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{activeScenario?.label ?? 'Balanced Improvement'}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Expected confidence</div>
                <div className="mt-2 text-3xl font-bold text-slate-900">{activeScenario?.probability ?? 0}%</div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {impactBreakdown.map((item, index) => (
              <div key={index} className="rounded-[22px] border border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  {item.category}
                </div>
                <div className="grid grid-cols-[1fr,auto,1fr] items-end gap-3 mb-3">
                  <div>
                    <div className="text-sm text-slate-600">Baseline</div>
                    <div className="text-lg font-bold text-slate-900">{formatMoney(item.baseline * 1000)}</div>
                  </div>
                  <i className="ri-arrow-right-line text-slate-400"></i>
                  <div>
                    <div className="text-sm text-slate-600">With Actions</div>
                    <div className="text-lg font-bold text-teal-600">{formatMoney(item.withActions * 1000)}</div>
                  </div>
                </div>
                <div className="rounded-full bg-teal-100 px-3 py-2 text-center text-xs font-bold text-teal-700">
                  {item.change}
                </div>
              </div>
            ))}
          </div>
        </AIMPanel>
      )}

      {/* KPI Projection Chart */}
      <AIMPanel
        title="KPI Projection Chart"
        description={`${timeHorizon}-month forecast with scenario comparison`}
        icon="ri-bar-chart-grouped-line"
        accentClass="from-slate-700 to-slate-900"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">KPI Projection Chart</h2>
            <p className="text-sm text-slate-600">{timeHorizon}-month forecast with scenario comparison</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Horizon:</span>
              <select
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(Number(e.target.value))}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 cursor-pointer"
              >
                <option value={6}>6 Months</option>
                <option value={12}>12 Months</option>
                <option value={24}>24 Months</option>
              </select>
            </div>
            <button
              onClick={() => setShowComparison(!showComparison)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                showComparison
                  ? 'bg-teal-100 text-teal-700'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {showComparison ? 'Hide' : 'Show'} Comparison
            </button>
          </div>
        </div>

        {/* Chart Legend */}
        <div className="flex items-center gap-6 mb-6 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-slate-400 rounded-full"></div>
            <span className="text-sm text-slate-600">Baseline</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-full"></div>
            <span className="text-sm text-slate-600">With Actions</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"></div>
            <span className="text-sm text-slate-600">Optimistic</span>
          </div>
        </div>

        {/* Chart */}
        <div className="relative min-h-[360px] rounded-[24px] border border-slate-200 bg-white/80 px-3 pb-2 pt-4">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={forecastData} margin={{ top: 12, right: 20, left: 6, bottom: 8 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748B', fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748B', fontSize: 12 }}
                tickFormatter={(value) => formatMoney(value)}
                domain={chartDomain}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '18px',
                  border: '1px solid #D7E3F0',
                  backgroundColor: '#0F172A',
                  boxShadow: '0 20px 45px rgba(15, 23, 42, 0.18)',
                }}
                labelStyle={{ color: '#E2E8F0', fontWeight: 600 }}
                itemStyle={{ color: '#F8FAFC' }}
                formatter={(value: number, name: string) => {
                  const labelMap: Record<string, string> = {
                    baseline: 'Baseline',
                    withActions: 'With Actions',
                    optimistic: 'Optimistic',
                  };
                  return [formatMoney(Number(value ?? 0)), labelMap[name] ?? name];
                }}
              />
              <Line
                type="monotone"
                dataKey="baseline"
                stroke="#94A3B8"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: '#94A3B8', stroke: '#fff', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="withActions"
                stroke="#14B8A6"
                strokeWidth={4}
                dot={false}
                activeDot={{ r: 6, fill: '#14B8A6', stroke: '#fff', strokeWidth: 2 }}
              />
              {showComparison && (
                <Line
                  type="monotone"
                  dataKey="optimistic"
                  stroke="#4F46E5"
                  strokeWidth={2.5}
                  strokeDasharray="6 6"
                  dot={false}
                  activeDot={{ r: 5, fill: '#4F46E5', stroke: '#fff', strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Lead trajectory</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">With Actions stays emphasized as the executive path</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Average modeled level</div>
              <div className="mt-1 text-lg font-bold text-teal-600">{formatMoney(leadSeriesAverage)}</div>
            </div>
          </div>
        </div>

        {/* Chart Insights */}
        <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-3 gap-4">
          <div className="p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg">
            <div className="text-sm text-slate-600 mb-1">Average Monthly Gain</div>
            <div className="text-2xl font-bold text-teal-600">
              {formatMoney(forecastData.reduce((sum, d) => sum + (d.withActions - d.baseline), 0) / Math.max(forecastData.length, 1))}
            </div>
            <div className="text-xs text-slate-500 mt-1">vs. baseline trajectory</div>
          </div>
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
            <div className="text-sm text-slate-600 mb-1">Peak Performance Month</div>
            <div className="text-2xl font-bold text-blue-600">
              {forecastData.length > 0 ? forecastData[forecastData.length - 1].month : 'N/A'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {forecastData.length > 0 ? formatMoney(forecastData[forecastData.length - 1].withActions) : '$0'} projected
            </div>
          </div>
          <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg">
            <div className="text-sm text-slate-600 mb-1">Cumulative Impact</div>
            <div className="text-2xl font-bold text-emerald-600">
              {formatMoney(forecastData.reduce((sum, d) => sum + (d.withActions - d.baseline), 0))}
            </div>
            <div className="text-xs text-slate-500 mt-1">over {timeHorizon} months</div>
          </div>
        </div>
      </AIMPanel>

      {/* Cost/Savings Simulator */}
      {roiMetrics && (
        <AIMPanel
          title="Cost / Savings Simulator"
          description="Stress-test scope, success rate, and timeline so the executive team can compare investment posture with expected savings."
          icon="ri-calculator-line"
          accentClass="from-purple-500 to-pink-600"
        >
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Implementation Scope: <span className="text-teal-600 font-bold">{implementationScope}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={implementationScope}
                  onChange={(e) => setImplementationScope(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Success Rate: <span className="text-teal-600 font-bold">{successRate}%</span>
                </label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={successRate}
                  onChange={(e) => setSuccessRate(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Timeline: <span className="text-teal-600 font-bold">{timeline} months</span>
                </label>
                <input
                  type="range"
                  min="6"
                  max="24"
                  value={timeline}
                  onChange={(e) => setTimeline(Number(e.target.value))}
                  step="6"
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>6mo</span>
                  <span>12mo</span>
                  <span>24mo</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg">
                <div className="text-sm text-slate-600 mb-1">Total Investment Required</div>
                <div className="text-3xl font-bold text-slate-900">{formatMoney(roiMetrics.investment * 1000)}</div>
              </div>
              <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
                <div className="text-sm text-slate-600 mb-1">Expected Annual Savings</div>
                <div className="text-3xl font-bold text-blue-600">
                  {formatMoney(roiMetrics.annualSavings * 1000)}
                </div>
              </div>
              <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg">
                <div className="text-sm text-slate-600 mb-1">Net ROI</div>
                <div className="text-3xl font-bold text-purple-600">{roiMetrics.roi}%</div>
              </div>
              <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg">
                <div className="text-sm text-slate-600 mb-1">Payback Period</div>
                <div className="text-3xl font-bold text-amber-600">{roiMetrics.paybackMonths} mo</div>
              </div>
            </div>
          </div>
        </AIMPanel>
      )}
    </div>
  );
};

export default ImpactForecastsSection;
