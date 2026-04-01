import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

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
  const [selectedDataset, setSelectedDataset] = useState('Patient Flow Data Q1-Q4 2024');
  const [outcomeVariable, setOutcomeVariable] = useState('Wait Time (minutes)');
  const [modelType, setModelType] = useState('Linear Regression');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('residual');
  const [selectedVariables, setSelectedVariables] = useState<string[]>([
    'Patient Volume',
    'Staff Count',
    'Time of Day',
    'Day of Week'
  ]);

  const availableVariables = [
    'Patient Volume',
    'Staff Count',
    'Time of Day',
    'Day of Week',
    'Appointment Type',
    'Provider Experience',
    'Room Availability',
    'Season',
    'Holiday Flag'
  ];

  const coefficientData: CoefficientData[] = [
    {
      variable: 'Patient Volume',
      coefficient: 2.34,
      standardizedBeta: 0.68,
      tStatistic: 12.45,
      pValue: 0.0001,
      vif: 1.23,
      confidenceInterval: '[1.98, 2.70]',
      significance: 'High',
      impactLevel: 'High'
    },
    {
      variable: 'Staff Count',
      coefficient: -3.12,
      standardizedBeta: -0.54,
      tStatistic: -9.87,
      pValue: 0.0001,
      vif: 1.45,
      confidenceInterval: '[-3.74, -2.50]',
      significance: 'High',
      impactLevel: 'High'
    },
    {
      variable: 'Time of Day',
      coefficient: 1.45,
      standardizedBeta: 0.32,
      tStatistic: 5.67,
      pValue: 0.0023,
      vif: 1.89,
      confidenceInterval: '[0.95, 1.95]',
      significance: 'High',
      impactLevel: 'Moderate'
    },
    {
      variable: 'Day of Week',
      coefficient: 0.78,
      standardizedBeta: 0.18,
      tStatistic: 2.34,
      pValue: 0.0456,
      vif: 1.12,
      confidenceInterval: '[0.12, 1.44]',
      significance: 'Moderate',
      impactLevel: 'Low'
    }
  ];

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

  const impactToPriority = (impact: 'High' | 'Moderate' | 'Low'): 'critical' | 'high' | 'medium' | 'low' => {
    if (impact === 'High') return 'high';
    if (impact === 'Moderate') return 'medium';
    return 'low';
  };

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
                <option>Patient Flow Data Q1-Q4 2024</option>
                <option>Historical Baseline 2023</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Outcome Variable (CTQ)</label>
              <select
                value={outcomeVariable}
                onChange={(e) => setOutcomeVariable(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-300"
              >
                <option>Wait Time (minutes)</option>
                <option>Patient Satisfaction Score</option>
                <option>Throughput Rate</option>
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
                Run Model
              </motion.button>
            </div>
          </div>

          {/* Right Side Badges */}
          <div className="flex items-center gap-4 mt-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
              <i className="ri-shield-check-line text-emerald-600"></i>
              <span className="text-sm font-medium text-emerald-700">AI Confidence: 94%</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl">
              <i className="ri-database-2-line text-blue-600"></i>
              <span className="text-sm font-medium text-blue-700">Data Quality: Excellent</span>
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
                  {availableVariables.map((variable) => (
                    <motion.div
                      key={variable}
                      whileHover={{ x: 4 }}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-300 ${
                        selectedVariables.includes(variable)
                          ? 'bg-gradient-to-r from-teal-50 to-indigo-50 border border-teal-200'
                          : 'bg-slate-50 border border-slate-200 hover:border-slate-300'
                      }`}
                      onClick={() => toggleVariable(variable)}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-300 ${
                        selectedVariables.includes(variable)
                          ? 'bg-teal-500 border-teal-500'
                          : 'border-slate-300'
                      }`}>
                        {selectedVariables.includes(variable) && (
                          <i className="ri-check-line text-white text-xs"></i>
                        )}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{variable}</span>
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
            {/* Metric Cards */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <MetricCard
                label="R² (Coefficient of Determination)"
                value="0.847"
                tooltip="84.7% of variance in wait time is explained by the model. Excellent fit."
                aiInsight="Strong predictive power"
                status="excellent"
              />
              <MetricCard
                label="Adjusted R²"
                value="0.832"
                tooltip="Adjusted for number of predictors. Confirms model quality."
                aiInsight="Robust after adjustment"
                status="excellent"
              />
              <MetricCard
                label="F-Statistic"
                value="156.4"
                tooltip="Model is statistically significant (p &lt; 0.0001)"
                aiInsight="Highly significant model"
                status="excellent"
              />
              <MetricCard
                label="Model P-Value"
                value="&lt; 0.0001"
                tooltip="Overall model significance. Extremely strong evidence."
                aiInsight="Statistically valid"
                status="excellent"
              />
              <MetricCard
                label="AIC / BIC"
                value="2847 / 2891"
                tooltip="Information criteria for model comparison. Lower is better."
                aiInsight="Optimal complexity"
                status="good"
              />
              <MetricCard
                label="Confidence Level"
                value="95%"
                tooltip="Statistical confidence interval for all estimates"
                aiInsight="Industry standard"
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
                    <p className="text-sm text-emerald-700">Residuals show random scatter around zero with no clear pattern. This indicates the linear model assumptions are satisfied. No evidence of heteroscedasticity or non-linearity detected.</p>
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
                    <p className="text-sm text-emerald-700">Shapiro-Wilk test p-value = 0.342 (p &gt; 0.05). Residuals follow normal distribution. Q-Q plot shows points closely aligned with theoretical line. Normality assumption is satisfied.</p>
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
                    <p className="text-sm text-emerald-700">All VIF values are below 2.0, well under the threshold of 5. No multicollinearity detected. Independent variables are sufficiently independent for reliable coefficient estimation.</p>
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
                  <label className="text-sm font-medium text-slate-700">Patient Volume</label>
                  <span className="text-sm font-mono font-semibold text-teal-600">+15%</span>
                </div>
                <input type="range" min="-50" max="50" defaultValue="15" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Staff Count</label>
                  <span className="text-sm font-mono font-semibold text-teal-600">+3 FTE</span>
                </div>
                <input type="range" min="-10" max="10" defaultValue="3" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Room Availability</label>
                  <span className="text-sm font-mono font-semibold text-teal-600">+2 rooms</span>
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
                  <div className="text-2xl font-bold text-emerald-700">23.4</div>
                  <div className="text-xs text-emerald-600 mt-1">Predicted Wait Time (min)</div>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
                  <div className="text-2xl font-bold text-blue-700">-34%</div>
                  <div className="text-xs text-blue-600 mt-1">Improvement vs Baseline</div>
                </div>
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl text-center">
                  <div className="text-2xl font-bold text-purple-700">87%</div>
                  <div className="text-xs text-purple-600 mt-1">Confidence Interval</div>
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
            <div className="p-4 bg-white rounded-xl border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-900">Patient Volume</span>
                <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-semibold rounded-full border border-rose-300">Primary Root Cause</span>
              </div>
              <div className="text-sm text-slate-600">Coefficient: +2.34 | p &lt; 0.0001 | High Impact</div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-900">Staff Count</span>
                <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-semibold rounded-full border border-rose-300">Primary Root Cause</span>
              </div>
              <div className="text-sm text-slate-600">Coefficient: -3.12 | p &lt; 0.0001 | High Impact</div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-900">Time of Day</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-300">Secondary Root Cause</span>
              </div>
              <div className="text-sm text-slate-600">Coefficient: +1.45 | p = 0.0023 | Moderate Impact</div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-900">Day of Week</span>
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full border border-slate-300">Contributing Factor</span>
              </div>
              <div className="text-sm text-slate-600">Coefficient: +0.78 | p = 0.0456 | Low Impact</div>
            </div>
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
                      Your regression model demonstrates <strong>excellent predictive power</strong> with an R² of 0.847, meaning 84.7% of wait time variance is explained by the selected variables. The model is statistically significant (F = 156.4, p &lt; 0.0001) and all diagnostic tests pass.
                    </p>
                  </div>

                  {/* Top Drivers */}
                  <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-trophy-fill text-blue-600"></i>
                      Top 3 Statistical Drivers
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                        <div>
                          <div className="font-semibold text-slate-900">Patient Volume</div>
                          <div className="text-sm text-slate-600">Each additional patient increases wait time by 2.34 minutes (p &lt; 0.0001)</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                        <div>
                          <div className="font-semibold text-slate-900">Staff Count</div>
                          <div className="text-sm text-slate-600">Each additional staff member reduces wait time by 3.12 minutes (p &lt; 0.0001)</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                        <div>
                          <div className="font-semibold text-slate-900">Time of Day</div>
                          <div className="text-sm text-slate-600">Peak hours add 1.45 minutes to wait time (p = 0.0023)</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Effect Size */}
                  <div className="p-5 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-scales-3-fill text-purple-600"></i>
                      Effect Size Interpretation
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      <strong>Staff Count</strong> has the largest standardized effect (β = -0.54), making it the most impactful lever for improvement. <strong>Patient Volume</strong> follows closely (β = 0.68) but is harder to control. Focus improvement efforts on staffing optimization for maximum ROI.
                    </p>
                  </div>

                  {/* Risk Implications */}
                  <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-alert-fill text-amber-600"></i>
                      Risk Implications
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      Current staffing levels are insufficient during peak hours. If patient volume increases by 15% without staffing adjustments, predicted wait time will exceed 45 minutes, risking patient satisfaction scores and regulatory compliance.
                    </p>
                  </div>

                  {/* Executive Summary */}
                  <div className="p-5 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-file-text-fill text-slate-600"></i>
                      Executive Summary
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed mb-3">
                      Statistical analysis confirms that <strong>staffing levels and patient volume</strong> are the primary drivers of wait time variation. The model is robust and ready for decision-making.
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      <strong>Recommended Next Steps:</strong> Proceed to Improve phase with focus on dynamic staffing models and patient flow optimization. Expected impact: 30-40% wait time reduction.
                    </p>
                  </div>

                  {/* Action Triggers */}
                  <div className="p-5 bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-2xl">
                    <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <i className="ri-flashlight-fill text-teal-600"></i>
                      Recommended Action Triggers
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <i className="ri-checkbox-circle-line text-teal-600"></i>
                        Implement dynamic staffing algorithm based on predicted volume
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <i className="ri-checkbox-circle-line text-teal-600"></i>
                        Create peak-hour surge capacity protocols
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <i className="ri-checkbox-circle-line text-teal-600"></i>
                        Pilot appointment scheduling optimization
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <i className="ri-checkbox-circle-line text-teal-600"></i>
                        Monitor real-time staffing ratios with automated alerts
                      </div>
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