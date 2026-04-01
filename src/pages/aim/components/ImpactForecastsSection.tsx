import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { generateAdvancedForecast } from '../../../services/aiEngine';
import {
  generateImpactScenarios,
  generateKPIForecast,
  calculateImpactBreakdown,
  calculateROI,
  ImpactScenario,
  ForecastData,
  ImpactBreakdown,
  ROIMetrics
} from '../../../services/impactForecastEngine';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { exportToCSV, exportToJSON } from '../../../utils/exportUtils';
import { addToast } from '../../../hooks/useToast';

interface Metric {
  id: string;
  name: string;
  current_value: number;
  target_value: number;
}

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
      loadImpactData();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      generateForecasts();
    }
  }, [timeHorizon, selectedScenario, user]);

  useEffect(() => {
    if (user) {
      updateROIMetrics();
    }
  }, [implementationScope, successRate, selectedScenario, user]);

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
      const roi = await calculateROI(user.id, selectedScenario, implementationScope, successRate);
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
    impact: `$${Math.round(scenario.annualImpact / 1000)}K`,
    probability: scenario.probability,
    color: scenario.id === 'minimal' ? 'slate' : scenario.id === 'balanced' ? 'teal' : scenario.id === 'aggressive' ? 'blue' : 'purple',
    icon: scenario.id === 'minimal' ? 'ri-line-chart-line' : scenario.id === 'balanced' ? 'ri-arrow-up-line' : scenario.id === 'aggressive' ? 'ri-rocket-line' : 'ri-flashlight-line'
  }));

  const calculateNetImpact = () => {
    return impactBreakdown.reduce((sum, item) => sum + (item.withActions - item.baseline), 0);
  };

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

      {/* Advanced Forecasting Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Advanced Statistical Forecasting</h3>
            <p className="text-sm text-gray-600 mt-1">Generate forecasts using advanced statistical methods</p>
          </div>
          <button
            onClick={generateForecast}
            disabled={isGeneratingForecast || !selectedMetric}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Metric</label>
            {metrics.length === 0 ? (
              <div className="col-span-3 flex flex-col items-center justify-center py-10 px-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl text-center">
                <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mb-4">
                  <i className="ri-line-chart-line text-2xl text-teal-500"></i>
                </div>
                <h4 className="text-base font-semibold text-slate-800 mb-1">No metrics found</h4>
                <p className="text-sm text-slate-500 mb-4 max-w-xs">
                  You need at least one metric before generating a forecast. Set up your metrics to get started.
                </p>
                <a
                  href="/dashboard/metrics"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-add-line"></i>
                  Set Up Metrics
                </a>
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
      </div>

      {/* Advanced Forecasts Results */}
      {advancedForecasts.length > 0 && (
        <div className="space-y-6">
          {advancedForecasts.map((forecast) => (
            <div key={forecast.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{forecast.metric_name}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Generated {new Date(forecast.generated_at).toLocaleString()} using {forecast.method.toUpperCase().replace('_', ' ')}
                  </p>
                </div>
                <button
                  onClick={() => setAdvancedForecasts(prev => prev.filter(f => f.id !== forecast.id))}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
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
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Impact Forecasts</h1>
          <p className="text-slate-600">Predicted business outcomes and KPI projections</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2"
          >
            <i className="ri-download-line"></i>
            Export Forecast
          </button>
        </div>
      </div>

      {/* Scenario Selector */}
      <div className="grid grid-cols-3 gap-4">
        {scenarioCards.map((scenario) => (
          <div
            key={scenario.id}
            onClick={() => setSelectedScenario(scenario.id)}
            className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
              selectedScenario === scenario.id
                ? `border-${scenario.color}-500 bg-gradient-to-br from-${scenario.color}-50 to-${scenario.color}-100 shadow-lg`
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 bg-gradient-to-br from-${scenario.color}-500 to-${scenario.color}-600 rounded-lg flex items-center justify-center`}>
                <i className={`${scenario.icon} text-2xl text-white`}></i>
              </div>
              {selectedScenario === scenario.id && (
                <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center">
                  <i className="ri-check-line text-white text-sm"></i>
                </div>
              )}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">{scenario.label}</h3>
            <p className="text-sm text-slate-600 mb-4">{scenario.description}</p>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-slate-900">{scenario.impact}</div>
                <div className="text-xs text-slate-500">Annual Revenue</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-teal-600">{scenario.probability}%</div>
                <div className="text-xs text-slate-500">Probability</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Net Impact Summary */}
      {impactBreakdown.length > 0 && (
        <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl border border-teal-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Net Impact Calculation</h2>
              <p className="text-sm text-slate-600">Total value from implementing all recommendations</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-teal-600 mb-1">${Math.round(calculateNetImpact())}K</div>
              <div className="text-sm text-slate-600">Annual Net Benefit</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-6">
            {impactBreakdown.map((item, index) => (
              <div key={index} className="bg-white rounded-lg p-4 border border-slate-200">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {item.category}
                </div>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div className="text-sm text-slate-600">Baseline</div>
                    <div className="text-lg font-bold text-slate-900">${Math.round(item.baseline)}K</div>
                  </div>
                  <i className="ri-arrow-right-line text-slate-400"></i>
                  <div>
                    <div className="text-sm text-slate-600">With Actions</div>
                    <div className="text-lg font-bold text-teal-600">${Math.round(item.withActions)}K</div>
                  </div>
                </div>
                <div className="px-2 py-1 bg-teal-100 text-teal-700 text-xs font-bold rounded-full text-center">
                  {item.change}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Projection Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
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
        <div className="relative h-80">
          <div className="absolute inset-0 flex items-end justify-between gap-2">
            {forecastData.map((data, index) => {
              const maxValue = Math.max(data.baseline, data.withActions, data.optimistic);
              const chartMax = Math.max(...forecastData.map(d => Math.max(d.baseline, d.withActions, d.optimistic))) * 1.1;
              
              return (
                <div key={index} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex items-end justify-center gap-1 h-64">
                    {/* Baseline Bar */}
                    <div className="relative group flex-1">
                      <div
                        className="w-full bg-slate-300 rounded-t-lg transition-all duration-500 hover:bg-slate-400"
                        style={{ height: `${(data.baseline / chartMax) * 100}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          ${Math.round(data.baseline)}K
                        </div>
                      </div>
                    </div>

                    {/* With Actions Bar */}
                    <div className="relative group flex-1">
                      <div
                        className="w-full bg-gradient-to-t from-teal-500 to-cyan-600 rounded-t-lg transition-all duration-500 hover:shadow-lg"
                        style={{ height: `${(data.withActions / chartMax) * 100}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          ${Math.round(data.withActions)}K
                        </div>
                      </div>
                    </div>

                    {/* Optimistic Bar */}
                    {showComparison && (
                      <div className="relative group flex-1">
                        <div
                          className="w-full bg-gradient-to-t from-blue-500 to-indigo-600 rounded-t-lg transition-all duration-500 hover:shadow-lg"
                          style={{ height: `${(data.optimistic / chartMax) * 100}%` }}
                        >
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                            ${Math.round(data.optimistic)}K
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-xs font-medium text-slate-600">{data.month}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart Insights */}
        <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-3 gap-4">
          <div className="p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg">
            <div className="text-sm text-slate-600 mb-1">Average Monthly Gain</div>
            <div className="text-2xl font-bold text-teal-600">
              +${Math.round((forecastData.reduce((sum, d) => sum + (d.withActions - d.baseline), 0) / forecastData.length))}K
            </div>
            <div className="text-xs text-slate-500 mt-1">vs. baseline trajectory</div>
          </div>
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
            <div className="text-sm text-slate-600 mb-1">Peak Performance Month</div>
            <div className="text-2xl font-bold text-blue-600">
              {forecastData.length > 0 ? forecastData[forecastData.length - 1].month : 'N/A'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              ${forecastData.length > 0 ? Math.round(forecastData[forecastData.length - 1].withActions) : 0}K projected
            </div>
          </div>
          <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg">
            <div className="text-sm text-slate-600 mb-1">Cumulative Impact</div>
            <div className="text-2xl font-bold text-emerald-600">
              ${Math.round(forecastData.reduce((sum, d) => sum + (d.withActions - d.baseline), 0) / 1000)}M
            </div>
            <div className="text-xs text-slate-500 mt-1">over {timeHorizon} months</div>
          </div>
        </div>
      </div>

      {/* Cost/Savings Simulator */}
      {roiMetrics && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <i className="ri-calculator-line text-xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Cost / Savings Simulator</h2>
              <p className="text-sm text-slate-600">Adjust implementation scope to see impact on ROI</p>
            </div>
          </div>

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
                <div className="text-3xl font-bold text-slate-900">${roiMetrics.investment}K</div>
              </div>
              <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
                <div className="text-sm text-slate-600 mb-1">Expected Annual Savings</div>
                <div className="text-3xl font-bold text-blue-600">
                  ${roiMetrics.annualSavings}K
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
        </div>
      )}
    </div>
  );
};

export default ImpactForecastsSection;