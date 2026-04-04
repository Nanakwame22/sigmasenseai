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
  metrics: Array<{ id: string; name: string; current_value: number | null; target_value: number | null; unit: string | null }>;
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
      .select('id, name, current_value, target_value, unit')
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
  const recommendationImpact = context.recommendations.reduce((sum, rec) => sum + (Number(rec.impact_score ?? 0) * 450), 0);
  const phaseImpactMap: Record<string, number> = {
    define: 6000,
    measure: 12000,
    analyze: 18000,
    improve: 26000,
    control: 34000,
  };
  const projectImpact = context.projects.reduce((sum, project) => sum + (phaseImpactMap[(project.phase ?? '').toLowerCase()] ?? 18000), 0);
  const alertPressure = context.activeAlerts.reduce((sum, alert) => {
    if (alert.severity === 'critical') return sum + 12000;
    if (alert.severity === 'high') return sum + 7000;
    return sum + 2500;
  }, 0);
  const actionLoadImpact = context.openActions.length * 2500;

  const metricsWithTargets = context.metrics.filter(metric =>
    Number.isFinite(Number(metric.current_value)) &&
    Number.isFinite(Number(metric.target_value)) &&
    Number(metric.target_value) > 0
  );
  const targetAlignmentGap = metricsWithTargets.reduce((sum, metric) => {
    const current = Number(metric.current_value ?? 0);
    const target = Number(metric.target_value ?? 0);
    if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return sum;
    return sum + Math.min(1.5, Math.abs(current - target) / target);
  }, 0);
  const telemetryBreadth = context.metrics.length * 1400;
  const readinessPenalty = Math.max(
    0.82,
    Math.min(1.12, 1 + (context.activeAlerts.length * 0.015) - (context.recommendations.length * 0.01))
  );
  const totalImpact = Math.round(
    Math.max(
      18000,
      (targetAlignmentGap * 14000 + recommendationImpact + projectImpact + alertPressure + actionLoadImpact + telemetryBreadth) * readinessPenalty
    )
  );
  const totalInvestment = Math.round(
    Math.max(
      12000,
      totalImpact * (0.2 + context.projects.length * 0.012 + context.activeAlerts.length * 0.004)
    )
  );

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
  scenarioId: string = 'balanced',
  metricId?: string
): Promise<ForecastData[]> {
  try {
    const context = await loadForecastContext(userId);
    const targetMetric =
      (metricId ? context.metrics.find((metric) => metric.id === metricId) : undefined) ??
      context.metrics.find((metric) =>
        Number.isFinite(Number(metric.current_value)) &&
        Number.isFinite(Number(metric.target_value))
      ) ??
      context.metrics[0];

    let recentValues: number[] = [];
    let baseline = Number(targetMetric?.current_value ?? 0);
    let targetValue = Number(targetMetric?.target_value ?? baseline);

    if (context.orgId && targetMetric?.id) {
      const { data: metricData } = await supabase
        .from('metric_data')
        .select('value, timestamp')
        .eq('organization_id', context.orgId)
        .eq('metric_id', targetMetric.id)
        .order('timestamp', { ascending: true })
        .limit(36);

      if (metricData && metricData.length > 0) {
        recentValues = metricData
          .map(d => Number(d.value))
          .filter(value => Number.isFinite(value));
        baseline = Number(recentValues[recentValues.length - 1] ?? baseline);
      }
    }

    if (!Number.isFinite(baseline) || baseline === 0) {
      baseline = Number(targetMetric?.target_value ?? 1);
    }
    if (!Number.isFinite(targetValue) || targetValue === 0) {
      targetValue = baseline;
    }

    const scenarios = await generateImpactScenarios(userId);
    const selectedScenario = scenarios.find(s => s.id === scenarioId) || scenarios[1] || scenarios[0];
    if (!selectedScenario) return [];

    const scenarioCaptureMap: Record<string, number> = {
      stabilize: 0.35,
      balanced: 0.55,
      capacity: 0.72,
      transformation: 0.88,
    };
    const scenarioCapture = scenarioCaptureMap[scenarioId] ?? 0.55;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const forecasts: ForecastData[] = [];
    const trailingStdDev = calculateSeriesStdDev(recentValues);
    const safeStdDev = trailingStdDev > 0 ? trailingStdDev : Math.max(Math.abs(baseline) * 0.03, 1);
    const recentTrend = recentValues.length >= 2
      ? (recentValues[recentValues.length - 1] - recentValues[0]) / Math.max(recentValues.length - 1, 1)
      : 0;
    const targetGap = targetValue - baseline;

    for (let i = 0; i < timeHorizon; i++) {
      const monthIndex = (new Date().getMonth() + i) % 12;
      const improvementFactor = (i + 1) / timeHorizon;
      const seasonalityPhase = ((monthIndex + 1) / 12) * Math.PI * 2;
      const seasonalOffset = Math.sin(seasonalityPhase) * safeStdDev * 0.35;
      const trendOffset = recentTrend * (i + 1);
      const projectedBaseline = baseline + trendOffset + seasonalOffset;
      const actionLift = targetGap * improvementFactor * scenarioCapture;
      const optimisticLift = targetGap * improvementFactor * Math.min(1.05, scenarioCapture + 0.18);
      const pessimisticLift = targetGap * improvementFactor * Math.max(0.18, scenarioCapture - 0.2);

      forecasts.push({
        month: months[monthIndex],
        baseline: Number(projectedBaseline.toFixed(1)),
        withActions: Number((projectedBaseline + actionLift).toFixed(1)),
        optimistic: Number((projectedBaseline + optimisticLift).toFixed(1)),
        pessimistic: Number((projectedBaseline + pessimisticLift).toFixed(1))
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
    const alertFactor = Math.min(0.24, 0.08 + context.activeAlerts.length * 0.015);
    const actionFactor = Math.min(0.2, 0.06 + context.openActions.length * 0.01);
    const recommendationFactor = Math.min(0.18, 0.05 + context.recommendations.length * 0.01);

    const withActions = {
      processEfficiency: scenario.breakdown.processEfficiency,
      qualityImprovement: scenario.breakdown.qualityImprovement,
      resourceOptimization: scenario.breakdown.resourceOptimization,
      wasteReduction: scenario.breakdown.wasteReduction,
    };

    const baselineValues = {
      processEfficiency: Math.round(withActions.processEfficiency * (1 - alertFactor)),
      qualityImprovement: Math.round(withActions.qualityImprovement * (1 - recommendationFactor)),
      resourceOptimization: Math.round(withActions.resourceOptimization * (1 - actionFactor)),
      wasteReduction: Math.round(withActions.wasteReduction * (1 - Math.max(0.05, recommendationFactor - 0.02))),
    };

    const breakdown: ImpactBreakdown[] = [
      {
        category: 'Process Efficiency',
        baseline: baselineValues.processEfficiency,
        withActions: withActions.processEfficiency,
        change: '',
        changePercent: 0
      },
      {
        category: 'Quality Improvement',
        baseline: baselineValues.qualityImprovement,
        withActions: withActions.qualityImprovement,
        change: '',
        changePercent: 0
      },
      {
        category: 'Resource Optimization',
        baseline: baselineValues.resourceOptimization,
        withActions: withActions.resourceOptimization,
        change: '',
        changePercent: 0
      },
      {
        category: 'Waste Reduction',
        baseline: baselineValues.wasteReduction,
        withActions: withActions.wasteReduction,
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
