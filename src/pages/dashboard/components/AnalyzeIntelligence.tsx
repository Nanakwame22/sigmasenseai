import { useState, useEffect, useRef } from 'react';

interface ModelMetric {
  label: string;
  value: string;
  interpretation: string;
  status: 'excellent' | 'good' | 'warning' | 'poor';
  icon: string;
  delta?: string;
}

interface CoefficientRow {
  variable: string;
  coefficient: number;
  standardizedBeta: number;
  tStatistic: number;
  pValue: number;
  vif: number;
  confidenceInterval: [number, number];
  significance: 'high' | 'moderate' | 'low';
  impact: 'high' | 'moderate' | 'low';
}

interface DiagnosticTest {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  value: string;
  interpretation: string;
  recommendation: string;
  icon: string;
}

function AnimatedCounter({
  target,
  decimals = 0,
  duration = 1200,
  prefix = '',
  suffix = '',
}: {
  target: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let start = 0;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(eased * target);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {count.toFixed(decimals)}
      {suffix}
    </span>
  );
}

function MiniBarChart({
  data,
  color,
  height = 40,
}: {
  data: number[];
  color: string;
  height?: number;
}) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((val, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-all duration-500 opacity-0"
          style={{
            height: `${(val / max) * 100}%`,
            background: color,
            opacity: 1,
            animationDelay: `${i * 30}ms`,
          }}
        />
      ))}
    </div>
  );
}

function ResidualPlot() {
  const points = Array.from({ length: 60 }, (_, i) => ({
    x: 12 + i * 4.6,
    y: 52 + Math.sin(i * 0.55) * 18 + Math.cos(i * 0.21) * 8,
    r: 2.8 + ((i % 5) * 0.35),
  }));

  return (
    <div className="relative w-full h-48 bg-gradient-to-b from-slate-900/5 to-transparent rounded-xl overflow-hidden">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full h-px bg-teal-500/30 relative">
          <div className="absolute -top-px left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-teal-500/60 to-transparent" />
        </div>
      </div>
      {points.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full animate-scatter-in"
          style={{
            left: `${(p.x / 300) * 100}%`,
            top: `${(p.y / 100) * 100}%`,
            width: p.r * 2,
            height: p.r * 2,
            background: `radial-gradient(circle, rgba(20,184,166,0.8) 0%, rgba(20,184,166,0.2) 100%)`,
            animationDelay: `${i * 20}ms`,
          }}
        />
      ))}
      <div className="absolute bottom-2 left-3 text-xs text-slate-400 font-medium">Fitted Values</div>
      <div className="absolute top-2 left-3 text-xs text-slate-400 font-medium rotate-0">Residuals</div>
    </div>
  );
}

