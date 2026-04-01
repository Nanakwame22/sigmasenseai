import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ScatterChart, Scatter, Cell } from 'recharts';
import KPISelector from './KPISelector';

interface MeasureIntelligenceHubProps {
  projectId?: string;
  onSave?: () => void;
}

interface MSAResults {
  gageRR: number;
  repeatability: number;
  reproducibility: number;
  partVariation: number;
  ndc: number;
  operators: Array<{
    name: string;
    bias: number;
    variance: number;
  }>;
}

interface CapabilityResults {
  cp: number;
  cpk: number;
  pp: number;
  ppk: number;
  sigmaLevel: number;
  dpmo: number;
  yield: number;
  status: 'capable' | 'marginal' | 'incapable';
}

interface DataQualityMetrics {
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  validity: number;
  overall: number;
}

export const MeasureIntelligenceHub: React.FC<MeasureIntelligenceHubProps> = ({ projectId, onSave }) => {
  const { organization } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<'overview' | 'data-hub' | 'msa' | 'baseline' | 'capability' | 'variability'>('overview');
  
  // Selected KPI/Metric
  const [selectedKPI, setSelectedKPI] = useState<any>(null);
  const [showKPISelector, setShowKPISelector] = useState(false);
  
  // Measurement Intelligence Header Data
  const [headerMetrics, setHeaderMetrics] = useState({
    primaryCTQ: 'Patient Wait Time',
    baseline: 45.3,
    current: 42.1,
    target: 30.0,
    gapPercent: 40.3,
    dataQuality: 94,
    measurementReliability: 87,
    costPerDefect: 125,
    sigmaLevel: 3.8
  });

  // Data Intelligence Hub
  const [dataSource, setDataSource] = useState({
    name: 'EHR System',
    type: 'SQL Database',
    records: 1250,
    columns: 15,
    lastSync: new Date().toISOString()
  });

  const [dataDiagnostics, setDataDiagnostics] = useState({
    missingValues: 3.2,
    duplicates: 0.8,
    outliers: 4.5,
    skewness: 0.23,
    timestampGaps: 2,
    variableTypes: { numeric: 8, categorical: 7 }
  });

  // MSA Results
  const [msaResults, setMSAResults] = useState<MSAResults | null>(null);
  const [runningMSA, setRunningMSA] = useState(false);

  // Baseline Performance
  const [baselineData, setBaselineData] = useState<any[]>([]);
  const [baselineStats, setBaselineStats] = useState({
    mean: 45.3,
    median: 42.0,
    stdDev: 12.8,
    variance: 163.84,
    q1: 35.2,
    q3: 53.5,
    controlLimits: { ucl: 83.7, lcl: 6.9 }
  });

  // Capability Analysis
  const [capabilityResults, setCapabilityResults] = useState<CapabilityResults | null>(null);
  const [specLimits, setSpecLimits] = useState({ lsl: 0, target: 30, usl: 60 });

  // Data Quality
  const [dataQuality, setDataQuality] = useState<DataQualityMetrics>({
    completeness: 95,
    accuracy: 88,
    consistency: 92,
    timeliness: 85,
    validity: 90,
    overall: 90
  });

  // Variability Analysis
  const [variabilityData, setVariabilityData] = useState<any[]>([]);
  const [segmentBy, setSegmentBy] = useState('department');

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);

  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadMeasureData();
  }, [organization?.id, selectedKPI]);

  const loadMeasureData = async () => {
    if (!organization?.id) return;

    try {
      setLoading(true);

      // Load baseline data from selected KPI/Metric
      if (selectedKPI) {
        await loadBaselineFromKPI();
      }

      // Generate mock control chart data
      generateBaselineData();
      
      // Generate variability heatmap data
      generateVariabilityData();

    } catch (error) {
      console.error('Error loading Measure data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBaselineFromKPI = async () => {
    if (!selectedKPI) return;

    try {
      const { data, error } = await supabase
        .from('metric_data')
        .select('*')
        .eq('metric_id', selectedKPI.id)
        .order('timestamp', { ascending: true })
        .limit(100);

      if (error) throw error;

      if (data && data.length > 0) {
        const values = data.map(d => parseFloat(d.value));
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        setBaselineStats({
          mean,
          median: values.sort((a, b) => a - b)[Math.floor(values.length / 2)],
          stdDev,
          variance,
          q1: values[Math.floor(values.length * 0.25)],
          q3: values[Math.floor(values.length * 0.75)],
          controlLimits: {
            ucl: mean + (3 * stdDev),
            lcl: Math.max(0, mean - (3 * stdDev))
          }
        });

        setHeaderMetrics(prev => ({
          ...prev,
          primaryCTQ: selectedKPI.name,
          baseline: mean,
          current: values[values.length - 1],
          target: selectedKPI.target_value || 30
        }));
      }
    } catch (error) {
      console.error('Error loading baseline from KPI:', error);
    }
  };

  const generateBaselineData = () => {
    const data = [];
    const mean = baselineStats.mean;
    const stdDev = baselineStats.stdDev;

    for (let i = 0; i < 30; i++) {
      const value = mean + (Math.random() - 0.5) * stdDev * 2;
      data.push({
        day: i + 1,
        value: Math.max(0, value),
        ucl: baselineStats.controlLimits.ucl,
        lcl: baselineStats.controlLimits.lcl,
        mean: mean
      });
    }

    setBaselineData(data);
  };

  const generateVariabilityData = () => {
    const departments = ['Emergency', 'Outpatient', 'Surgery', 'Radiology'];
    const shifts = ['Morning', 'Afternoon', 'Evening', 'Night'];
    
    const data = [];
    departments.forEach(dept => {
      shifts.forEach(shift => {
        data.push({
          department: dept,
          shift,
          avgWaitTime: 30 + Math.random() * 30,
          variance: 5 + Math.random() * 15
        });
      });
    });

    setVariabilityData(data);
  };

  const handleRunMSA = async () => {
    if (!selectedKPI) {
      addToast('⚠️ Please select a KPI/Metric first', 'warning');
      setShowKPISelector(true);
      return;
    }

    setRunningMSA(true);

    // Simulate MSA calculation
    setTimeout(() => {
      const results: MSAResults = {
        gageRR: 15.2,
        repeatability: 8.5,
        reproducibility: 6.7,
        partVariation: 84.8,
        ndc: 8,
        operators: [
          { name: 'Operator A', bias: 0.3, variance: 2.1 },
          { name: 'Operator B', bias: -0.2, variance: 1.9 },
          { name: 'Operator C', bias: 0.1, variance: 2.3 }
        ]
      };

      setMSAResults(results);
      setRunningMSA(false);
    }, 2000);
  };

  const handleCalculateCapability = () => {
    if (!selectedKPI) {
      addToast('⚠️ Please select a KPI/Metric first', 'warning');
      setShowKPISelector(true);
      return;
    }

    const mean = baselineStats.mean;
    const stdDev = baselineStats.stdDev;
    const { lsl, target, usl } = specLimits;

    const cp = (usl - lsl) / (6 * stdDev);
    const cpk = Math.min((usl - mean) / (3 * stdDev), (mean - lsl) / (3 * stdDev));
    const pp = cp; // Simplified
    const ppk = cpk; // Simplified
    const sigmaLevel = cpk * 3;
    const dpmo = Math.round((1 - 0.9987) * 1000000); // Simplified
    const yieldPercent = 99.87;

    const results: CapabilityResults = {
      cp: parseFloat(cp.toFixed(2)),
      cpk: parseFloat(cpk.toFixed(2)),
      pp: parseFloat(pp.toFixed(2)),
      ppk: parseFloat(ppk.toFixed(2)),
      sigmaLevel: parseFloat(sigmaLevel.toFixed(1)),
      dpmo,
      yield: yieldPercent,
      status: cpk >= 1.33 ? 'capable' : cpk >= 1.0 ? 'marginal' : 'incapable'
    };

    setCapabilityResults(results);
  };

  const handleRecalculateBaseline = () => {
    generateBaselineData();
    addToast('✅ Baseline recalculated with latest data', 'success');
  };

  const getCapabilityColor = (status: string) => {
    switch (status) {
      case 'capable': return 'text-emerald-600 bg-emerald-50 border-emerald-300';
      case 'marginal': return 'text-amber-600 bg-amber-50 border-amber-300';
      case 'incapable': return 'text-rose-600 bg-rose-50 border-rose-300';
      default: return 'text-slate-600 bg-slate-50 border-slate-300';
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600';
    if (score >= 75) return 'text-amber-600';
    return 'text-rose-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Measurement Intelligence Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Measurement Intelligence Hub</h2>
            <p className="text-sm text-slate-600 mt-1">Establish measurement credibility with statistical rigor</p>
          </div>
          <button
            onClick={() => setShowKPISelector(true)}
            className="px-4 py-2 bg-gradient-to-r from-teal-600 to-indigo-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
          >
            <i className="ri-focus-3-line mr-2"></i>
            {selectedKPI ? 'Change KPI/Metric' : 'Select KPI/Metric'}
          </button>
        </div>

        {/* Live Data Sync KPI Cards */}
        <div className="grid grid-cols-8 gap-3">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                <i className="ri-focus-3-line text-indigo-600"></i>
              </div>
              <span className="text-xs font-semibold text-slate-600">Primary CTQ</span>
            </div>
            <div className="text-lg font-bold text-slate-900">{headerMetrics.primaryCTQ}</div>
            <div className="text-xs text-slate-500 mt-1">
              <i className="ri-database-2-line mr-1"></i>
              {dataSource.name}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-600 mb-1">Baseline</div>
            <div className="text-2xl font-bold text-slate-900">{headerMetrics.baseline}</div>
            <div className="text-xs text-slate-500 mt-1">minutes</div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-600 mb-1">Current</div>
            <div className="text-2xl font-bold text-teal-600">{headerMetrics.current}</div>
            <div className="text-xs text-slate-500 mt-1">minutes</div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-600 mb-1">Target</div>
            <div className="text-2xl font-bold text-indigo-600">{headerMetrics.target}</div>
            <div className="text-xs text-slate-500 mt-1">minutes</div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-600 mb-1">Gap to Target</div>
            <div className="text-2xl font-bold text-rose-600">{headerMetrics.gapPercent}%</div>
            <div className="text-xs text-rose-500 mt-1">Above target</div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-600 mb-1">Data Quality</div>
            <div className="text-2xl font-bold text-emerald-600">{headerMetrics.dataQuality}</div>
            <div className="text-xs text-emerald-500 mt-1">Excellent</div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-600 mb-1">Reliability</div>
            <div className="text-2xl font-bold text-blue-600">{headerMetrics.measurementReliability}</div>
            <div className="text-xs text-blue-500 mt-1">MSA Score</div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-600 mb-1">Sigma Level</div>
            <div className="text-2xl font-bold text-purple-600">{headerMetrics.sigmaLevel}σ</div>
            <div className="text-xs text-purple-500 mt-1">Capability</div>
          </div>
        </div>

        {/* Baseline Synced Badge */}
        <div className="mt-3 flex items-center gap-2">
          <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-bold">
            <i className="ri-check-line mr-1"></i>
            Baseline synced to Define Phase
          </span>
          <span className="text-xs text-slate-500">
            Last refresh: {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-200">
          <div className="flex space-x-1 px-6 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: 'ri-dashboard-3-line' },
              { id: 'data-hub', label: 'Data Intelligence', icon: 'ri-database-2-line' },
              { id: 'msa', label: 'MSA Lab', icon: 'ri-ruler-line' },
              { id: 'baseline', label: 'Baseline Performance', icon: 'ri-line-chart-line' },
              { id: 'capability', label: 'Process Capability', icon: 'ri-bar-chart-box-line' },
              { id: 'variability', label: 'Variability Engine', icon: 'ri-pie-chart-line' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id as any)}
                className={`flex items-center space-x-2 px-6 py-4 font-semibold transition-all whitespace-nowrap ${
                  activePanel === tab.id
                    ? 'text-teal-600 border-b-2 border-teal-600'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className={`${tab.icon} text-lg`}></i>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-8">
          {/* Overview Panel */}
          {activePanel === 'overview' && (
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={handleRunMSA}
                  className="p-6 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-200 hover:shadow-lg transition-all text-left"
                >
                  <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                    <i className="ri-ruler-line text-white text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Run MSA Study</h3>
                  <p className="text-sm text-slate-600">Validate measurement system reliability</p>
                </button>

                <button
                  onClick={handleCalculateCapability}
                  className="p-6 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl border-2 border-teal-200 hover:shadow-lg transition-all text-left"
                >
                  <div className="w-12 h-12 bg-teal-600 rounded-lg flex items-center justify-center mb-4">
                    <i className="ri-bar-chart-box-line text-white text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Calculate Capability</h3>
                  <p className="text-sm text-slate-600">Assess process capability indices</p>
                </button>

                <button
                  onClick={handleRecalculateBaseline}
                  className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border-2 border-blue-200 hover:shadow-lg transition-all text-left"
                >
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
                    <i className="ri-refresh-line text-white text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Recalculate Baseline</h3>
                  <p className="text-sm text-slate-600">Update with latest measurements</p>
                </button>
              </div>

              {/* Measurement System Status */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Measurement System Status</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">Gage R&amp;R</span>
                      <i className="ri-check-line text-emerald-600"></i>
                    </div>
                    <div className="text-2xl font-bold text-emerald-600">15.2%</div>
                    <div className="text-xs text-emerald-600 mt-1">Acceptable</div>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">Repeatability</span>
                      <i className="ri-check-line text-blue-600"></i>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">8.5%</div>
                    <div className="text-xs text-blue-600 mt-1">Good</div>
                  </div>

                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">Reproducibility</span>
                      <i className="ri-check-line text-purple-600"></i>
                    </div>
                    <div className="text-2xl font-bold text-purple-600">6.7%</div>
                    <div className="text-xs text-purple-600 mt-1">Excellent</div>
                  </div>

                  <div className="p-4 bg-teal-50 rounded-lg border border-teal-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">NDC</span>
                      <i className="ri-check-line text-teal-600"></i>
                    </div>
                    <div className="text-2xl font-bold text-teal-600">8</div>
                    <div className="text-xs text-teal-600 mt-1">Adequate</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Data Intelligence Hub Panel */}
          {activePanel === 'data-hub' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Dataset Information */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Dataset Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700">Data Source</span>
                      <span className="font-semibold text-slate-900">{dataSource.name}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700">Source Type</span>
                      <span className="font-semibold text-slate-900">{dataSource.type}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700">Total Records</span>
                      <span className="font-semibold text-slate-900">{dataSource.records.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700">Total Columns</span>
                      <span className="font-semibold text-slate-900">{dataSource.columns}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700">Last Sync</span>
                      <span className="font-semibold text-slate-900">{new Date(dataSource.lastSync).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Automated Data Diagnostics */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Automated Diagnostics</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <span className="text-sm text-slate-700">Missing Values</span>
                      <span className="font-bold text-amber-600">{dataDiagnostics.missingValues}%</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <span className="text-sm text-slate-700">Duplicate Records</span>
                      <span className="font-bold text-emerald-600">{dataDiagnostics.duplicates}%</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-rose-50 rounded-lg border border-rose-200">
                      <span className="text-sm text-slate-700">Outliers Detected</span>
                      <span className="font-bold text-rose-600">{dataDiagnostics.outliers}%</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <span className="text-sm text-slate-700">Skewness</span>
                      <span className="font-bold text-blue-600">{dataDiagnostics.skewness}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <span className="text-sm text-slate-700">Timestamp Gaps</span>
                      <span className="font-bold text-purple-600">{dataDiagnostics.timestampGaps}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Quality Score */}
              <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl border-2 border-teal-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Data Quality Score</h3>
                  <div className="text-4xl font-bold text-teal-600">{dataQuality.overall}</div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3 mb-4">
                  <div 
                    className="bg-gradient-to-r from-teal-600 to-emerald-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${dataQuality.overall}%` }}
                  ></div>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {Object.entries(dataQuality).filter(([key]) => key !== 'overall').map(([key, value]) => (
                    <div key={key} className="text-center">
                      <div className="text-xs text-slate-600 mb-1 capitalize">{key}</div>
                      <div className={`text-lg font-bold ${getQualityColor(value)}`}>{value}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="ri-brain-line text-white text-2xl"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 mb-2">Sigma AI – Data Diagnostics</h4>
                    <p className="text-sm text-slate-700">
                      Data completeness at 94%. Moderate skew detected in appointment intervals. 
                      Missing value pattern suggests systematic data entry gaps during shift changes. 
                      Recommend implementing automated timestamp validation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MSA Lab Panel */}
          {activePanel === 'msa' && (
            <div className="space-y-6">
              {!selectedKPI ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
                  <i className="ri-focus-3-line text-6xl text-slate-400 mb-4"></i>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Select KPI/Metric First</h3>
                  <p className="text-slate-600 mb-6">Choose a measurement to validate with MSA study</p>
                  <button
                    onClick={() => setShowKPISelector(true)}
                    className="px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors"
                  >
                    <i className="ri-focus-3-line mr-2"></i>
                    Select KPI/Metric
                  </button>
                </div>
              ) : !msaResults ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="ri-ruler-line text-purple-600 text-4xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Ready to Run MSA Study</h3>
                  <p className="text-slate-600 mb-6">Validate measurement system for: <strong>{selectedKPI.name}</strong></p>
                  <button
                    onClick={handleRunMSA}
                    disabled={runningMSA}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {runningMSA ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Running MSA Study...
                      </>
                    ) : (
                      <>
                        <i className="ri-play-line mr-2"></i>
                        Run MSA Study
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* MSA Results Header */}
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 mb-1">MSA Results: {selectedKPI.name}</h3>
                        <p className="text-sm text-slate-600">Measurement System Analysis completed</p>
                      </div>
                      <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                        msaResults.gageRR < 10 ? 'bg-emerald-600 text-white' :
                        msaResults.gageRR < 30 ? 'bg-amber-600 text-white' :
                        'bg-rose-600 text-white'
                      }`}>
                        {msaResults.gageRR < 10 ? 'EXCELLENT' : msaResults.gageRR < 30 ? 'ACCEPTABLE' : 'NEEDS IMPROVEMENT'}
                      </span>
                    </div>
                  </div>

                  {/* Variance Components */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className={`p-6 rounded-xl border-2 ${
                      msaResults.gageRR < 10 ? 'bg-emerald-50 border-emerald-300' :
                      msaResults.gageRR < 30 ? 'bg-amber-50 border-amber-300' :
                      'bg-rose-50 border-rose-300'
                    }`}>
                      <div className="text-sm font-medium text-slate-700 mb-2">Gage R&amp;R</div>
                      <div className={`text-4xl font-bold mb-1 ${
                        msaResults.gageRR < 10 ? 'text-emerald-600' :
                        msaResults.gageRR < 30 ? 'text-amber-600' :
                        'text-rose-600'
                      }`}>{msaResults.gageRR}%</div>
                      <div className="text-xs text-slate-600">Total measurement variation</div>
                    </div>

                    <div className="p-6 bg-blue-50 rounded-xl border-2 border-blue-300">
                      <div className="text-sm font-medium text-slate-700 mb-2">Repeatability</div>
                      <div className="text-4xl font-bold text-blue-600 mb-1">{msaResults.repeatability}%</div>
                      <div className="text-xs text-slate-600">Equipment variation</div>
                    </div>

                    <div className="p-6 bg-purple-50 rounded-xl border-2 border-purple-300">
                      <div className="text-sm font-medium text-slate-700 mb-2">Reproducibility</div>
                      <div className="text-4xl font-bold text-purple-600 mb-1">{msaResults.reproducibility}%</div>
                      <div className="text-xs text-slate-600">Operator variation</div>
                    </div>

                    <div className="p-6 bg-teal-50 rounded-xl border-2 border-teal-300">
                      <div className="text-sm font-medium text-slate-700 mb-2">Part Variation</div>
                      <div className="text-4xl font-bold text-teal-600 mb-1">{msaResults.partVariation}%</div>
                      <div className="text-xs text-slate-600">True process variation</div>
                    </div>
                  </div>

                  {/* Variance Contribution Chart */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Variance Contribution</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={[
                        { component: 'Repeatability', value: msaResults.repeatability },
                        { component: 'Reproducibility', value: msaResults.reproducibility },
                        { component: 'Part Variation', value: msaResults.partVariation }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="component" stroke="#64748b" style={{ fontSize: '12px' }} />
                        <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#fff', 
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                          {[0, 1, 2].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : index === 1 ? '#a855f7' : '#14b8a6'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Operator Performance */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Operator Performance</h3>
                    <div className="space-y-3">
                      {msaResults.operators.map((op, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center font-bold text-indigo-700">
                              {op.name.charAt(op.name.length - 1)}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">{op.name}</div>
                              <div className="text-sm text-slate-600">Bias: {op.bias} | Variance: {op.variance}</div>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            Math.abs(op.bias) < 0.5 && op.variance < 2.5
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {Math.abs(op.bias) < 0.5 && op.variance < 2.5 ? 'GOOD' : 'NEEDS TRAINING'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* NDC Score */}
                  <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl border-2 border-teal-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Number of Distinct Categories (NDC)</h3>
                        <p className="text-sm text-slate-600">Ability to distinguish between different parts</p>
                      </div>
                      <div className="text-5xl font-bold text-teal-600">{msaResults.ndc}</div>
                    </div>
                    <div className={`p-4 rounded-lg ${
                      msaResults.ndc >= 5 ? 'bg-emerald-100 border border-emerald-300' : 'bg-rose-100 border border-rose-300'
                    }`}>
                      <p className={`text-sm font-medium ${msaResults.ndc >= 5 ? 'text-emerald-800' : 'text-rose-800'}`}>
                        {msaResults.ndc >= 5
                          ? '✓ Measurement system can adequately distinguish between different parts (NDC ≥ 5)'
                          : '✗ Measurement system cannot adequately distinguish between parts (NDC < 5)'}
                      </p>
                    </div>
                  </div>

                  {/* AI Insight */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i className="ri-brain-line text-white text-2xl"></i>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 mb-2">Sigma AI – MSA Interpretation</h4>
                        <p className="text-sm text-slate-700">
                          {msaResults.gageRR < 10 
                            ? 'Excellent measurement system. Less than 10% of variation comes from measurement error. System is highly reliable for process improvement work.'
                            : msaResults.gageRR < 30
                            ? 'Acceptable measurement system for most applications. Consider improvements if higher precision is needed for critical decisions.'
                            : 'Measurement variation exceeds 15%. Investigate intake coding consistency and operator training. Consider equipment calibration review.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Baseline Performance Panel */}
          {activePanel === 'baseline' && (
            <div className="space-y-6">
              {/* Statistical Summary */}
              <div className="grid grid-cols-6 gap-4">
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-600 mb-1">Mean</div>
                  <div className="text-2xl font-bold text-slate-900">{baselineStats.mean.toFixed(1)}</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-600 mb-1">Median</div>
                  <div className="text-2xl font-bold text-slate-900">{baselineStats.median.toFixed(1)}</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-600 mb-1">Std Dev</div>
                  <div className="text-2xl font-bold text-indigo-600">{baselineStats.stdDev.toFixed(1)}</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-600 mb-1">Variance</div>
                  <div className="text-2xl font-bold text-purple-600">{baselineStats.variance.toFixed(1)}</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-600 mb-1">Q1</div>
                  <div className="text-2xl font-bold text-teal-600">{baselineStats.q1.toFixed(1)}</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-600 mb-1">Q3</div>
                  <div className="text-2xl font-bold text-teal-600">{baselineStats.q3.toFixed(1)}</div>
                </div>
              </div>

              {/* Control Chart */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Control Chart (I-MR)</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Auto-detected chart type</span>
                    <button
                      onClick={handleRecalculateBaseline}
                      className="px-3 py-1 bg-teal-100 text-teal-700 rounded-lg text-xs font-semibold hover:bg-teal-200 transition-colors"
                    >
                      <i className="ri-refresh-line mr-1"></i>
                      Recalculate
                    </button>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={baselineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" stroke="#64748b" style={{ fontSize: '11px' }} />
                    <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Line type="monotone" dataKey="ucl" stroke="#ef4444" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="mean" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="lcl" stroke="#10b981" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="value" stroke="#14b8a6" strokeWidth={3} dot={{ fill: '#14b8a6', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>

                <div className="mt-4 flex items-center justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-rose-500"></div>
                    <span className="text-slate-600">UCL: {baselineStats.controlLimits.ucl.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-blue-500"></div>
                    <span className="text-slate-600">Mean: {baselineStats.mean.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-emerald-500"></div>
                    <span className="text-slate-600">LCL: {baselineStats.controlLimits.lcl.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* DPMO Calculator */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-rose-50 to-red-50 rounded-xl border-2 border-rose-200 p-6">
                  <div className="text-sm font-medium text-slate-700 mb-2">DPMO</div>
                  <div className="text-4xl font-bold text-rose-600 mb-1">12,500</div>
                  <div className="text-xs text-slate-600">Defects per million opportunities</div>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border-2 border-amber-200 p-6">
                  <div className="text-sm font-medium text-slate-700 mb-2">Defect Rate</div>
                  <div className="text-4xl font-bold text-amber-600 mb-1">1.25%</div>
                  <div className="text-xs text-slate-600">Out of specification</div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-200 p-6">
                  <div className="text-sm font-medium text-slate-700 mb-2">Financial Leakage</div>
                  <div className="text-4xl font-bold text-emerald-600 mb-1">$850K</div>
                  <div className="text-xs text-slate-600">Annual cost estimate</div>
                </div>
              </div>
            </div>
          )}

          {/* Process Capability Panel */}
          {activePanel === 'capability' && (
            <div className="space-y-6">
              {!capabilityResults ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="ri-bar-chart-box-line text-teal-600 text-4xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Calculate Process Capability</h3>
                  <p className="text-slate-600 mb-6">Assess if your process can meet specifications</p>
                  
                  {/* Spec Limits Input */}
                  <div className="max-w-md mx-auto mb-6">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">LSL</label>
                        <input
                          type="number"
                          value={specLimits.lsl}
                          onChange={(e) => setSpecLimits({ ...specLimits, lsl: parseFloat(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Target</label>
                        <input
                          type="number"
                          value={specLimits.target}
                          onChange={(e) => setSpecLimits({ ...specLimits, target: parseFloat(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">USL</label>
                        <input
                          type="number"
                          value={specLimits.usl}
                          onChange={(e) => setSpecLimits({ ...specLimits, usl: parseFloat(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleCalculateCapability}
                    className="px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors"
                  >
                    <i className="ri-calculator-line mr-2"></i>
                    Calculate Capability
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Capability Status */}
                  <div className={`rounded-xl border-2 p-6 ${getCapabilityColor(capabilityResults.status)}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold mb-1">
                          {capabilityResults.status === 'capable' ? 'Process is Capable' :
                           capabilityResults.status === 'marginal' ? 'Process is Marginal' :
                           'Process is Incapable'}
                        </h3>
                        <p className="text-sm">
                          {capabilityResults.status === 'capable' ? 'Process can consistently meet specifications' :
                           capabilityResults.status === 'marginal' ? 'Process barely meets specifications' :
                           'Process cannot meet specifications consistently'}
                        </p>
                      </div>
                      <div className="text-6xl font-bold">
                        {capabilityResults.cpk}
                      </div>
                    </div>
                  </div>

                  {/* Capability Indices */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg border border-slate-200 p-6">
                      <div className="text-sm text-slate-600 mb-1">Cp</div>
                      <div className="text-3xl font-bold text-slate-900 mb-1">{capabilityResults.cp}</div>
                      <div className="text-xs text-slate-600">Potential capability</div>
                    </div>

                    <div className="bg-white rounded-lg border border-slate-200 p-6">
                      <div className="text-sm text-slate-600 mb-1">Cpk</div>
                      <div className="text-3xl font-bold text-teal-600 mb-1">{capabilityResults.cpk}</div>
                      <div className="text-xs text-slate-600">Actual capability</div>
                    </div>

                    <div className="bg-white rounded-lg border border-slate-200 p-6">
                      <div className="text-sm text-slate-600 mb-1">Pp</div>
                      <div className="text-3xl font-bold text-slate-900 mb-1">{capabilityResults.pp}</div>
                      <div className="text-xs text-slate-600">Performance potential</div>
                    </div>

                    <div className="bg-white rounded-lg border border-slate-200 p-6">
                      <div className="text-sm text-slate-600 mb-1">Ppk</div>
                      <div className="text-3xl font-bold text-slate-900 mb-1">{capabilityResults.ppk}</div>
                      <div className="text-xs text-slate-600">Performance actual</div>
                    </div>
                  </div>

                  {/* Sigma Level & Yield */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-200 p-6">
                      <div className="text-sm font-medium text-slate-700 mb-2">Sigma Level</div>
                      <div className="text-5xl font-bold text-purple-600 mb-1">{capabilityResults.sigmaLevel}σ</div>
                      <div className="text-xs text-slate-600">Process capability</div>
                    </div>

                    <div className="bg-gradient-to-br from-rose-50 to-red-50 rounded-xl border-2 border-rose-200 p-6">
                      <div className="text-sm font-medium text-slate-700 mb-2">DPMO</div>
                      <div className="text-5xl font-bold text-rose-600 mb-1">{capabilityResults.dpmo.toLocaleString()}</div>
                      <div className="text-xs text-slate-600">Defects per million</div>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-200 p-6">
                      <div className="text-sm font-medium text-slate-700 mb-2">Yield</div>
                      <div className="text-5xl font-bold text-emerald-600 mb-1">{capabilityResults.yield}%</div>
                      <div className="text-xs text-slate-600">Within specification</div>
                    </div>
                  </div>

                  {/* AI Interpretation */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i className="ri-brain-line text-white text-2xl"></i>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 mb-2">Sigma AI – Capability Interpretation</h4>
                        <p className="text-sm text-slate-700">
                          {capabilityResults.status === 'capable'
                            ? `Excellent process capability (Cpk = ${capabilityResults.cpk}). Process is stable and consistently meets specifications. Continue monitoring to maintain performance.`
                            : capabilityResults.status === 'marginal'
                            ? `Marginal capability (Cpk = ${capabilityResults.cpk}). Process meets specifications but has little margin for error. Consider process improvements to increase robustness.`
                            : `Current Cpk of ${capabilityResults.cpk} indicates process incapable of meeting target threshold. Immediate action required: reduce variation or adjust specifications.`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Variability & Segmentation Panel */}
          {activePanel === 'variability' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Variability Heatmap</h3>
                <select
                  value={segmentBy}
                  onChange={(e) => setSegmentBy(e.target.value)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium"
                >
                  <option value="department">By Department</option>
                  <option value="shift">By Shift</option>
                  <option value="day">By Day of Week</option>
                  <option value="provider">By Provider</option>
                </select>
              </div>

              {/* Variability Heatmap */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="grid grid-cols-4 gap-3">
                  {variabilityData.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border-2 transition-all hover:shadow-lg cursor-pointer"
                      style={{
                        backgroundColor: `rgba(239, 68, 68, ${item.variance / 20})`,
                        borderColor: item.variance > 15 ? '#ef4444' : item.variance > 10 ? '#f59e0b' : '#10b981'
                      }}
                    >
                      <div className="font-semibold text-slate-900 mb-1">{item.department}</div>
                      <div className="text-xs text-slate-600 mb-2">{item.shift}</div>
                      <div className="text-lg font-bold text-slate-900">{item.avgWaitTime.toFixed(1)} min</div>
                      <div className="text-xs text-slate-600">Variance: {item.variance.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-emerald-500 rounded"></div>
                  <span className="text-slate-600">Low Variance (&lt;10%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-amber-500 rounded"></div>
                  <span className="text-slate-600">Medium Variance (10-15%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-rose-500 rounded"></div>
                  <span className="text-slate-600">High Variance (&gt;15%)</span>
                </div>
              </div>

              {/* Top Variability Sources */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Top Variability Sources</h3>
                <div className="space-y-3">
                  {variabilityData
                    .sort((a, b) => b.variance - a.variance)
                    .slice(0, 5)
                    .map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <div className="font-semibold text-slate-900">{item.department} - {item.shift}</div>
                          <div className="text-sm text-slate-600">Avg: {item.avgWaitTime.toFixed(1)} min</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-rose-600">{item.variance.toFixed(1)}%</div>
                          <div className="text-xs text-slate-600">Variance</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="ri-brain-line text-white text-2xl"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 mb-2">Sigma AI – Variability Analysis</h4>
                    <p className="text-sm text-slate-700">
                      Emergency department shows highest variability during evening shifts (18.2%). 
                      This pattern feeds directly into Analyze phase driver modeling. Recommend investigating 
                      staffing patterns and patient acuity during these periods.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI Selector Modal */}
      {showKPISelector && organization?.id && (
        <KPISelector
          organizationId={organization.id}
          selectedKPI={selectedKPI}
          onKPIChange={(kpi) => {
            if (kpi) {
              setSelectedKPI({
                ...kpi,
                type: Object.prototype.hasOwnProperty.call(kpi, 'frequency') ? 'kpi' : 'metric'
              });
            }
          }}
          onClose={() => setShowKPISelector(false)}
        />
      )}
    </div>
  );
};
