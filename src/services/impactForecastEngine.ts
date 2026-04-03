import { supabase } from '../lib/supabase';

export interface ImpactScenario {
  id: string;
  name: string;
  description: string;
  investment: number;
  timeline: string;
  roi: number;
  risk: 'Low' | 'Medium' | 'High';
  annualImpact: number;
  probability: number;
  breakdown: {
    processEfficiency: number;
    qualityImprovement: number;
    resourceOptimization: number;
    wasteReduction: number;
  };
}

export interface ForecastData {
  month: string;
  baseline: number;
  withActions: number;
  optimistic: number;
  pessimistic: number;
}

export interface ImpactBreakdown {
  category: string;
  baseline: number;
  withActions: number;
  change: string;
  changePercent: number;
}

function calculateSeriesMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateSeriesStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = calculateSeriesMean(values);
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

interface OrganizationForecastContext {
  orgId: string | null;
  metrics: Array<{ name: string; current_value: number | null; target_value: number | null }>;
  recommendations: Array<{ impact_score: number | null; status: string | null }>;
  projects: Array<{ phase: string | null; status: string | null }>;
  activeAlerts: Array<{ severity: string | null }>;
  openActions: Array<{ status: string | null }>;
}

async function resolveOrganizationId(userId: string): Promise<string | null> {
  const { data: membership } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (membership?.organization_id) return membership.organization_id;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();

  return profile?.organization_id ?? null;
}

async function loadForecastContext(userId: string): Promise<OrganizationForecastContext> {
  const orgId = await resolveOrganizationId(userId);

  if (!orgId) {
    return {
      orgId: null,
      metrics: [],
      recommendations: [],
      projects: [],
      activeAlerts: [],
      openActions: [],
    };
  }

  const [metricsRes, recommendationsRes, projectsRes, alertsRes, actionsRes] = await Promise.all([
    supabase
      .from('metrics')
      .select('name, current_value, target_value')
      .eq('organization_id', orgId),
    supabase
      .from('recommendations')
      .select('impact_score, status')
      .eq('organization_id', orgId)
      .in('status', ['pending', 'in_progress', 'approved']),
    supabase
      .from('dmaic_projects')
      .select('phase, status')
      .eq('organization_id', orgId)
      .in('status', ['active', 'in_progress', 'measure', 'analyze', 'improve', 'control']),
    supabase
      .from('alerts')
      .select('severity')
      .eq('organization_id', orgId)
      .in('status', ['new', 'acknowledged']),
    supabase
      .from('action_items')
      .select('status')
      .eq('organization_id', orgId)
      .not('status', 'eq', 'completed'),
  ]);

  return {
    orgId,
    metrics: metricsRes.data ?? [],
    recommendations: recommendationsRes.data ?? [],
    projects: projectsRes.data ?? [],
    activeAlerts: alertsRes.data ?? [],
    openActions: actionsRes.data ?? [],
  };
}

function computeCategoryBaselines(metrics: OrganizationForecastContext['metrics']) {
  const buckets = {
    processEfficiency: 0,
    qualityImprovement: 0,
    resourceOptimization: 0,
    wasteReduction: 0,
  };

  metrics.forEach((metric) => {
    const name = metric.name.toLowerCase();
    const value = Number(metric.current_value ?? metric.target_value ?? 0);
    if (!Number.isFinite(value) || value <= 0) return;

    if (name.includes('wait') || name.includes('los') || name.includes('discharge') || name.includes('turnaround')) {
      buckets.processEfficiency += value;
    } else if (name.includes('readmission') || name.includes('lab') || name.includes('quality') || name.includes('infection')) {
      buckets.qualityImprovement += value;
    } else if (name.includes('bed') || name.includes('nurse') || name.includes('staff') || name.includes('capacity')) {
      buckets.resourceOptimization += value;
    } else {
      buckets.wasteReduction += value;
    }
  });

  const normalized = {
    processEfficiency: Math.max(40, Math.round(buckets.processEfficiency || 65)),
    qualityImprovement: Math.max(30, Math.round(buckets.qualityImprovement || 55)),
    resourceOptimization: Math.max(30, Math.round(buckets.resourceOptimization || 50)),
    wasteReduction: Math.max(20, Math.round(buckets.wasteReduction || 35)),
  };

  return normalized;
}

