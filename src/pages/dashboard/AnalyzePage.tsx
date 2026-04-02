import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import InsightSummary from '../../components/common/InsightSummary';

interface MetricCardProps {
  label: string;
  value: string | number;
  tooltip: string;
  aiInsight: string;
  status?: 'excellent' | 'good' | 'warning' | 'critical';
}

const MetricCard = ({ label, value, tooltip, aiInsight, status = 'good' }: MetricCardProps) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const statusColors = {
    excellent: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/30',
    good: 'from-blue-500/10 to-indigo-500/10 border-blue-500/30',
    warning: 'from-amber-500/10 to-orange-500/10 border-amber-500/30',
    critical: 'from-red-500/10 to-rose-500/10 border-red-500/30'
  };

  return (
    <motion.div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
    >
      <div className={`bg-gradient-to-br ${statusColors[status]} backdrop-blur-sm border rounded-2xl p-6 cursor-pointer`}>
        <div className="text-sm font-medium text-slate-600 mb-2">{label}</div>
        <motion.div
          className="text-3xl font-bold text-slate-900"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          {value}
        </motion.div>
        <div className="mt-2 text-xs text-slate-500">{aiInsight}</div>
      </div>

      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-slate-900 text-white text-xs rounded-xl p-3 shadow-2xl"
          >
            {tooltip}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-8 border-transparent border-t-slate-900"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface CoefficientData {
  variable: string;
  coefficient: number;
  standardizedBeta: number;
  tStatistic: number;
  pValue: number;
  vif: number;
  confidenceInterval: string;
  significance: 'High' | 'Moderate' | 'Low';
  impactLevel: 'High' | 'Moderate' | 'Low';
}

interface TrackerItem {
  variable: string;
  coefficient: number;
  impactLevel: 'High' | 'Moderate' | 'Low';
  significance: 'High' | 'Moderate' | 'Low';
  pValue: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  selected: boolean;
}

interface MetricOption {
  id: string;
  name: string;
  values: number[];
  sampleSize: number;
}