function VIFHeatmap({ data }: { data: CoefficientRow[] }) {
  const getColor = (vif: number) => {
    if (vif < 1.5) return 'bg-emerald-500/80';
    if (vif < 3) return 'bg-teal-500/70';
    if (vif < 5) return 'bg-amber-500/70';
    return 'bg-rose-500/70';
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {data.map((row, i) => (
        <div
          key={i}
          className={`${getColor(row.vif)} rounded-lg p-3 text-center transition-all duration-300 hover:scale-105 cursor-default`}
        >
          <div className="text-xs text-white/80 font-medium truncate">{row.variable.replace(/_/g, ' ')}</div>
          <div className="text-lg font-bold text-white mt-0.5">{row.vif.toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}

function SensitivityHeatmap() {
  const vars = ['Staff', 'Volume', 'Emergency', 'Time', 'Beds'];
  const matrix = [
    [1.0, -0.3, 0.2, 0.1, -0.4],
    [-0.3, 1.0, 0.5, 0.3, -0.2],
    [0.2, 0.5, 1.0, 0.4, -0.1],
    [0.1, 0.3, 0.4, 1.0, 0.0],
    [-0.4, -0.2, -0.1, 0.0, 1.0],
  ];

  const getColor = (val: number) => {
    if (val > 0.7) return 'bg-teal-600';
    if (val > 0.3) return 'bg-teal-500/70';
    if (val > 0) return 'bg-teal-400/40';
    if (val > -0.3) return 'bg-rose-400/30';
    if (val > -0.7) return 'bg-rose-500/60';
    return 'bg-rose-600';
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-1 ml-14">
        {vars.map((v) => (
          <div key={v} className="flex-1 text-[9px] text-slate-500 text-center font-medium truncate">
            {v}
          </div>
        ))}
      </div>
      {matrix.map((row, i) => (
        <div key={i} className="flex gap-1 items-center">
          <div className="w-12 text-[9px] text-slate-500 text-right font-medium truncate pr-1">
            {vars[i]}
          </div>
          {row.map((val, j) => (
            <div
              key={j}
              className={`flex-1 aspect-square rounded-md ${getColor(val)} flex items-center justify-center transition-all duration-300 hover:scale-110 cursor-default`}
            >
              <span className="text-[9px] font-bold text-white/90">{val.toFixed(1)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function AnalyzeIntelligence() {
  const [selectedProject, setSelectedProject] = useState('Hospital Wait Time Reduction');
  const [selectedDataset, setSelectedDataset] = useState('patient_flow_q4_2024.csv');
  const [outcomeVariable, setOutcomeVariable] = useState('wait_time_minutes');
  const [modelType, setModelType] = useState('Linear Regression');
  const [selectedVariables, setSelectedVariables] = useState<string[]>([
    'staff_count',
    'patient_volume',
    'time_of_day',
    'day_of_week',
  ]);
  const [transformations, setTransformations] = useState<Record<string, string>>({});
  const [interactionTerms, setInteractionTerms] = useState(false);
  const [regularizationStrength, setRegularizationStrength] = useState(0.5);
  const [crossValidation, setCrossValidation] = useState(true);
  const [advancedDiagnostics, setAdvancedDiagnostics] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [activeDiagnosticTab, setActiveDiagnosticTab] = useState('residual');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [modelRunning, setModelRunning] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('pValue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [mounted, setMounted] = useState(false);
  const [scenarioValues, setScenarioValues] = useState<Record<string, number>>({
    staff_count: 12,
    patient_volume: 35,
    emergency_cases: 5,
  });
  const [monteCarloEnabled, setMonteCarloEnabled] = useState(false);
  const [modelVersion, setModelVersion] = useState('v3.2.1');

  useEffect(() => {
    setMounted(true);
  }, []);

  const availableVariables = [
    'staff_count',
    'patient_volume',
    'time_of_day',
    'day_of_week',
    'emergency_cases',
    'bed_availability',
    'equipment_status',
    'season',
    'weather_condition',
    'holiday_flag',
    'staff_experience',
    'triage_level',
  ];

  const modelMetrics: ModelMetric[] = [
    {
      label: 'R\u00B2',
      value: '0.847',
      interpretation: 'Model explains 84.7% of variance in wait times',
      status: 'excellent',
      icon: 'ri-pie-chart-2-line',
      delta: '+2.3%',
    },
    {
      label: 'Adjusted R\u00B2',
      value: '0.839',
      interpretation: 'Adjusted for number of predictors in model',
      status: 'excellent',
      icon: 'ri-donut-chart-line',
      delta: '+1.8%',
    },
    {
      label: 'F-statistic',
      value: '127.4',
      interpretation: 'Overall model is highly statistically significant',
      status: 'excellent',
      icon: 'ri-bar-chart-grouped-line',
      delta: '',
    },
    {
      label: 'Model P-value',
      value: '<0.001',
      interpretation: 'Probability of results by chance is near zero',
      status: 'excellent',
      icon: 'ri-flashlight-line',
      delta: '',
    },
    {
      label: 'AIC / BIC',
      value: '2847 / 2891',
      interpretation: 'Lower values indicate better model parsimony',
      status: 'good',
      icon: 'ri-scales-3-line',
      delta: '-12',
    },
    {
      label: 'Confidence',
      value: '95%',
      interpretation: 'Statistical confidence level for all estimates',
      status: 'excellent',
      icon: 'ri-shield-check-line',
      delta: '',
    },
  ];

  const coefficientData: CoefficientRow[] = [
    {
      variable: 'staff_count',
      coefficient: -2.34,
      standardizedBeta: -0.52,
      tStatistic: -8.7,
      pValue: 0.0001,
      vif: 1.2,
      confidenceInterval: [-2.87, -1.81],
      significance: 'high',
      impact: 'high',
    },
    {
      variable: 'patient_volume',
      coefficient: 0.89,
      standardizedBeta: 0.41,
      tStatistic: 6.3,
      pValue: 0.0003,
      vif: 1.4,
      confidenceInterval: [0.61, 1.17],
      significance: 'high',
      impact: 'high',
    },
    {
      variable: 'time_of_day',
      coefficient: 1.23,
      standardizedBeta: 0.28,
      tStatistic: 4.2,
      pValue: 0.002,
      vif: 1.1,
      confidenceInterval: [0.65, 1.81],
      significance: 'high',
      impact: 'moderate',
    },
    {
      variable: 'emergency_cases',
      coefficient: 3.45,
      standardizedBeta: 0.35,
      tStatistic: 5.1,
      pValue: 0.0008,
      vif: 1.3,
      confidenceInterval: [2.12, 4.78],
      significance: 'high',
      impact: 'high',
    },
    {
      variable: 'day_of_week',
      coefficient: 0.45,
      standardizedBeta: 0.12,
      tStatistic: 2.1,
      pValue: 0.038,
      vif: 1.0,
      confidenceInterval: [0.03, 0.87],
      significance: 'moderate',
      impact: 'low',
    },
    {
      variable: 'bed_availability',
      coefficient: -1.12,
      standardizedBeta: -0.19,
      tStatistic: -2.8,
      pValue: 0.006,
      vif: 1.5,
      confidenceInterval: [-1.91, -0.33],
      significance: 'high',
      impact: 'moderate',
    },
  ];

  const diagnosticTests: Record<string, DiagnosticTest> = {
    residual: {
      name: 'Residual Plot',
      status: 'pass',
      value: 'Random scatter pattern',
      interpretation:
        'Residuals show no systematic pattern, confirming linearity assumption and good model specification.',
      recommendation: 'No action needed — model assumptions are satisfied.',
      icon: 'ri-scatter-chart-line',
    },
    normality: {
      name: 'Normality',
      status: 'pass',
      value: 'W = 0.987, p = 0.142',
      interpretation:
        'Shapiro-Wilk test confirms residuals follow a normal distribution (p > 0.05).',
      recommendation: 'Normality assumption is met. Inference is valid.',
      icon: 'ri-pulse-line',
    },
    homoscedasticity: {
      name: 'Homoscedasticity',
      status: 'pass',
      value: 'BP = 12.4, p = 0.089',
      interpretation: 'Breusch-Pagan test shows constant variance across all fitted values.',
      recommendation: 'Variance is stable. No heteroscedasticity correction needed.',
      icon: 'ri-equalizer-line',
    },
    multicollinearity: {
      name: 'VIF Heatmap',
      status: 'pass',
      value: 'Max VIF = 1.5',
      interpretation:
        'All Variance Inflation Factors are well below the threshold of 5, indicating no multicollinearity.',
      recommendation: 'Variables are sufficiently independent for reliable estimates.',
      icon: 'ri-grid-line',
    },
    autocorrelation: {
      name: 'Autocorrelation',
      status: 'pass',
      value: 'DW = 1.98',
      interpretation:
        'Durbin-Watson statistic near 2.0 confirms no serial correlation in residuals.',
      recommendation: 'Independence assumption is satisfied.',
      icon: 'ri-rhythm-line',
    },
    outliers: {
      name: 'Cook\u2019s Distance',
      status: 'warning',
      value: '3 influential points',
      interpretation:
        '3 observations exceed the Cook\u2019s Distance threshold (4/n), potentially influencing model estimates.',
      recommendation: 'Review cases #47, #128, #203 for data entry errors or special causes.',
      icon: 'ri-focus-3-line',
    },
  };

  const runModel = () => {
    setModelRunning(true);
    setTimeout(() => {
      setModelRunning(false);
      setShowAIPanel(true);
    }, 2500);
  };

  const toggleVariable = (variable: string) => {
    setSelectedVariables((prev) =>
      prev.includes(variable) ? prev.filter((v) => v !== variable) : [...prev, variable]
    );
  };

  const getStatusGradient = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'from-emerald-500 to-teal-500';
      case 'good':
        return 'from-teal-500 to-cyan-500';
      case 'warning':
        return 'from-amber-500 to-orange-500';
      case 'poor':
        return 'from-rose-500 to-red-500';
      default:
        return 'from-slate-400 to-slate-500';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'bg-emerald-400';
      case 'good':
        return 'bg-teal-400';
      case 'warning':
        return 'bg-amber-400';
      case 'poor':
        return 'bg-rose-400';
      case 'pass':
        return 'bg-emerald-400';
      case 'fail':
        return 'bg-rose-400';
      default:
        return 'bg-slate-400';
    }
  };

  const getSignificanceBadge = (sig: string) => {
    const colors: Record<string, string> = {
      high: 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20',
      moderate: 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20',
      low: 'bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/20',
    };
    return colors[sig] || colors.low;
  };

  const getImpactBar = (impact: string) => {
    switch (impact) {
      case 'high':
        return 'w-full bg-gradient-to-r from-teal-500 to-emerald-500';
      case 'moderate':
        return 'w-2/3 bg-gradient-to-r from-amber-400 to-amber-500';
      case 'low':
        return 'w-1/3 bg-gradient-to-r from-slate-300 to-slate-400';
      default:
        return 'w-0';
    }
  };

  const sortedCoefficients = [...coefficientData].sort((a, b) => {
    const aVal = a[sortColumn as keyof CoefficientRow];
    const bVal = b[sortColumn as keyof CoefficientRow];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const predictedOutcome = (
    18.4 +
    (scenarioValues.staff_count - 12) * -2.34 * 0.1 +
    (scenarioValues.patient_volume - 35) * 0.89 * 0.05 +
    (scenarioValues.emergency_cases - 5) * 3.45 * 0.1
  ).toFixed(1);
  const modelRSquared = parseFloat(modelMetrics.find((metric) => metric.label === 'R²')?.value || '0');
  const passedDiagnostics = Object.values(diagnosticTests).filter((test) => test.status === 'pass').length;
  const totalDiagnostics = Object.keys(diagnosticTests).length;
  const topDrivers = [...coefficientData]
    .sort((a, b) => Math.abs(b.standardizedBeta) - Math.abs(a.standardizedBeta))
    .slice(0, 3)
    .map((driver, index) => {
      const color = driver.coefficient < 0 ? 'emerald' : index === 1 ? 'rose' : 'amber';
      const variableLabel = driver.variable.replace(/_/g, ' ');
      const outcomeLabel = outcomeVariable.replace(/_/g, ' ');
      const coefficientMagnitude = Math.abs(driver.coefficient).toFixed(2);
      return {
        rank: index + 1,
        variable: variableLabel.replace(/\b\w/g, (char) => char.toUpperCase()),
        effect:
          driver.coefficient < 0
            ? `Each additional ${variableLabel} lowers ${outcomeLabel} by about ${coefficientMagnitude} units`
            : `Each additional ${variableLabel} raises ${outcomeLabel} by about ${coefficientMagnitude} units`,
        impact: `${driver.significance} significance with standardized beta ${driver.standardizedBeta.toFixed(2)}`,
        color,
      };
    });
  const strongestDriver = topDrivers[0];
  const mediumDrivers = coefficientData.filter((driver) => Math.abs(driver.standardizedBeta) >= 0.3 && Math.abs(driver.standardizedBeta) < 0.5);
  const smallDrivers = coefficientData.filter((driver) => Math.abs(driver.standardizedBeta) < 0.3);
  const staffingDriver = coefficientData.find((row) => row.variable === 'staff_count');
  const emergencyDriver = coefficientData.find((row) => row.variable === 'emergency_cases');
  const patientVolumeDriver = coefficientData.find((row) => row.variable === 'patient_volume');
  const projectedStaffingLift = staffingDriver ? Math.abs(staffingDriver.coefficient) * 2 : 0;
  const projectedRelativeImprovement = 18.4 > 0 ? (projectedStaffingLift / 18.4) * 100 : 0;
  const modelQualityTone =
    modelRSquared >= 0.8 ? 'Excellent Model Quality' : modelRSquared >= 0.65 ? 'Strong Model Quality' : 'Moderate Model Quality';
  const modelQualityBody =
    modelRSquared >= 0.8
      ? `The current ${modelType.toLowerCase()} explains ${(modelRSquared * 100).toFixed(1)}% of variance in ${outcomeVariable.replace(/_/g, ' ')}. ${passedDiagnostics} of ${totalDiagnostics} diagnostics passed, so this is suitable for operational planning with routine monitoring.`
      : `The current ${modelType.toLowerCase()} explains ${(modelRSquared * 100).toFixed(1)}% of variance in ${outcomeVariable.replace(/_/g, ' ')}. ${passedDiagnostics} of ${totalDiagnostics} diagnostics passed, so it is directionally useful but should be monitored against fresh data before high-stakes decisions.`;
  const aiPanelToneClass =
    modelRSquared >= 0.8
      ? 'bg-emerald-50/80 border-emerald-200/60 text-emerald-800'
      : 'bg-amber-50/80 border-amber-200/60 text-amber-800';
  const aiPanelIconClass = modelRSquared >= 0.8 ? 'bg-emerald-500' : 'bg-amber-500';
  const driverThemeMap: Record<string, { card: string; badge: string; title: string; effect: string; impact: string }> = {
    emerald: {
      card: 'bg-emerald-50/60 border border-emerald-200/60',
      badge: 'bg-emerald-500',
      title: 'text-emerald-800',
      effect: 'text-emerald-700',
      impact: 'text-emerald-600',
    },
    rose: {
      card: 'bg-rose-50/60 border border-rose-200/60',
      badge: 'bg-rose-500',
      title: 'text-rose-800',
      effect: 'text-rose-700',
      impact: 'text-rose-600',
    },
    amber: {
      card: 'bg-amber-50/60 border border-amber-200/60',
      badge: 'bg-amber-500',
      title: 'text-amber-800',
      effect: 'text-amber-700',
      impact: 'text-amber-600',
    },
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f8fafb] via-[#f0f7f7] to-[#f5f3ff] pointer-events-none" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-teal-100/40 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-100/30 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />

      <div
        className={`relative z-10 p-6 xl:p-8 max-w-[1920px] mx-auto transition-all duration-700 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* ==================================================== */}
        {/* 1. ANALYZE PHASE HEADER */}
        {/* ==================================================== */}
        <div className="bg-white/70 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-6 mb-6">
          {/* Top Row: DMAIC Stepper */}
          <div className="flex items-center justify-between mb-5 pb-5 border-b border-slate-200/60">
            <div className="flex items-center gap-2">
              {['Define', 'Measure', 'Analyze', 'Improve', 'Control'].map((phase, idx) => (
                <div key={phase} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold transition-all duration-500 ${
                        phase === 'Analyze'
                          ? 'bg-gradient-to-br from-teal-500 to-indigo-600 text-white shadow-lg shadow-teal-500/25 scale-110'
                          : idx < 2
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {idx < 2 ? <i className="ri-check-line text-sm"></i> : phase[0]}
                    </div>
                    <span
                      className={`text-xs font-semibold whitespace-nowrap ${
                        phase === 'Analyze' ? 'text-teal-700' : idx < 2 ? 'text-teal-600' : 'text-slate-400'
                      }`}
                    >
                      {phase}
                    </span>
                  </div>
                  {idx < 4 && <div className={`w-6 h-[2px] rounded-full mb-4 ${idx < 2 ? 'bg-teal-400' : 'bg-slate-200'}`} />}
                </div>
              ))}
            </div>

            {/* Right: Badges & Run Button */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  AI Confidence
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-1000"
                      style={{ width: '94%' }}
                    />
                  </div>
                  <span className="text-sm font-bold text-emerald-600">94%</span>
                </div>
              </div>

              <div className="px-3 py-1.5 bg-emerald-50/80 border border-emerald-200/60 rounded-lg flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">Data Quality: Excellent</span>
              </div>

              <button
                onClick={runModel}
                disabled={modelRunning}
                className="group relative px-5 py-2.5 bg-gradient-to-r from-teal-500 to-indigo-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-xl hover:shadow-teal-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer hover:scale-[1.03] active:scale-[0.97]"
              >
                {modelRunning ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Running Model...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <i className="ri-play-circle-fill text-base"></i>
                    Run Model
                  </span>
                )}
                {!modelRunning && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal-400/50 to-indigo-500/50 blur-xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                )}
              </button>
            </div>
          </div>

          {/* Bottom Row: Selectors Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                label: 'Project',
                icon: 'ri-folder-3-line',
                value: selectedProject,
                setter: setSelectedProject,
                options: ['Hospital Wait Time Reduction', 'Manufacturing Defect Analysis', 'Supply Chain Optimization'],
              },
              {
                label: 'Dataset',
                icon: 'ri-database-2-line',
                value: selectedDataset,
                setter: setSelectedDataset,
                options: ['patient_flow_q4_2024.csv', 'patient_flow_q3_2024.csv', 'historical_data_2023.csv'],
              },
              {
                label: 'Outcome (CTQ)',
                icon: 'ri-target-line',
                value: outcomeVariable,
                setter: setOutcomeVariable,
                options: ['wait_time_minutes', 'patient_satisfaction', 'treatment_duration'],
              },
              {
                label: 'Model Type',
                icon: 'ri-brain-line',
                value: modelType,
                setter: setModelType,
                options: ['Linear Regression', 'Logistic Regression', 'Poisson', 'Time Series (ARIMA)', 'LASSO / Ridge', 'Stepwise'],
              },
            ].map((sel) => (
              <div key={sel.label} className="group">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  <i className={`${sel.icon} text-xs`}></i>
                  {sel.label}
                </label>
                <select
                  value={sel.value}
                  onChange={(e) => sel.setter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-lg text-sm font-medium text-slate-700 hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all cursor-pointer group-hover:bg-white"
                >
                  {sel.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* ==================================================== */}
        {/* 2. REGRESSION STUDIO */}
        {/* ==================================================== */}
        <div className="grid grid-cols-12 gap-6 mb-6">
          {/* LEFT: Model Configuration */}
          <div className="col-span-12 xl:col-span-3 space-y-5">
            <div className="bg-white/70 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-5">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center">
                  <i className="ri-settings-3-line text-white text-sm"></i>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Model Configuration</h3>
                  <p className="text-xs text-slate-400">Select variables & parameters</p>
                </div>
              </div>

              {/* Variables */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                  Independent Variables
                </label>
                <div className="space-y-1 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                  {availableVariables.map((variable) => (
                    <label
                      key={variable}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all cursor-pointer group ${
                        selectedVariables.includes(variable)
                          ? 'bg-teal-50/80 border border-teal-200/60'
                          : 'hover:bg-slate-50/80 border border-transparent'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${
                          selectedVariables.includes(variable)
                            ? 'bg-teal-500 border-teal-500'
                            : 'border-slate-300 group-hover:border-teal-400'
                        }`}
                      >
                        {selectedVariables.includes(variable) && (
                          <i className="ri-check-line text-white text-xs"></i>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedVariables.includes(variable)}
                        onChange={() => toggleVariable(variable)}
                        className="sr-only"
                      />
                      <span className="text-xs text-slate-700 font-medium">{variable.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Transformations */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                  Transformations
                </label>
                <div className="space-y-1.5">
                  {selectedVariables.slice(0, 3).map((variable) => (
                    <div key={variable} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-24 truncate font-medium">{variable}</span>
                      <select
                        value={transformations[variable] || 'none'}
                        onChange={(e) =>
                          setTransformations((prev) => ({
                            ...prev,
                            [variable]: e.target.value,
                          }))
                        }
                        className="flex-1 px-2 py-1 text-xs bg-slate-50/80 border border-slate-200/80 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500/30 cursor-pointer whitespace-nowrap"
                      >
                        <option value="none">None</option>
                        <option value="log">Log</option>
                        <option value="normalize">Normalize</option>
                        <option value="standardize">Standardize</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Toggle Switches */}
              <div className="space-y-2 mb-5">
                {[
                  { label: 'Interaction Terms', checked: interactionTerms, setter: setInteractionTerms },
                  { label: 'Cross-Validation (k=5)', checked: crossValidation, setter: setCrossValidation },
                  { label: 'Advanced Diagnostics', checked: advancedDiagnostics, setter: setAdvancedDiagnostics },
                ].map((toggle) => (
                  <label
                    key={toggle.label}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <span className="text-xs font-medium text-slate-600">{toggle.label}</span>
                    <button
                      onClick={() => toggle.setter(!toggle.checked)}
                      className={`relative w-9 h-5 rounded-full transition-all duration-300 cursor-pointer ${
                        toggle.checked ? 'bg-teal-500' : 'bg-slate-200'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${
                          toggle.checked ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </label>
                ))}
              </div>

              {/* Regularization */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                  Regularization: {regularizationStrength.toFixed(1)}
                </label>
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={regularizationStrength}
                    onChange={(e) => setRegularizationStrength(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                    <span>None</span>
                    <span>Strong</span>
                  </div>
                </div>
              </div>

              {/* Advanced Settings */}
              <button
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50/80 hover:bg-slate-100/80 rounded-lg transition-colors text-xs font-medium text-slate-600 cursor-pointer whitespace-nowrap"
              >
                <span className="flex items-center gap-1.5">
                  <i className="ri-tools-line text-slate-400"></i>
                  Advanced Settings
                </span>
                <i
                  className={`ri-arrow-${showAdvancedSettings ? 'up' : 'down'}-s-line text-slate-400 transition-transform duration-300`}
                ></i>
              </button>

              <div
                className={`overflow-hidden transition-all duration-400 ${
                  showAdvancedSettings ? 'max-h-60 mt-3 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="space-y-2">
                  {[
                    { label: 'Convergence Tolerance', defaultValue: '0.0001' },
                    { label: 'Max Iterations', defaultValue: '1000' },
                    { label: 'Random Seed', defaultValue: '42' },
                  ].map((field) => (
                    <div key={field.label}>
                      <label className="text-xs font-medium text-slate-500 mb-0.5 block">
                        {field.label}
                      </label>
                      <input
                        type="text"
                        defaultValue={field.defaultValue}
                        className="w-full px-2.5 py-1.5 text-xs bg-white/80 border border-slate-200/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500/30"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Model Summary Dashboard */}
          <div className="col-span-12 xl:col-span-9 space-y-5">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {modelMetrics.map((metric, idx) => (
                <div
                  key={metric.label}
                  className="group bg-white/70 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.04)] p-4 hover:shadow-[0_8px_32px_rgba(15,23,42,0.08)] hover:border-teal-200/60 transition-all duration-300 cursor-default relative overflow-hidden"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${getStatusGradient(metric.status)} opacity-60`} />
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center">
                      <i className={`${metric.icon} text-sm text-slate-500`}></i>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${getStatusDot(metric.status)}`} />
                  </div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{metric.label}</div>
                  <div className="text-xl font-bold text-slate-800 tracking-tight">{metric.value}</div>
                  {metric.delta && <div className="text-xs font-semibold text-emerald-600 mt-0.5">{metric.delta} vs prev</div>}
                  <div className="text-xs text-slate-400 mt-1 leading-tight opacity-0 group-hover:opacity-100 transition-opacity duration-300">{metric.interpretation}</div>
                </div>
              ))}
            </div>

            {/* Coefficient Table */}
            <div className="bg-white/70 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)] overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-teal-500 flex items-center justify-center">
                    <i className="ri-table-line text-white text-sm"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Coefficient Analysis</h3>
                    <p className="text-xs text-slate-400">{coefficientData.length} predictors &middot; Sorted by {sortColumn}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-teal-600 hover:bg-teal-50/80 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                    <i className="ri-filter-3-line mr-1"></i>Filter
                  </button>
                  <button className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-teal-600 hover:bg-teal-50/80 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                    <i className="ri-download-2-line mr-1"></i>Export
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/60">
                      {[
                        { key: 'variable', label: 'Variable' },
                        { key: 'coefficient', label: 'Coeff.' },
                        { key: 'standardizedBeta', label: 'Std. \u03B2' },
                        { key: 'tStatistic', label: 't-stat' },
                        { key: 'pValue', label: 'p-value' },
                        { key: 'vif', label: 'VIF' },
                        { key: 'ci', label: 'CI (95%)' },
                        { key: 'significance', label: 'Sig.' },
                        { key: 'impact', label: 'Impact' },
                      ].map((header) => (
                        <th
                          key={header.key}
                          onClick={() => header.key !== 'ci' && handleSort(header.key)}
                          className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${
                            header.key !== 'ci' ? 'cursor-pointer hover:text-teal-600' : ''
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            {header.label}
                            {sortColumn === header.key && (
                              <i className={`ri-arrow-${sortDirection === 'asc' ? 'up' : 'down'}-s-line text-teal-500`}></i>
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortedCoefficients.map((row) => (
                      <tr key={row.variable} className="hover:bg-teal-50/30 transition-colors group">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                row.significance === 'high'
                                  ? 'bg-emerald-500'
                                  : row.significance === 'moderate'
                                  ? 'bg-amber-500'
                                  : 'bg-slate-300'
                              }`}
                            />
                            <span className="text-xs font-semibold text-slate-800">{row.variable.replace(/_/g, ' ')}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono font-semibold text-slate-700">
                          {row.coefficient > 0 ? '+' : ''}
                          {row.coefficient.toFixed(3)}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-slate-600">{row.standardizedBeta.toFixed(3)}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-slate-600">{row.tStatistic.toFixed(2)}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`text-xs font-mono font-bold ${
                              row.pValue < 0.001
                                ? 'text-emerald-600'
                                : row.pValue < 0.01
                                ? 'text-teal-600'
                                : row.pValue < 0.05
                                ? 'text-amber-600'
                                : 'text-slate-500'
                            }`}
                          >
                            {row.pValue < 0.001 ? '<0.001' : row.pValue.toFixed(4)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`text-xs font-mono ${
                              row.vif < 2 ? 'text-emerald-600' : row.vif < 5 ? 'text-amber-600' : 'text-rose-600'
                            }`}
                          >
                            {row.vif.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-slate-500">
                          [{row.confidenceInterval[0].toFixed(2)}, {row.confidenceInterval[1].toFixed(2)}]
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-bold ${getSignificanceBadge(row.significance)}`}
                          >
                            {row.significance.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${getImpactBar(row.impact)}`} />
                            </div>
                            <span className="text-xs font-semibold text-slate-500 capitalize">{row.impact}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* 3. DIAGNOSTICS LAB */}
        {/* ==================================================== */}
        <div className="bg-white/70 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)] mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <i className="ri-microscope-line text-white text-sm"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Diagnostics Laboratory</h3>
              <p className="text-xs text-slate-400">Model assumption validation &amp; outlier detection</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100 px-5 overflow-x-auto gap-1">
            {Object.entries(diagnosticTests).map(([key, test]) => (
              <button
                key={key}
                onClick={() => setActiveDiagnosticTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer rounded-t-lg ${
                  activeDiagnosticTab === key
                    ? 'text-teal-700 bg-teal-50/60 border-b-2 border-teal-500'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/60'
                }`}
              >
                <i className={`${test.icon} text-sm`}></i>
                {test.name}
                <div className={`w-1.5 h-1.5 rounded-full ${getStatusDot(test.status)}`} />
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-5">
            {(() => {
              const test = diagnosticTests[activeDiagnosticTab];
              return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                        test.status === 'pass'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : test.status === 'warning'
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                          : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                      }`}
                    >
                      <i
                        className={`ri-${test.status === 'pass' ? 'checkbox-circle' : test.status === 'warning' ? 'error-warning' : 'close-circle'}-fill`}
                      ></i>
                      {test.status === 'pass'
                        ? 'ASSUMPTION MET'
                        : test.status === 'warning'
                        ? 'REVIEW NEEDED'
                        : 'ASSUMPTION VIOLATED'}
                    </div>

                    <div className="bg-slate-50/60 rounded-xl p-4 space-y-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Test Result</div>
                        <div className="text-base font-bold font-mono text-slate-800">{test.value}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">AI Interpretation</div>
                        <div className="text-xs text-slate-600 leading-relaxed">{test.interpretation}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Recommendation</div>
                        <div className="text-xs text-slate-600 leading-relaxed flex items-start gap-1.5">
                          <i className="ri-lightbulb-line text-teal-500 mt-0.5"></i>
                          {test.recommendation}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Visualization */}
                  <div className="bg-gradient-to-br from-slate-50/80 to-white rounded-xl p-4 border border-slate-100/80">
                    {activeDiagnosticTab === 'residual' && <ResidualPlot />}
                    {activeDiagnosticTab === 'multicollinearity' && <VIFHeatmap data={coefficientData} />}
                    {activeDiagnosticTab === 'normality' && (
                      <div className="h-48 flex flex-col items-center justify-center">
                        <div className="relative w-full h-32">
                          {/* Bell curve approximation */}
                          <div className="absolute inset-0 flex items-end justify-center">
                            {Array.from({ length: 30 }, (_, i) => {
                              const x = (i - 15) / 5;
                              const h = Math.exp(-x * x / 2) * 100;
                              return (
                                <div
                                  key={i}
                                  className="flex-1 mx-[1px] rounded-t-sm bg-gradient-to-t from-teal-500/60 to-teal-400/30 transition-all duration-500"
                                  style={{ height: `${h}%` }}
                                />
                              );
                            })}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 mt-2 font-medium">Q-Q Plot: Residuals vs Normal Distribution</div>
                      </div>
                    )}
                    {activeDiagnosticTab === 'homoscedasticity' && <ResidualPlot />}
                    {activeDiagnosticTab === 'autocorrelation' && (
                      <div className="h-48 flex flex-col items-center justify-center">
                        <div className="relative w-full h-32 flex items-end justify-center gap-[2px]">
                          {Array.from({ length: 20 }, (_, i) => {
                            const h = i === 0 ? 100 : Math.max(5, 100 * Math.exp(-i * 0.3) * (1 + Math.sin(i * 0.85) * 0.12));
                            return (
                              <div
                                key={i}
                                className="flex-1 rounded-t-sm bg-gradient-to-t from-indigo-500/60 to-indigo-400/30 transition-all duration-500"
                                style={{ height: `${h}%` }}
                              />
                            );
                          })}
                        </div>
                        <div className="w-full h-px bg-slate-200 mt-1" />
                        <div className="text-xs text-slate-400 mt-2 font-medium">ACF Plot: Lag 1-20 &middot; DW = 1.98</div>
                      </div>
                    )}
                    {activeDiagnosticTab === 'outliers' && (
                      <div className="h-48 flex flex-col items-center justify-center">
                        <div className="relative w-full h-32 flex items-end justify-center gap-[3px]">
                          {Array.from({ length: 25 }, (_, i) => {
                            const isOutlier = i === 8 || i === 15 || i === 21;
                            const h = isOutlier ? 88 + (i % 3) * 4 : 18 + ((i * 9) % 28);
                            return (
                              <div
                                key={i}
                                className={`flex-1 rounded-t-sm transition-all duration-500 ${
                                  isOutlier ? 'bg-gradient-to-t from-rose-500 to-rose-400' : 'bg-gradient-to-t from-teal-500/50 to-teal-400/20'
                                }`}
                                style={{ height: `${h}%` }}
                              />
                            );
                          })}
                        </div>
                        <div className="w-full h-px bg-rose-300 mt-1 relative">
                          <span className="absolute right-0 -top-3 text-[9px] text-rose-500 font-semibold">Threshold (4/n)</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-2 font-medium">Cook\u2019s Distance: 3 points above threshold</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ==================================================== */}
        {/* 4. PREDICTIVE INTELLIGENCE LAB + ROOT CAUSE BRIDGE */}
        {/* ==================================================== */}
        <div className="grid grid-cols-12 gap-6 mb-6">
          {/* Predictive Intelligence */}
          <div className="col-span-12 lg:col-span-8">
            <div className="bg-white/70 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                    <i className="ri-lightbulb-flash-line text-white text-sm"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Predictive Intelligence Lab</h3>
                    <p className="text-xs text-slate-400">What-if scenario modeling &amp; Monte Carlo simulation</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 cursor-pointer">
                    <button
                      onClick={() => setMonteCarloEnabled(!monteCarloEnabled)}
                      className={`relative w-8 h-4 rounded-full transition-all duration-300 cursor-pointer ${monteCarloEnabled ? 'bg-amber-500' : 'bg-slate-200'}`}
                    >
                      <div
                        className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-300 ${monteCarloEnabled ? 'left-[16px]' : 'left-0.5'}`}
                      />
                    </button>
                    Monte Carlo
                  </label>
                  {monteCarloEnabled && (
                    <select className="px-2 py-1 text-xs bg-slate-50/80 border border-slate-200/80 rounded-md cursor-pointer whitespace-nowrap">
                      <option>10,000 iterations</option>
                      <option>50,000 iterations</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-5">
                {/* Sliders */}
                <div className="col-span-8 space-y-4">
                  {Object.entries(scenarioValues).map(([key, val]) => {
                    const coef = coefficientData.find((c) => c.variable === key);
                    return (
                      <div key={key} className="bg-slate-50/60 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${coef && coef.coefficient < 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            />
                            <span className="text-xs font-semibold text-slate-700">{key.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold font-mono text-teal-600">{val}</span>
                            {coef && (
                              <span className="text-[9px] text-slate-400 font-medium">
                                &beta; = {coef.coefficient > 0 ? '+' : ''}
                                {coef.coefficient.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={val}
                          onChange={(e) => setScenarioValues((prev) => ({ ...prev, [key]: parseInt(e.target.value) }))}
                          className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer"
                        />
                      </div>
                    );
                  })}

                  {/* Forecast Chart Placeholder */}
                  <div className="bg-gradient-to-br from-slate-50/80 to-white rounded-xl p-4 border border-slate-100/80 h-36 relative overflow-hidden">
                    <div className="absolute inset-0 flex items-end px-4 pb-4">
                      {Array.from({ length: 30 }, (_, i) => {
                        const base = 20 + Math.sin(i * 0.3) * 8;
                        const trend = i > 15 ? -(i - 15) * 1.5 : 0;
                        const h = Math.max(5, base + trend + Math.sin(i * 0.72) * 4);
                        return (
                          <div key={i} className="flex-1 mx-[1px]">
                            <div
                              className={`rounded-t-sm transition-all duration-500 ${
                                i > 15 ? 'bg-gradient-to-t from-teal-500/70 to-teal-400/30' : 'bg-gradient-to-t from-slate-300/60 to-slate-200/30'
                              }`}
                              style={{ height: `${h}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="absolute top-3 left-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Forecast Projection
                    </div>
                    <div className="absolute top-3 right-4 flex items-center gap-3 text-[9px]">
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-sm bg-slate-300" /> Baseline
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-sm bg-teal-500" /> Projected
                      </span>
                    </div>
                  </div>
                </div>

                {/* Predicted Outcome */}
                <div className="col-span-4 space-y-3">
                  <div className="bg-gradient-to-br from-teal-500 via-teal-600 to-indigo-700 rounded-2xl p-5 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
                    <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
                    <div className="relative z-10">
                      <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-80">Predicted Outcome</div>
                      <div className="text-3xl font-bold tracking-tight">
                        {predictedOutcome} <span className="text-base font-normal opacity-80">min</span>
                      </div>
                      <div className="text-xs opacity-80 mt-0.5">Wait Time</div>
                      <div className="mt-4 pt-3 border-t border-white/20">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-80">95% Confidence Interval</div>
                        <div className="text-sm font-mono font-semibold">
                          [{(parseFloat(predictedOutcome) - 2.2).toFixed(1)},{' '}
                          {(parseFloat(predictedOutcome) + 2.2).toFixed(1)}] min
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50/60 rounded-xl p-4 border border-slate-100/80">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Risk Probability</div>
                    <div className="space-y-2">
                      {[
                        { label: 'Low Risk', pct: 72, color: 'from-emerald-500 to-emerald-400' },
                        { label: 'Medium Risk', pct: 22, color: 'from-amber-500 to-amber-400' },
                        { label: 'High Risk', pct: 6, color: 'from-rose-500 to-rose-400' },
                      ].map((risk) => (
                        <div key={risk.label}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="text-slate-500 font-medium">{risk.label}</span>
                            <span className="font-bold text-slate-700">{risk.pct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full bg-gradient-to-r ${risk.color} rounded-full transition-all duration-1000`}
                              style={{ width: `${risk.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-50/60 rounded-xl p-4 border border-slate-100/80">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sensitivity Matrix</div>
                    <SensitivityHeatmap />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Root Cause Bridge */}
          <div className="col-span-12 lg:col-span-4">
            <div className="bg-gradient-to-br from-indigo-50/80 via-white/80 to-teal-50/80 backdrop-blur-2xl rounded-2xl border border-indigo-200/40 shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-5 h-full flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <i className="ri-links-line text-white text-sm"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Root Cause Bridge</h3>
                    <p className="text-xs text-slate-400">DMAIC Analyze → Improve</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-2.5">
                {[
                  { variable: 'staff_count', type: 'Primary', impact: 'High', coefficient: -2.34, beta: -0.52 },
                  { variable: 'emergency_cases', type: 'Primary', impact: 'High', coefficient: 3.45, beta: 0.35 },
                  { variable: 'patient_volume', type: 'Primary', impact: 'High', coefficient: 0.89, beta: 0.41 },
                  { variable: 'time_of_day', type: 'Secondary', impact: 'Moderate', coefficient: 1.23, beta: 0.28 },
                  { variable: 'bed_availability', type: 'Secondary', impact: 'Moderate', coefficient: -1.12, beta: -0.19 },
                ].map((cause) => (
                  <div
                    key={cause.variable}
                    className="bg-white/80 rounded-xl p-3 border border-slate-200/60 hover:border-indigo-300/60 hover:shadow-md transition-all duration-300 cursor-default group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-800">{cause.variable.replace(/_/g, ' ')}</span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${
                          cause.type === 'Primary'
                            ? 'bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20'
                            : 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20'
                        }`}
                      >
                        {cause.type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        Impact: <span className="font-semibold text-slate-600">{cause.impact}</span>
                      </span>
                      <span className="font-mono text-slate-500">
                        &beta; = <span className="font-bold text-slate-700">{cause.beta}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <button className="mt-4 w-full py-2.5 bg-gradient-to-r from-indigo-600 to-teal-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/15 hover:shadow-xl hover:shadow-indigo-500/25 transition-all cursor-pointer whitespace-nowrap hover:scale-[1.02] active:scale-[0.98]">
                <i className="ri-send-plane-fill mr-1.5"></i>
                Send to Improve Phase
              </button>
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* 5. ACTION BAR */}
        {/* ==================================================== */}
        <div className="bg-white/70 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {[
              { icon: 'ri-save-line', label: 'Save Snapshot' },
              { icon: 'ri-history-line', label: 'Version History' },
              { icon: 'ri-file-list-line', label: 'Audit Trail' },
              { icon: 'ri-git-branch-line', label: 'Data Lineage' },
            ].map((action) => (
              <button
                key={action.label}
                className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-teal-600 hover:bg-teal-50/80 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <i className={`${action.icon} text-sm`}></i>
                {action.label}
              </button>
            ))}
            <select
              value={modelVersion}
              onChange={(e) => setModelVersion(e.target.value)}
              className="px-2 py-1 text-xs bg-slate-50/80 border border-slate-200/80 rounded-md cursor-pointer font-mono text-slate-500"
            >
              <option>v3.2.1</option>
              <option>v3.1.0</option>
              <option>v2.8.4</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAIPanel(true)}
              className="px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50/80 hover:bg-teal-100/80 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ring-1 ring-teal-200/60"
            >
              <i className="ri-brain-line text-sm"></i>
              AI Insights
            </button>
            <button className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50/80 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5">
              <i className="ri-file-pdf-2-line text-sm"></i>
              PDF
            </button>
            <button className="px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50/80 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5">
              <i className="ri-file-excel-2-line text-sm"></i>
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 6. AI INSIGHT ENGINE (Slide-in Panel) */}
      {/* ==================================================== */}
      {showAIPanel && (
        <>
          <div onClick={() => setShowAIPanel(false)} className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 cursor-pointer ai-panel-overlay" />
          <div className="fixed right-0 top-0 bottom-0 w-[460px] bg-white/95 backdrop-blur-2xl shadow-[-8px_0_40px_rgba(15,23,42,0.12)] z-50 overflow-y-auto ai-panel-slide">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-teal-600 via-teal-700 to-indigo-700 text-white p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <i className="ri-brain-line text-lg"></i>
                  Sigma AI Insight Engine
                </h3>
                <button onClick={() => setShowAIPanel(false)} className="w-7 h-7 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors cursor-pointer">
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>
              <p className="text-xs opacity-80">AI-Powered Statistical Intelligence Report</p>
            </div>

            <div className="p-5 space-y-5">
              {/* Model Quality */}
              <div className={`${aiPanelToneClass} border rounded-xl p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded-full ${aiPanelIconClass} flex items-center justify-center`}>
                    <i className="ri-checkbox-circle-fill text-white text-xs"></i>
                  </div>
                  <span className="text-sm font-bold">{modelQualityTone}</span>
                </div>
                <p className="text-xs leading-relaxed">
                  {modelQualityBody}
                </p>
              </div>

              {/* Top 3 Drivers */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                  <i className="ri-star-fill text-amber-500"></i>
                  Top 3 Statistical Drivers
                </h4>
                <div className="space-y-2.5">
                  {topDrivers.map((driver) => {
                    const theme = driverThemeMap[driver.color] || driverThemeMap.amber;
                    return (
                    <div
                      key={driver.rank}
                      className={`${theme.card} rounded-xl p-3`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-5 h-5 rounded-full ${theme.badge} flex items-center justify-center`}>
                          <span className="text-[9px] font-bold text-white">{driver.rank}</span>
                        </div>
                        <span className={`text-xs font-bold ${theme.title}`}>{driver.variable}</span>
                      </div>
                      <p className={`text-xs ${theme.effect} mb-0.5`}>{driver.effect}</p>
                      <p className={`text-xs ${theme.impact} opacity-80`}>{driver.impact}</p>
                    </div>
                  )})}
                </div>
              </div>

              {/* Effect Size */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2">Effect Size Interpretation</h4>
                <div className="bg-slate-50/80 rounded-xl p-3 text-xs text-slate-600 space-y-1.5 leading-relaxed">
                  <p>
                    <strong className="text-slate-800">Large Effect:</strong> {strongestDriver?.variable || 'The leading driver'} has the strongest standardized effect, making it the clearest operational lever in the current model.
                  </p>
                  <p>
                    <strong className="text-slate-800">Medium Effects:</strong> {mediumDrivers.length > 0 ? mediumDrivers.map((driver) => driver.variable.replace(/_/g, ' ')).join(', ') : 'Secondary variables'} show medium-sized effects and should be managed as coordinated supporting levers.
                  </p>
                  <p>
                    <strong className="text-slate-800">Small Effects:</strong> {smallDrivers.length > 0 ? smallDrivers.map((driver) => driver.variable.replace(/_/g, ' ')).join(', ') : 'The remaining variables'} add directional context, but they should not drive the first wave of intervention on their own.
                  </p>
                </div>
              </div>

              {/* Risk */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <i className="ri-alert-line text-rose-500"></i>
                  Risk Implications
                </h4>
                <div className="bg-rose-50/60 border border-rose-200/60 rounded-xl p-3 text-xs text-rose-700 space-y-1.5 leading-relaxed">
                  <p>
                    <strong>Critical Risk:</strong> {staffingDriver ? `The model still shows staffing pressure as the largest controllable risk, with a coefficient of ${staffingDriver.coefficient.toFixed(2)} per unit shift.` : 'Current operational capacity is still the largest controllable risk.'}
                  </p>
                  <p>
                    <strong>Operational Risk:</strong> {emergencyDriver ? `Emergency-case surges add roughly ${emergencyDriver.coefficient.toFixed(2)} units of pressure per case, which can cascade through flow and service levels.` : 'Demand spikes still create cascading bottlenecks through the system.'}
                  </p>
                  <p>
                    <strong>Mitigation Priority:</strong> Focus first on staffing flexibility, then demand-shaping and triage discipline to absorb peak-hour volatility.
                  </p>
                </div>
              </div>

              {/* Executive Summary */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2">Executive Summary</h4>
                <div className="bg-indigo-50/60 border border-indigo-200/60 rounded-xl p-3 text-xs text-indigo-800 space-y-1.5 leading-relaxed">
                  <p>
                    Statistical analysis shows that <strong>{strongestDriver?.variable || 'the leading driver'}</strong> offers the strongest immediate improvement path. A focused operational shift on that lever is projected to change the outcome by about <strong>{projectedStaffingLift.toFixed(1)} units</strong>, or roughly <strong>{projectedRelativeImprovement.toFixed(0)}%</strong> versus the current modeled baseline.
                  </p>
                  <p>
                    {patientVolumeDriver && emergencyDriver
                      ? `Patient volume and emergency demand should be treated as the next constraints to stabilize, since together they add ${(
                          patientVolumeDriver.coefficient + emergencyDriver.coefficient
                        ).toFixed(2)} modeled units of pressure when they rise in tandem.`
                      : 'Secondary operational levers should be managed as supporting actions once the primary driver is under tighter control.'}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <i className="ri-lightbulb-line text-teal-500"></i>
                  Recommended Action Triggers
                </h4>
                <div className="space-y-1.5">
                  {[
                    'Implement dynamic staffing model based on predicted patient volume',
                    'Create dedicated emergency triage pathway to reduce bottlenecks',
                    'Deploy real-time monitoring dashboard for proactive intervention',
                    'Establish staffing thresholds: Alert when ratio exceeds 1:8',
                  ].map((action, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50/60 rounded-lg p-2">
                      <i className="ri-arrow-right-circle-fill text-teal-500 mt-0.5 text-sm"></i>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Download */}
              <button className="w-full py-3 bg-gradient-to-r from-teal-600 to-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer whitespace-nowrap hover:scale-[1.01] active:scale-[0.99]">
                <i className="ri-file-download-line mr-1.5"></i>
                Download Executive Report (PDF)
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes scatter-in {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scatter-in {
          animation: scatter-in 0.4s ease-out forwards;
          opacity: 0;
        }
        .ai-panel-overlay {
          animation: fadeIn 0.2s ease-out;
        }
        .ai-panel-slide {
          animation: slideInRight 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