function buildScenarioDefinitions(context: OrganizationForecastContext) {
  const recommendationImpact = context.recommendations.reduce((sum, rec) => sum + (Number(rec.impact_score ?? 0) * 1200), 0);
  const phaseImpactMap: Record<string, number> = {
    define: 12000,
    measure: 26000,
    analyze: 48000,
    improve: 72000,
    control: 96000,
  };
  const projectImpact = context.projects.reduce((sum, project) => sum + (phaseImpactMap[(project.phase ?? '').toLowerCase()] ?? 18000), 0);
  const alertPressure = context.activeAlerts.reduce((sum, alert) => {
    if (alert.severity === 'critical') return sum + 22000;
    if (alert.severity === 'high') return sum + 12000;
    return sum + 4000;
  }, 0);
  const actionLoadImpact = context.openActions.length * 5000;

  const metricsWithTargets = context.metrics.filter(metric =>
    Number.isFinite(Number(metric.current_value)) &&
    Number.isFinite(Number(metric.target_value)) &&
    Number(metric.target_value) > 0
  );
  const attainment =
    metricsWithTargets.length > 0
      ? metricsWithTargets.reduce((sum, metric) => sum + (Number(metric.current_value) / Number(metric.target_value)), 0) / metricsWithTargets.length
      : 0.82;

  const readinessPenalty = Math.max(0.75, Math.min(1.15, attainment));
  const totalImpact = Math.max(160000, Math.round((recommendationImpact + projectImpact + alertPressure + actionLoadImpact) * readinessPenalty));
  const totalInvestment = Math.max(70000, Math.round(totalImpact * 0.34));

  return [
    {
      id: 'stabilize',
      name: 'Stabilize & Triage',
      description: 'Address the most urgent bottlenecks first and protect service levels before scaling improvement.',
      multiplier: 0.28,
      investmentMultiplier: 0.24,
      probability: 92,
      risk: 'Low' as const,
      timelineMonths: 3,
      mix: { processEfficiency: 0.37, qualityImprovement: 0.26, resourceOptimization: 0.22, wasteReduction: 0.15 },
    },
    {
      id: 'balanced',
      name: 'Balanced Improvement',
      description: 'Pursue the strongest proven actions while keeping execution load realistic for the current team.',
      multiplier: 0.68,
      investmentMultiplier: 0.66,
      probability: 83,
      risk: 'Low' as const,
      timelineMonths: 8,
      mix: { processEfficiency: 0.34, qualityImprovement: 0.28, resourceOptimization: 0.24, wasteReduction: 0.14 },
    },
    {
      id: 'capacity',
      name: 'Capacity Recovery',
      description: 'Lean into throughput, staffing, and bed/capacity improvements to absorb sustained operational pressure.',
      multiplier: 0.95,
      investmentMultiplier: 0.92,
      probability: 72,
      risk: 'Medium' as const,
      timelineMonths: 12,
      mix: { processEfficiency: 0.31, qualityImprovement: 0.24, resourceOptimization: 0.31, wasteReduction: 0.14 },
    },
    {
      id: 'transformation',
      name: 'Transformation Program',
      description: 'Coordinate broad process and quality redesign across workflows, systems, and operating governance.',
      multiplier: 1.24,
      investmentMultiplier: 1.42,
      probability: 58,
      risk: 'High' as const,
      timelineMonths: 18,
      mix: { processEfficiency: 0.29, qualityImprovement: 0.31, resourceOptimization: 0.27, wasteReduction: 0.13 },
    },
  ].map(definition => ({
    ...definition,
    totalImpact,
    totalInvestment,
  }));
}

/**
 * Generate impact scenarios based on active recommendations and projects
 */
export async function generateImpactScenarios(userId: string): Promise<ImpactScenario[]> {
  try {
    const context = await loadForecastContext(userId);
    const definitions = buildScenarioDefinitions(context);

    return definitions.map(definition => {
      const annualImpact = Math.round(definition.totalImpact * definition.multiplier);
      const investment = Math.round(definition.totalInvestment * definition.investmentMultiplier);
      const roi = investment > 0 ? Math.round(((annualImpact - investment) / investment) * 100) : 0;

      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        investment,
        timeline: `${Math.max(2, definition.timelineMonths - 1)}-${definition.timelineMonths + 1} months`,
        roi,
        risk: definition.risk,
        annualImpact,
        probability: definition.probability,
        breakdown: {
          processEfficiency: Math.round(annualImpact * definition.mix.processEfficiency),
          qualityImprovement: Math.round(annualImpact * definition.mix.qualityImprovement),
          resourceOptimization: Math.round(annualImpact * definition.mix.resourceOptimization),
          wasteReduction: Math.round(annualImpact * definition.mix.wasteReduction),
        },
      };
    });
  } catch (error) {
    console.error('Error generating impact scenarios:', error);
    return [];
  }
}