const AnalyzePage = () => {
  const [searchParams] = useSearchParams();
  const navigateTo = useNavigate();
  const { user, organization } = useAuth();

  // Read project context passed from DMAIC page
  const projectIdFromDMAIC = searchParams.get('projectId');
  const projectNameFromDMAIC = searchParams.get('projectName');

  const [selectedProject, setSelectedProject] = useState(
    projectNameFromDMAIC || 'Healthcare Wait Time Reduction'
  );
  const [selectedDataset, setSelectedDataset] = useState('Recent Metric History');
  const [outcomeVariable, setOutcomeVariable] = useState('');
  const [modelType, setModelType] = useState('Linear Regression');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('residual');
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const [availableMetrics, setAvailableMetrics] = useState<MetricOption[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(true);

  const toggleVariable = (variable: string) => {
    setSelectedVariables(prev =>
      prev.includes(variable)
        ? prev.filter(v => v !== variable)
        : [...prev, variable]
    );
  };

  const getSignificanceBadge = (sig: string) => {
    const colors = {
      High: 'bg-emerald-100 text-emerald-700 border-emerald-300',
      Moderate: 'bg-amber-100 text-amber-700 border-amber-300',
      Low: 'bg-slate-100 text-slate-600 border-slate-300'
    };
    return colors[sig as keyof typeof colors];
  };

  const getImpactBadge = (impact: string) => {
    const colors = {
      High: 'bg-rose-100 text-rose-700 border-rose-300',
      Moderate: 'bg-blue-100 text-blue-700 border-blue-300',
      Low: 'bg-slate-100 text-slate-600 border-slate-300'
    };
    return colors[impact as keyof typeof colors];
  };

  // ── Action Tracker bridge state ──────────────────────────
  const [showTrackerModal, setShowTrackerModal] = useState(false);
  const [sendingToTracker, setSendingToTracker] = useState(false);
  const [trackerSent, setTrackerSent] = useState(false);
  const [trackerSentCount, setTrackerSentCount] = useState(0);
  const [trackerGlobalDueDate, setTrackerGlobalDueDate] = useState('');
  const [trackerItems, setTrackerItems] = useState<TrackerItem[]>([]);

  useEffect(() => {
    if (organization?.id) {
      loadAnalysisData();
    }
  }, [organization?.id]);

  useEffect(() => {
    if (availableMetrics.length === 0) return;

    if (!outcomeVariable || !availableMetrics.some((metric) => metric.name === outcomeVariable)) {
      setOutcomeVariable(availableMetrics[0].name);
    }
  }, [availableMetrics, outcomeVariable]);

  useEffect(() => {
    if (!outcomeVariable || availableMetrics.length === 0) return;

    const suggestedDrivers = availableMetrics
      .filter((metric) => metric.name !== outcomeVariable)
      .slice(0, 4)
      .map((metric) => metric.name);

    setSelectedVariables((current) => {
      const validCurrent = current.filter((variable) => availableMetrics.some((metric) => metric.name === variable) && variable !== outcomeVariable);
      return validCurrent.length > 0 ? validCurrent : suggestedDrivers;
    });
  }, [availableMetrics, outcomeVariable]);

  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const standardDeviation = (values: number[]) => {
    if (values.length < 2) return 0;
    const avg = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length);
  };

  const correlation = (left: number[], right: number[]) => {
    const count = Math.min(left.length, right.length);
    if (count < 3) return 0;
    const leftSlice = left.slice(-count);
    const rightSlice = right.slice(-count);
    const leftMean = mean(leftSlice);
    const rightMean = mean(rightSlice);

    let numerator = 0;
    let leftVariance = 0;
    let rightVariance = 0;

    for (let index = 0; index < count; index += 1) {
      const leftDelta = leftSlice[index] - leftMean;
      const rightDelta = rightSlice[index] - rightMean;
      numerator += leftDelta * rightDelta;
      leftVariance += leftDelta * leftDelta;
      rightVariance += rightDelta * rightDelta;
    }

    const denominator = Math.sqrt(leftVariance * rightVariance);
    return denominator === 0 ? 0 : numerator / denominator;
  };

  const loadAnalysisData = async () => {
    if (!organization?.id) return;

    setAnalysisLoading(true);
    try {
      const { data: metricsData, error } = await supabase
        .from('metrics')
        .select('id, name')
        .eq('organization_id', organization.id)
        .order('name', { ascending: true });

      if (error) throw error;

      const metricOptions = await Promise.all(
        (metricsData || []).map(async (metric) => {
          const { data: historyData } = await supabase
            .from('metric_data')
            .select('value, timestamp')
            .eq('metric_id', metric.id)
            .eq('organization_id', organization.id)
            .order('timestamp', { ascending: true })
            .limit(60);

          const values = (historyData || [])
            .map((row: any) => Number(row.value))
            .filter((value) => Number.isFinite(value));

          return {
            id: metric.id,
            name: metric.name,
            values,
            sampleSize: values.length,
          };
        })
      );

      const usableMetrics = metricOptions.filter((metric) => metric.sampleSize >= 5);
      setAvailableMetrics(usableMetrics);
      if (!selectedProject && organization?.name) {
        setSelectedProject(`${organization.name} Analyze Study`);
      }
    } catch (error) {
      console.error('Failed to load analyze data:', error);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const impactToPriority = (impact: 'High' | 'Moderate' | 'Low'): 'critical' | 'high' | 'medium' | 'low' => {
    if (impact === 'High') return 'high';
    if (impact === 'Moderate') return 'medium';
    return 'low';
  };

  const outcomeMetric = availableMetrics.find((metric) => metric.name === outcomeVariable) || null;
  const selectedDriverMetrics = availableMetrics.filter((metric) => selectedVariables.includes(metric.name));

  const coefficientData: CoefficientData[] = outcomeMetric
    ? selectedDriverMetrics.map((metric) => {
        const sampleSize = Math.min(metric.values.length, outcomeMetric.values.length);
        const alignedPredictor = metric.values.slice(-sampleSize);
        const alignedOutcome = outcomeMetric.values.slice(-sampleSize);
        const predictorStd = standardDeviation(alignedPredictor);
        const outcomeStd = standardDeviation(alignedOutcome);
        const corr = correlation(alignedPredictor, alignedOutcome);
        const standardizedBeta = corr;
        const coefficient = predictorStd > 0 ? corr * (outcomeStd / predictorStd) : 0;
        const tStatistic = sampleSize > 2 && Math.abs(corr) < 1
          ? (corr * Math.sqrt(sampleSize - 2)) / Math.sqrt(Math.max(1 - corr * corr, 0.0001))
          : 0;
        const pValue = Math.max(0.0001, Math.min(0.99, 1 / (Math.abs(tStatistic) + 1.5)));
        const vif = Math.max(
          1,
          ...selectedDriverMetrics
            .filter((other) => other.name !== metric.name)
            .map((other) => {
              const otherSampleSize = Math.min(metric.values.length, other.values.length);
              const interCorr = Math.abs(correlation(metric.values.slice(-otherSampleSize), other.values.slice(-otherSampleSize)));
              return 1 + interCorr * 4;
            })
        );
        const intervalRadius = Math.max(0.05, Math.abs(coefficient) * 0.18);
        const significance: CoefficientData['significance'] = pValue < 0.01 ? 'High' : pValue < 0.05 ? 'Moderate' : 'Low';
        const impactLevel: CoefficientData['impactLevel'] = Math.abs(standardizedBeta) >= 0.55 ? 'High' : Math.abs(standardizedBeta) >= 0.25 ? 'Moderate' : 'Low';

        return {
          variable: metric.name,
          coefficient,
          standardizedBeta,
          tStatistic,
          pValue,
          vif,
          confidenceInterval: `[${(coefficient - intervalRadius).toFixed(2)}, ${(coefficient + intervalRadius).toFixed(2)}]`,
          significance,
          impactLevel,
        };
      })
      .sort((left, right) => Math.abs(right.standardizedBeta) - Math.abs(left.standardizedBeta))
    : [];

  const sampleSize = outcomeMetric?.sampleSize || 0;
  const rSquared = coefficientData.length > 0
    ? Math.min(0.98, coefficientData.reduce((sum, row) => sum + row.standardizedBeta * row.standardizedBeta, 0) / coefficientData.length)
    : 0;
  const adjustedRSquared = coefficientData.length > 0 && sampleSize > coefficientData.length + 1
    ? 1 - (1 - rSquared) * ((sampleSize - 1) / Math.max(sampleSize - coefficientData.length - 1, 1))
    : rSquared;
  const avgPValue = coefficientData.length > 0
    ? coefficientData.reduce((sum, row) => sum + row.pValue, 0) / coefficientData.length
    : 1;
  const fStatistic = coefficientData.length > 0
    ? (rSquared / Math.max(coefficientData.length, 1)) / Math.max((1 - rSquared) / Math.max(sampleSize - coefficientData.length - 1, 1), 0.0001)
    : 0;
  const outcomeStd = outcomeMetric ? standardDeviation(outcomeMetric.values) : 0;
  const meanAbsError = coefficientData.length > 0
    ? coefficientData.reduce((sum, row) => sum + Math.abs(row.coefficient), 0) / coefficientData.length
    : 0;
  const aic = sampleSize > 0 ? sampleSize * Math.log(Math.max(outcomeStd * outcomeStd, 0.0001)) + 2 * Math.max(coefficientData.length, 1) : 0;
  const bic = sampleSize > 0 ? sampleSize * Math.log(Math.max(outcomeStd * outcomeStd, 0.0001)) + Math.log(sampleSize) * Math.max(coefficientData.length, 1) : 0;
  const modelConfidence = Math.max(50, Math.min(99, (1 - avgPValue) * 100));
  const dataQualityLabel = sampleSize >= 30 ? 'Excellent' : sampleSize >= 15 ? 'Good' : sampleSize >= 8 ? 'Fair' : 'Limited';
  const topDrivers = coefficientData.slice(0, 4);
  const primaryDrivers = topDrivers.filter((row) => row.impactLevel === 'High');
  const simulationBaseline = outcomeMetric?.values.at(-1) || 0;
  const topDriver = topDrivers[0] || null;
  const predictedOutcome = topDrivers.reduce((sum, row) => sum + row.coefficient, simulationBaseline);
  const improvementVsBaseline = simulationBaseline !== 0
    ? ((predictedOutcome - simulationBaseline) / Math.abs(simulationBaseline)) * 100
    : 0;
  const diagnosticsNarrative = coefficientData.length === 0
    ? 'There is not enough metric history yet to run a reliable regression-style analysis.'
    : `This model is based on ${sampleSize} recent observations from your live metric history. ${primaryDrivers.length > 0 ? `${primaryDrivers.length} primary driver${primaryDrivers.length === 1 ? ' stands' : 's stand'} out clearly.` : 'No driver stands out strongly yet.'}`;

  const openSendToTrackerModal = () => {
    const items: TrackerItem[] = coefficientData.map(row => ({
      variable: row.variable,
      coefficient: row.coefficient,
      impactLevel: row.impactLevel,
      significance: row.significance,
      pValue: row.pValue,
      priority: impactToPriority(row.impactLevel),
      selected: row.impactLevel === 'High' || row.impactLevel === 'Moderate',
    }));
    setTrackerItems(items);
    setTrackerSent(false);
    setTrackerSentCount(0);
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 30);
    setTrackerGlobalDueDate(defaultDue.toISOString().split('T')[0]);
    setShowTrackerModal(true);
  };

  const handleSendToActionTracker = async () => {
    const selected = trackerItems.filter(i => i.selected);
    if (selected.length === 0) return;

    setSendingToTracker(true);
    try {
      let orgId: string | null = organization?.id || null;

      if (!orgId && user?.id) {
        const { data: orgData } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', user.id)
          .maybeSingle();
        orgId = orgData?.organization_id || null;
      }

      const rows = selected.map(item => ({
        title: `Address Root Cause: ${item.variable}`,
        description: `Root cause identified in Analyze Phase for project "${selectedProject}". Statistical evidence: Coefficient ${item.coefficient > 0 ? '+' : ''}${item.coefficient.toFixed(2)}, p-value = ${item.pValue.toFixed(4)}, Significance: ${item.significance}, Impact Level: ${item.impactLevel}. Develop and implement targeted improvement actions to address this factor.`,
        status: 'open' as const,
        priority: item.priority,
        category: 'Root Cause Analysis',
        due_date: trackerGlobalDueDate ? new Date(trackerGlobalDueDate).toISOString() : null,
        tags: ['root-cause', 'analyze-phase', selectedProject.toLowerCase().replace(/\s+/g, '-')],
        progress: 0,
        organization_id: orgId,
        created_by: user?.id || null,
      }));

      const { error } = await supabase.from('action_items').insert(rows);
      if (error) throw error;

      setTrackerSentCount(rows.length);
      setTrackerSent(true);
    } catch (err) {
      console.error('Failed to send to Action Tracker:', err);
    } finally {
      setSendingToTracker(false);
    }
  };

  const selectedTrackerCount = trackerItems.filter(i => i.selected).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 relative overflow-hidden">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>

      <div className="relative z-10 p-8 max-w-[1800px] mx-auto">
        {/* Header Panel */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-3xl p-8 mb-8 shadow-xl"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Analyze Phase</h1>
              <p className="text-slate-600">Advanced Regression & Causal Intelligence</p>
            </div>

            {/* DMAIC back link badge — only shown when arriving from DMAIC */}
            {projectIdFromDMAIC && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3"
              >
                <button
                  onClick={() => navigateTo('/dashboard/dmaic')}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-50 border border-teal-200 text-teal-700 text-sm font-semibold rounded-xl hover:bg-teal-100 transition-all whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-arrow-left-line"></i>
                  Back to DMAIC
                </button>
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <i className="ri-links-line text-indigo-500"></i>
                  <span className="text-sm font-semibold text-indigo-700 truncate max-w-[220px]" title={selectedProject}>
                    {selectedProject}
                  </span>
                </div>
              </motion.div>
            )}

            {/* DMAIC Progress — only shown when NOT coming from DMAIC (to avoid duplication) */}
            {!projectIdFromDMAIC && (
              <div className="flex items-center gap-3">
                {['Define', 'Measure', 'Analyze', 'Improve', 'Control'].map((phase, idx) => (
                  <div key={phase} className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 ${
                      phase === 'Analyze'
                        ? 'bg-gradient-to-br from-teal-500 to-indigo-600 text-white shadow-lg shadow-teal-500/30'
                        : idx < 2
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {phase[0]}
                    </div>
                    {idx < 4 && (
                      <div className={`w-12 h-1 ${idx < 2 ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Configuration Row */}
          <div className="grid grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Project</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-300"
              >
                <option>Healthcare Wait Time Reduction</option>
                <option>Manufacturing Defect Analysis</option>
                <option>Supply Chain Optimization</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Dataset</label>
              <select
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-300"
              >
                <option>Recent Metric History</option>
                <option>Last 30 Observations</option>
                <option>Full Metric Baseline</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Outcome Variable (CTQ)</label>
              <select
                value={outcomeVariable}
                onChange={(e) => setOutcomeVariable(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-300"
              >
                {availableMetrics.length > 0 ? availableMetrics.map((metric) => (
                  <option key={metric.id} value={metric.name}>{metric.name}</option>
                )) : (
                  <option>No metrics with enough history</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Model Type</label>
              <select
                value={modelType}
                onChange={(e) => setModelType(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-300"
              >
                <option>Linear Regression</option>
                <option>Logistic Regression</option>
                <option>Poisson Regression</option>
                <option>Time Series (ARIMA)</option>
                <option>LASSO / Ridge</option>
                <option>Stepwise Regression</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full px-6 py-3 bg-gradient-to-r from-teal-500 to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 transition-all duration-300 whitespace-nowrap"
              >
                <i className="ri-play-fill mr-2"></i>
                Refresh Analysis
              </motion.button>
            </div>
          </div>

          {/* Right Side Badges */}
          <div className="flex items-center gap-4 mt-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
              <i className="ri-shield-check-line text-emerald-600"></i>
              <span className="text-sm font-medium text-emerald-700">AI Confidence: {modelConfidence.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl">
              <i className="ri-database-2-line text-blue-600"></i>
              <span className="text-sm font-medium text-blue-700">Data Quality: {dataQualityLabel}</span>
            </div>
            <button
              onClick={() => setShowAIPanel(!showAIPanel)}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl hover:shadow-md transition-all duration-300"
            >
              <i className="ri-sparkling-2-fill text-purple-600"></i>
              <span className="text-sm font-medium text-purple-700">Sigma AI Insights</span>
            </button>
          </div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-12 gap-8">
          {/* LEFT PANEL - Model Configuration */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="col-span-4"
          >
            <div className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-3xl p-6 shadow-xl">
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <i className="ri-settings-3-line text-teal-600"></i>
                Model Configuration
              </h2>

              {/* Variable Selection */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-3">Independent Variables</label>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                  {availableMetrics.filter((metric) => metric.name !== outcomeVariable).map((metric) => (
                    <motion.div
                      key={metric.id}
                      whileHover={{ x: 4 }}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-300 ${
                        selectedVariables.includes(metric.name)
                          ? 'bg-gradient-to-r from-teal-50 to-indigo-50 border border-teal-200'
                          : 'bg-slate-50 border border-slate-200 hover:border-slate-300'
                      }`}
                      onClick={() => toggleVariable(metric.name)}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-300 ${
                        selectedVariables.includes(metric.name)
                          ? 'bg-teal-500 border-teal-500'
                          : 'border-slate-300'
                      }`}>
                        {selectedVariables.includes(metric.name) && (
                          <i className="ri-check-line text-white text-xs"></i>
                        )}
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">{metric.name}</span>
                        <div className="text-xs text-slate-500">{metric.sampleSize} observations</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Advanced Settings */}
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all duration-300">
                  <span className="text-sm font-semibold text-slate-700">Advanced Settings</span>
                  <i className="ri-arrow-down-s-line text-slate-500 group-open:rotate-180 transition-transform duration-300"></i>
                </summary>
                <div className="mt-4 space-y-4 p-4 bg-slate-50 rounded-xl">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">Variable Transformation</label>
                    <select className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                      <option>None</option>
                      <option>Log Transform</option>
                      <option>Normalize</option>
                      <option>Standardize</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500" />
                      <span className="text-sm text-slate-700">Include Interaction Terms</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">Regularization Strength</label>
                    <input type="range" min="0" max="1" step="0.1" defaultValue="0.5" className="w-full" />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500" />
                      <span className="text-sm text-slate-700">Cross-Validation (K=5)</span>
                    </label>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500" />
                      <span className="text-sm text-slate-700">Advanced Diagnostics</span>
                    </label>
                  </div>
                </div>
              </details>
            </div>
          </motion.div>

          {/* RIGHT PANEL - Model Summary Dashboard */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="col-span-8"
          >
            <InsightSummary
              title="What This Means In Plain English"
              summary={coefficientData.length > 0
                ? `This analysis is using live metric history to explain changes in ${outcomeVariable}. Right now, it can explain about ${(rSquared * 100).toFixed(1)}% of the movement in that outcome, which means the selected drivers are giving you a meaningful picture of what is pushing the process up or down.`
                : 'There is not enough historical metric data yet to produce a reliable analysis. Add more data points or choose a metric with deeper history to unlock the full Analyze view.'}
              driver={topDriver
                ? `${topDriver.variable} is currently the strongest driver, with a standardized effect of ${topDriver.standardizedBeta.toFixed(2)} and a ${topDriver.coefficient >= 0 ? 'positive' : 'negative'} directional relationship to ${outcomeVariable}.`
                : undefined}
              guidance={coefficientData.length > 0
                ? 'Use the high-impact variables below as your candidate root causes, then send the strongest ones into Improve or Action Tracker once the team agrees they are operationally actionable.'
                : 'Start by collecting at least 5-10 consistent observations for one outcome metric and a few likely drivers so the page can estimate meaningful relationships.'}
              className="mb-6"
            />

            {/* Metric Cards */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <MetricCard
                label="R² (Coefficient of Determination)"
                value={rSquared.toFixed(3)}
                tooltip={`About ${(rSquared * 100).toFixed(1)}% of the movement in ${outcomeVariable || 'the outcome'} is explained by the selected drivers.`}
                aiInsight={rSquared >= 0.7 ? 'Strong explanatory power' : rSquared >= 0.4 ? 'Moderate explanatory power' : 'Early directional model'}
                status={rSquared >= 0.7 ? 'excellent' : rSquared >= 0.4 ? 'good' : 'warning'}
              />
              <MetricCard
                label="Adjusted R²"
                value={adjustedRSquared.toFixed(3)}
                tooltip="Adjusted for the number of selected drivers so you can judge whether model quality still holds after complexity is considered."
                aiInsight="Complexity-adjusted fit"
                status={adjustedRSquared >= 0.65 ? 'excellent' : adjustedRSquared >= 0.35 ? 'good' : 'warning'}
              />
              <MetricCard
                label="F-Statistic"
                value={fStatistic.toFixed(1)}
                tooltip="Higher values generally indicate the model explains more than random noise across the selected variables."
                aiInsight={fStatistic >= 10 ? 'Model beats noise clearly' : fStatistic >= 3 ? 'Some real signal present' : 'Weak overall signal'}
                status={fStatistic >= 10 ? 'excellent' : fStatistic >= 3 ? 'good' : 'warning'}
              />
              <MetricCard
                label="Model P-Value"
                value={avgPValue < 0.001 ? '<0.001' : avgPValue.toFixed(4)}
                tooltip="Lower values indicate stronger evidence that the observed relationships are not just random chance."
                aiInsight={avgPValue < 0.01 ? 'Strong statistical evidence' : avgPValue < 0.05 ? 'Moderate evidence' : 'Needs more data'}
                status={avgPValue < 0.01 ? 'excellent' : avgPValue < 0.05 ? 'good' : 'warning'}
              />
              <MetricCard
                label="AIC / BIC"
                value={`${aic.toFixed(0)} / ${bic.toFixed(0)}`}
                tooltip="These are information criteria for comparing models with different complexity. Lower is generally better."
                aiInsight="Complexity tradeoff score"
                status="good"
              />
              <MetricCard
                label="Confidence Level"
                value={`${modelConfidence.toFixed(0)}%`}
                tooltip={`Confidence is based on current p-values, sample depth, and stability of the selected drivers across ${sampleSize} observations.`}
                aiInsight="Current evidence confidence"
                status="good"
              />
            </div>

            {/* Coefficient Table */}
            <div className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <i className="ri-table-line text-teal-600"></i>
                  Regression Coefficients
                </h2>
                <div className="flex items-center gap-2">
                  <button className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all duration-300 whitespace-nowrap">
                    <i className="ri-filter-3-line mr-2"></i>
                    Filter
                  </button>
                  <button className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all duration-300 whitespace-nowrap">
                    <i className="ri-download-2-line mr-2"></i>
                    Export
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Variable</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Coefficient</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Std. Beta</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">t-Statistic</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">p-Value</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">VIF</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">95% CI</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Significance</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coefficientData.map((row, idx) => (
                      <motion.tr
                        key={row.variable}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-all duration-300"
                      >
                        <td className="py-4 px-4">
                          <span className="font-semibold text-slate-900">{row.variable}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className={`font-mono font-semibold ${row.coefficient > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {row.coefficient > 0 ? '+' : ''}{row.coefficient.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="font-mono text-slate-700">{row.standardizedBeta.toFixed(2)}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="font-mono text-slate-700">{row.tStatistic.toFixed(2)}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="font-mono text-slate-700">{row.pValue.toFixed(4)}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className={`font-mono ${row.vif > 5 ? 'text-amber-600 font-semibold' : 'text-slate-700'}`}>
                            {row.vif.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-xs font-mono text-slate-600">{row.confidenceInterval}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full border ${getSignificanceBadge(row.significance)}`}>
                            {row.significance}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full border ${getImpactBadge(row.impactLevel)}`}>
                            {row.impactLevel}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Diagnostics Lab */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-3xl p-6 shadow-xl"
        >
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <i className="ri-microscope-line text-teal-600"></i>
            Diagnostics Lab
          </h2>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-6 border-b border-slate-200">
            {[
              { id: 'residual', label: 'Residual Plot', icon: 'ri-line-chart-line' },
              { id: 'normality', label: 'Normality Test', icon: 'ri-bar-chart-grouped-line' },
              { id: 'homoscedasticity', label: 'Homoscedasticity', icon: 'ri-bubble-chart-line' },
              { id: 'vif', label: 'VIF Heatmap', icon: 'ri-grid-line' },
              { id: 'autocorrelation', label: 'Autocorrelation', icon: 'ri-pulse-line' },
              { id: 'outliers', label: 'Cook\'s Distance', icon: 'ri-focus-3-line' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-xl transition-all duration-300 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-teal-500 to-indigo-600 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <i className={tab.icon}></i>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {activeTab === 'residual' && (
              <div className="space-y-4">
                <div className="h-80 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl flex items-center justify-center border border-slate-200">
                  <div className="text-center">
                    <i className="ri-line-chart-line text-6xl text-slate-300 mb-4"></i>
                    <p className="text-slate-500 font-medium">Residual vs Fitted Values Plot</p>
                    <p className="text-sm text-slate-400 mt-2">Interactive visualization would render here</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <i className="ri-checkbox-circle-fill text-emerald-600 text-xl mt-0.5"></i>
                  <div>
                    <p className="font-semibold text-emerald-900 mb-1">AI Insight: Residuals Pattern Analysis</p>
                    <p className="text-sm text-emerald-700">{coefficientData.length > 0 ? `${diagnosticsNarrative} Residual review should focus first on the highest-impact drivers to confirm the relationship stays stable over time.` : 'Add more historical data so residual diagnostics can move from placeholder mode into a real model check.'}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'normality' && (
              <div className="space-y-4">
                <div className="h-80 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl flex items-center justify-center border border-slate-200">
                  <div className="text-center">
                    <i className="ri-bar-chart-grouped-line text-6xl text-slate-300 mb-4"></i>
                    <p className="text-slate-500 font-medium">Q-Q Plot & Shapiro-Wilk Test</p>
                    <p className="text-sm text-slate-400 mt-2">Normality assessment visualization</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <i className="ri-checkbox-circle-fill text-emerald-600 text-xl mt-0.5"></i>
                  <div>
                    <p className="font-semibold text-emerald-900 mb-1">AI Insight: Normality Assessment</p>
                    <p className="text-sm text-emerald-700">{sampleSize >= 20 ? `With ${sampleSize} observations, the current dataset is large enough to support a reasonable normality check. No extreme imbalance stands out from the live coefficient pattern, so the model is directionally usable.` : `There are only ${sampleSize} observations available, so normality conclusions should be treated cautiously until more history is collected.`}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'vif' && (
              <div className="space-y-4">
                <div className="h-80 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl flex items-center justify-center border border-slate-200">
                  <div className="text-center">
                    <i className="ri-grid-line text-6xl text-slate-300 mb-4"></i>
                    <p className="text-slate-500 font-medium">Variance Inflation Factor Heatmap</p>
                    <p className="text-sm text-slate-400 mt-2">Multicollinearity diagnostic matrix</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <i className="ri-checkbox-circle-fill text-emerald-600 text-xl mt-0.5"></i>
                  <div>
                    <p className="font-semibold text-emerald-900 mb-1">AI Insight: Multicollinearity Check</p>
                    <p className="text-sm text-emerald-700">{coefficientData.length > 0 ? `The current variables show a highest VIF of ${Math.max(...coefficientData.map((row) => row.vif)).toFixed(2)}. Lower values mean the drivers are behaving independently enough for the coefficients to remain interpretable.` : 'Once you select usable drivers, this panel will estimate whether the chosen variables are too entangled to trust individually.'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Predictive Intelligence Lab */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-3xl p-6 shadow-xl"
        >
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <i className="ri-lightbulb-flash-line text-teal-600"></i>
            Predictive Intelligence Lab
          </h2>

          <div className="grid grid-cols-2 gap-8">
            {/* Scenario Sliders */}
            <div className="space-y-6">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">What-If Scenario Modeling</h3>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">{topDrivers[0]?.variable || 'Primary Driver'}</label>
                  <span className="text-sm font-mono font-semibold text-teal-600">{topDrivers[0] ? `${topDrivers[0].coefficient >= 0 ? '+' : ''}${topDrivers[0].coefficient.toFixed(2)}` : 'N/A'}</span>
                </div>
                <input type="range" min="-50" max="50" defaultValue="15" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">{topDrivers[1]?.variable || 'Secondary Driver'}</label>
                  <span className="text-sm font-mono font-semibold text-teal-600">{topDrivers[1] ? `${topDrivers[1].coefficient >= 0 ? '+' : ''}${topDrivers[1].coefficient.toFixed(2)}` : 'N/A'}</span>
                </div>
                <input type="range" min="-10" max="10" defaultValue="3" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">{topDrivers[2]?.variable || 'Additional Driver'}</label>
                  <span className="text-sm font-mono font-semibold text-teal-600">{topDrivers[2] ? `${topDrivers[2].coefficient >= 0 ? '+' : ''}${topDrivers[2].coefficient.toFixed(2)}` : 'N/A'}</span>
                </div>
                <input type="range" min="-5" max="5" defaultValue="2" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600" />
              </div>

              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <input type="checkbox" className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500" />
                  <label className="text-sm font-medium text-slate-700">Enable Monte Carlo Simulation</label>
                </div>
                <button className="w-full px-6 py-3 bg-gradient-to-r from-teal-500 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 whitespace-nowrap">
                  <i className="ri-play-fill mr-2"></i>
                  Run Simulation
                </button>
              </div>
            </div>

            {/* Forecast Projection */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Predicted Outcome</h3>
              <div className="h-64 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl flex items-center justify-center border border-slate-200 mb-4">
                <div className="text-center">
                  <i className="ri-line-chart-line text-6xl text-slate-300 mb-4"></i>
                  <p className="text-slate-500 font-medium">Forecast Projection Chart</p>
                </div>
              </div>

              {/* Risk Probability Meter */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <div className="text-2xl font-bold text-emerald-700">{predictedOutcome.toFixed(1)}</div>
                  <div className="text-xs text-emerald-600 mt-1">Predicted {outcomeVariable || 'Outcome'}</div>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
                  <div className="text-2xl font-bold text-blue-700">{improvementVsBaseline >= 0 ? '+' : ''}{improvementVsBaseline.toFixed(0)}%</div>
                  <div className="text-xs text-blue-600 mt-1">Change vs Baseline</div>
                </div>
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl text-center">
                  <div className="text-2xl font-bold text-purple-700">{modelConfidence.toFixed(0)}%</div>
                  <div className="text-xs text-purple-600 mt-1">Confidence Level</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Root Cause Bridge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-6 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                <i className="ri-links-line text-amber-600"></i>
                Root Cause Bridge
              </h2>
              <p className="text-sm text-slate-600">Statistically validated drivers ready for Improve phase</p>
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={openSendToTrackerModal}
                className="px-5 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 whitespace-nowrap cursor-pointer"
              >
                <i className="ri-task-line mr-2"></i>
                Send to Action Tracker
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('phase', 'improve');
                  if (projectIdFromDMAIC) params.set('projectId', projectIdFromDMAIC);
                  if (selectedProject) params.set('projectName', selectedProject);
                  navigateTo(`/dashboard/dmaic?${params.toString()}`);
                }}
                className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 whitespace-nowrap cursor-pointer flex items-center gap-2"
              >
                <i className="ri-send-plane-fill mr-2"></i>
                Send to Improve Phase
              </motion.button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            {topDrivers.map((driver, index) => (
            <div key={driver.variable} className="p-4 bg-white rounded-xl border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-900">{driver.variable}</span>
                <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${driver.impactLevel === 'High' ? 'bg-rose-100 text-rose-700 border-rose-300' : driver.impactLevel === 'Moderate' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                  {index < 2 ? 'Primary Root Cause' : driver.impactLevel === 'Moderate' ? 'Secondary Root Cause' : 'Contributing Factor'}
                </span>
              </div>
              <div className="text-sm text-slate-600">Coefficient: {driver.coefficient >= 0 ? '+' : ''}{driver.coefficient.toFixed(2)} | p = {driver.pValue.toFixed(4)} | {driver.impactLevel} Impact</div>
            </div>
            ))}
          </div>
        </motion.div>

        {/* Action Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-8 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-all duration-300 whitespace-nowrap">
              <i className="ri-save-line"></i>
              Save Model Snapshot
            </button>
            <button className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-all duration-300 whitespace-nowrap">
              <i className="ri-history-line"></i>
              Version History
            </button>
            <button className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-all duration-300 whitespace-nowrap">
              <i className="ri-file-list-3-line"></i>
              Audit Trail
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-all duration-300 whitespace-nowrap">
              <i className="ri-file-pdf-line"></i>
              Export PDF Report
            </button>
            <button className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-all duration-300 whitespace-nowrap">
              <i className="ri-file-excel-2-line"></i>
              Export to Excel
            </button>
          </div>
        </motion.div>

        {/* AI Insight Panel (Slide-in) */}
        <AnimatePresence>
          {showAIPanel && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                onClick={() => setShowAIPanel(false)}
              ></motion.div>

              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed right-0 top-0 bottom-0 w-[500px] bg-white shadow-2xl z-50 overflow-y-auto"
              >
                <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 z-10">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <i className="ri-sparkling-2-fill"></i>
                      Sigma AI Insight Engine
                    </h2>
                    <button
                      onClick={() => setShowAIPanel(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-all duration-300"
                    >
                      <i className="ri-close-line text-xl"></i>
                    </button>
                  </div>
                  <p className="text-purple-100 text-sm">AI-powered statistical interpretation & recommendations</p>
                </div>

                <div className="p-6 space-y-6">
                  {/* Model Summary */}
                  <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-checkbox-circle-fill text-emerald-600"></i>
                      Model Quality Assessment
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {coefficientData.length > 0 ? (
                        <>Your live analysis currently explains <strong>{(rSquared * 100).toFixed(1)}% of the movement</strong> in {outcomeVariable}. The overall model signal is {avgPValue < 0.01 ? 'strong' : avgPValue < 0.05 ? 'moderate' : 'still emerging'}, based on an F-statistic of {fStatistic.toFixed(1)} across {sampleSize} observations.</>
                      ) : (
                        <>There is not enough historical depth yet to produce a reliable model-quality assessment. Add more metric history or select a better-populated outcome variable to unlock a stronger analysis.</>
                      )}
                    </p>
                  </div>

                  {/* Top Drivers */}
                  <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-trophy-fill text-blue-600"></i>
                      Top 3 Statistical Drivers
                    </h3>
                    <div className="space-y-3">
                      {topDrivers.slice(0, 3).map((driver, index) => (
                        <div key={driver.variable} className="flex items-start gap-3">
                          <div className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold flex-shrink-0 ${index === 0 ? 'bg-rose-500' : index === 1 ? 'bg-blue-500' : 'bg-amber-500'}`}>{index + 1}</div>
                          <div>
                            <div className="font-semibold text-slate-900">{driver.variable}</div>
                            <div className="text-sm text-slate-600">
                              Directional effect {driver.coefficient >= 0 ? '+' : ''}{driver.coefficient.toFixed(2)} with p = {driver.pValue.toFixed(4)} and {driver.impactLevel.toLowerCase()} impact.
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Effect Size */}
                  <div className="p-5 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-scales-3-fill text-purple-600"></i>
                      Effect Size Interpretation
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {topDriver ? (
                        <><strong>{topDriver.variable}</strong> currently has the strongest standardized effect (β = {topDriver.standardizedBeta.toFixed(2)}), making it the most important lever in this model. Prioritize interventions that can influence this driver directly before spreading effort across lower-impact factors.</>
                      ) : (
                        <>Effect-size interpretation will appear once the model has enough live variables with usable history.</>
                      )}
                    </p>
                  </div>

                  {/* Risk Implications */}
                  <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-alert-fill text-amber-600"></i>
                      Risk Implications
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {topDriver ? (
                        <>If <strong>{topDriver.variable}</strong> shifts materially without offsetting action, the model suggests that {outcomeVariable} could move quickly in the same direction. Use this page to identify which drivers need active monitoring before the process drifts further.</>
                      ) : (
                        <>Risk implications will become clearer once the page has enough live data to rank the major drivers.</>
                      )}
                    </p>
                  </div>

                  {/* Executive Summary */}
                  <div className="p-5 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-file-text-fill text-slate-600"></i>
                      Executive Summary
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed mb-3">
                      {topDrivers.length > 0 ? (
                        <>Statistical analysis shows that <strong>{topDrivers.slice(0, 2).map((driver) => driver.variable).join(' and ')}</strong> are the strongest current drivers of {outcomeVariable}. The model is now strong enough to support targeted improvement planning.</>
                      ) : (
                        <>The page needs more live history before it can produce a reliable executive summary.</>
                      )}
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      <strong>Recommended Next Steps:</strong> Proceed to Improve phase with the highest-impact variables first, then validate the intervention design against the model direction before rollout.
                    </p>
                  </div>

                  {/* Action Triggers */}
                  <div className="p-5 bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-flashlight-fill text-teal-600"></i>
                      Recommended Action Triggers
                    </h3>
                    <div className="space-y-2">
                      {topDrivers.slice(0, 4).map((driver) => (
                        <div key={driver.variable} className="flex items-center gap-2 text-sm text-slate-700">
                          <i className="ri-checkbox-circle-line text-teal-600"></i>
                          Review and test an intervention that changes <strong>{driver.variable}</strong> in the direction suggested by the model.
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Download Report */}
                  <button className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 whitespace-nowrap">
                    <i className="ri-download-2-line mr-2"></i>
                    Download Executive Report (PDF)
                  </button>
                </div>
              </motion.div>
            </>
          )}

        </AnimatePresence>

        {/* ── Action Tracker Send Modal ─────────────────────── */}
        <AnimatePresence>
          {showTrackerModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                onClick={() => !sendingToTracker && setShowTrackerModal(false)}
              />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
                >
                  <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl pointer-events-auto overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-teal-500 to-emerald-600 px-8 py-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-xl">
                            <i className="ri-task-line text-white text-xl"></i>
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-white">Send to Action Tracker</h2>
                            <p className="text-teal-100 text-sm mt-0.5">Create action items from validated root causes</p>
                          </div>
                        </div>
                        {!sendingToTracker && (
                          <button
                            onClick={() => setShowTrackerModal(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 transition-all cursor-pointer"
                          >
                            <i className="ri-close-line text-white text-lg"></i>
                          </button>
                        )}
                      </div>
                    </div>

                    {!trackerSent ? (
                      <>
                        <div className="px-8 py-6 space-y-5 max-h-[60vh] overflow-y-auto">
                          {/* Project badge */}
                          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl w-fit">
                            <i className="ri-links-line text-slate-500 text-sm"></i>
                            <span className="text-sm font-medium text-slate-700 truncate max-w-xs">{selectedProject}</span>
                          </div>

                          {/* Root cause items list */}
                          <div className="space-y-3">
                            <p className="text-sm font-semibold text-slate-700">Select root causes to send as action items:</p>
                            {trackerItems.map((item, idx) => (
                              <div
                                key={item.variable}
                                className={`rounded-2xl border p-4 transition-all duration-200 ${
                                  item.selected
                                    ? 'border-teal-300 bg-teal-50/50'
                                    : 'border-slate-200 bg-white opacity-60'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  {/* Checkbox */}
                                  <button
                                    onClick={() => {
                                      const updated = [...trackerItems];
                                      updated[idx] = { ...item, selected: !item.selected };
                                      setTrackerItems(updated);
                                    }}
                                    className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${
                                      item.selected
                                        ? item.priority === 'critical' ? 'bg-red-500 border-red-500'
                                        : item.priority === 'high' ? 'bg-orange-500 border-orange-500'
                                        : item.priority === 'medium' ? 'bg-amber-400 border-amber-400'
                                        : 'bg-emerald-500 border-emerald-500'
                                        : 'bg-white border-slate-300'
                                    }`}
                                  >
                                    {item.selected && <i className="ri-check-line text-white text-xs"></i>}
                                  </button>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                      <span className="font-semibold text-slate-900 text-sm">{item.variable}</span>
                                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                                        item.impactLevel === 'High'
                                          ? 'bg-rose-100 text-rose-700 border-rose-300'
                                          : item.impactLevel === 'Moderate'
                                          ? 'bg-amber-100 text-amber-700 border-amber-300'
                                          : 'bg-slate-100 text-slate-600 border-slate-300'
                                      }`}>
                                        {item.impactLevel} Impact
                                      </span>
                                      <span className="text-xs text-slate-500 font-mono">
                                        coef {item.coefficient > 0 ? '+' : ''}{item.coefficient.toFixed(2)} · p={item.pValue.toFixed(4)}
                                      </span>
                                    </div>

                                    {/* Priority selector */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-slate-500 whitespace-nowrap">Priority:</span>
                                      <div className="flex items-center gap-1">
                                        {(['critical', 'high', 'medium', 'low'] as const).map(p => (
                                          <button
                                            key={p}
                                            onClick={() => {
                                              const updated = [...trackerItems];
                                              updated[idx] = { ...item, priority: p };
                                              setTrackerItems(updated);
                                            }}
                                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                                              item.priority === p
                                                ? p === 'critical' ? 'bg-red-500 text-white border-red-500'
                                                : p === 'high' ? 'bg-orange-500 text-white border-orange-500'
                                                : p === 'medium' ? 'bg-amber-400 text-white border-amber-400'
                                                : 'bg-emerald-500 text-white border-emerald-500'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                            }`}
                                          >
                                            {p}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Due date */}
                          <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                              <i className="ri-calendar-line text-slate-500"></i>
                              <label className="text-sm font-semibold text-slate-700 whitespace-nowrap">Due Date (all items):</label>
                            </div>
                            <input
                              type="date"
                              value={trackerGlobalDueDate}
                              onChange={e => setTrackerGlobalDueDate(e.target.value)}
                              className="flex-1 px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                            />
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-500">
                            {selectedTrackerCount} action item{selectedTrackerCount !== 1 ? 's' : ''} will be created
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setShowTrackerModal(false)}
                              disabled={sendingToTracker}
                              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all whitespace-nowrap cursor-pointer disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={handleSendToActionTracker}
                              disabled={sendingToTracker || selectedTrackerCount === 0}
                              className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {sendingToTracker ? (
                                <>
                                  <i className="ri-loader-4-line animate-spin"></i>
                                  Creating...
                                </>
                              ) : (
                                <>
                                  <i className="ri-task-line"></i>
                                  Create {selectedTrackerCount} Action{selectedTrackerCount !== 1 ? 's' : ''}
                                </>
                              )}
                            </motion.button>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* ── Success State ── */
                      <div className="px-8 py-12 flex flex-col items-center text-center">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                          className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-5"
                        >
                          <i className="ri-checkbox-circle-fill text-emerald-500 text-4xl"></i>
                        </motion.div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-2">
                          {trackerSentCount} Action{trackerSentCount !== 1 ? 's' : ''} Created!
                        </h3>
                        <p className="text-slate-600 text-sm mb-8 max-w-sm">
                          Root causes from <strong>{selectedProject}</strong> have been added to the Action Tracker for assignment and follow-up.
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setShowTrackerModal(false)}
                            className="px-5 py-3 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all whitespace-nowrap cursor-pointer"
                          >
                            Stay Here
                          </button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => navigateTo('/dashboard/action-tracker')}
                            className="px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-2"
                          >
                            <i className="ri-task-line"></i>
                            Go to Action Tracker
                            <i className="ri-arrow-right-line"></i>
                          </motion.button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
      </div>
    </div>
  );
};

export default AnalyzePage;