/**
 * Generate forecast data for KPI projections
 */
export async function generateKPIForecast(
  userId: string,
  timeHorizon: number = 12,
  scenarioId: string = 'balanced'
): Promise<ForecastData[]> {
  try {
    const orgId = await resolveOrganizationId(userId);

    let baseline = 2400;
    let recentValues: number[] = [];

    if (orgId) {
      const { data: metricData } = await supabase
        .from('metric_data')
        .select('value')
        .eq('organization_id', orgId)
        .order('timestamp', { ascending: false })
        .limit(30);

      if (metricData && metricData.length > 0) {
        recentValues = metricData
          .map(d => Number(d.value))
          .filter(value => Number.isFinite(value));
        baseline = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
      }
    }

    const scenarios = await generateImpactScenarios(userId);
    const selectedScenario = scenarios.find(s => s.id === scenarioId) || scenarios[1] || scenarios[0];
    if (!selectedScenario) return [];

    const monthlyImpact = selectedScenario.annualImpact / 12;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const forecasts: ForecastData[] = [];
    const trailingStdDev = calculateSeriesStdDev(recentValues);
    const safeStdDev = trailingStdDev > 0 ? trailingStdDev : baseline * 0.015;
    const recentTrend = recentValues.length >= 2
      ? (recentValues[0] - recentValues[recentValues.length - 1]) / Math.max(recentValues.length - 1, 1)
      : 0;

    for (let i = 0; i < timeHorizon; i++) {
      const monthIndex = (new Date().getMonth() + i) % 12;
      const improvementFactor = (i + 1) / timeHorizon;
      const cumulativeImpact = monthlyImpact * improvementFactor;
      const seasonalityPhase = ((monthIndex + 1) / 12) * Math.PI * 2;
      const seasonalOffset = Math.sin(seasonalityPhase) * safeStdDev * 0.35;
      const trendOffset = recentTrend * (i + 1);
      const projectedBaseline = baseline + trendOffset + seasonalOffset;
      const spread = Math.max(safeStdDev * (1 + i * 0.03), baseline * 0.01);

      forecasts.push({
        month: months[monthIndex],
        baseline: Math.round(projectedBaseline),
        withActions: Math.round(projectedBaseline + cumulativeImpact),
        optimistic: Math.round(projectedBaseline + cumulativeImpact + spread * 0.8),
        pessimistic: Math.round(projectedBaseline + cumulativeImpact - spread * 0.8)
      });
    }

    return forecasts;
  } catch (error) {
    console.error('Error generating KPI forecast:', error);
    return [];
  }
}

/**
 * Calculate impact breakdown by category
 */
export async function calculateImpactBreakdown(
  userId: string,
  scenarioId: string = 'balanced'
): Promise<ImpactBreakdown[]> {
  try {
    const context = await loadForecastContext(userId);
    const scenarios = await generateImpactScenarios(userId);
    const scenario = scenarios.find(s => s.id === scenarioId) || scenarios[1] || scenarios[0];
    if (!scenario) return [];
    const baselines = computeCategoryBaselines(context.metrics);

    const breakdown: ImpactBreakdown[] = [
      {
        category: 'Process Efficiency',
        baseline: baselines.processEfficiency,
        withActions: baselines.processEfficiency + scenario.breakdown.processEfficiency / 1000,
        change: '',
        changePercent: 0
      },
      {
        category: 'Quality Improvement',
        baseline: baselines.qualityImprovement,
        withActions: baselines.qualityImprovement + scenario.breakdown.qualityImprovement / 1000,
        change: '',
        changePercent: 0
      },
      {
        category: 'Resource Optimization',
        baseline: baselines.resourceOptimization,
        withActions: baselines.resourceOptimization + scenario.breakdown.resourceOptimization / 1000,
        change: '',
        changePercent: 0
      },
      {
        category: 'Waste Reduction',
        baseline: baselines.wasteReduction,
        withActions: baselines.wasteReduction + scenario.breakdown.wasteReduction / 1000,
        change: '',
        changePercent: 0
      }
    ];

    // Calculate changes
    breakdown.forEach(item => {
      const changePercent = ((item.withActions - item.baseline) / item.baseline) * 100;
      item.changePercent = Math.round(changePercent);
      item.change = `+${item.changePercent}%`;
    });

    return breakdown;
  } catch (error) {
    console.error('Error calculating impact breakdown:', error);
    return [];
  }
}

/**
 * Calculate ROI metrics
 */
export interface ROIMetrics {
  investment: number;
  annualSavings: number;
  roi: number;
  paybackMonths: number;
  netPresentValue: number;
  breakEvenDate: string;
}

export async function calculateROI(
  userId: string,
  scenarioId: string = 'balanced',
  implementationScope: number = 100,
  successRate: number = 100,
  timelineMonths: number = 12
): Promise<ROIMetrics> {
  try {
    const scenarios = await generateImpactScenarios(userId);
    const scenario = scenarios.find(s => s.id === scenarioId) || scenarios[1] || scenarios[0];
    if (!scenario) {
      throw new Error('No forecast scenario available');
    }

    const adjustedInvestment = scenario.investment * (implementationScope / 100);
    const timelineFactor = Math.max(0.7, Math.min(1.25, 12 / Math.max(timelineMonths, 6)));
    const adjustedSavings = scenario.annualImpact * (implementationScope / 100) * (successRate / 100) * timelineFactor;
    const monthlySavings = adjustedSavings / 12;

    const roi = adjustedInvestment > 0 ? ((adjustedSavings - adjustedInvestment) / adjustedInvestment) * 100 : 0;
    const paybackMonths = monthlySavings > 0 ? adjustedInvestment / monthlySavings : 0;

    // Calculate NPV (assuming 10% discount rate)
    const discountRate = 0.1;
    let npv = -adjustedInvestment;
    for (let year = 1; year <= 3; year++) {
      const yearlyRamp = Math.min(1, (year * 12) / Math.max(timelineMonths, 6));
      npv += (adjustedSavings * yearlyRamp) / Math.pow(1 + discountRate, year);
    }

    // Calculate break-even date
    const breakEvenDate = new Date();
    breakEvenDate.setMonth(breakEvenDate.getMonth() + Math.ceil(paybackMonths));

    return {
      investment: Math.round(adjustedInvestment),
      annualSavings: Math.round(adjustedSavings),
      roi: Math.round(roi),
      paybackMonths: Math.round(paybackMonths * 10) / 10,
      netPresentValue: Math.round(npv),
      breakEvenDate: breakEvenDate.toLocaleDateString()
    };
  } catch (error) {
    console.error('Error calculating ROI:', error);
    return {
      investment: 0,
      annualSavings: 0,
      roi: 0,
      paybackMonths: 0,
      netPresentValue: 0,
      breakEvenDate: new Date().toLocaleDateString()
    };
  }
}

/**
 * Generate sensitivity analysis
 */
export interface SensitivityAnalysis {
  parameter: string;
  baseValue: number;
  scenarios: {
    value: number;
    roi: number;
    payback: number;
    impact: number;
  }[];
}

export async function generateSensitivityAnalysis(
  userId: string,
  scenarioId: string = 'balanced'
): Promise<SensitivityAnalysis[]> {
  try {
    // Generate scenarios for Implementation Scope
    const scopeScenarios = await Promise.all(
      [50, 70, 100, 120].map(async (scope) => {
        const roi = await calculateROI(userId, scenarioId, scope, 100);
        return {
          value: scope,
          roi: roi.roi,
          payback: roi.paybackMonths,
          impact: roi.annualSavings
        };
      })
    );

    // Generate scenarios for Success Rate
    const successScenarios = await Promise.all(
      [60, 80, 100, 120].map(async (rate) => {
        const roi = await calculateROI(userId, scenarioId, 100, rate);
        return {
          value: rate,
          roi: roi.roi,
          payback: roi.paybackMonths,
          impact: roi.annualSavings
        };
      })
    );

    const analysis: SensitivityAnalysis[] = [
      {
        parameter: 'Implementation Scope',
        baseValue: 100,
        scenarios: scopeScenarios
      },
      {
        parameter: 'Success Rate',
        baseValue: 100,
        scenarios: successScenarios
      }
    ];

    return analysis;
  } catch (error) {
    console.error('Error generating sensitivity analysis:', error);
    return [];
  }
}
