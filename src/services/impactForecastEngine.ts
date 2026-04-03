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

/**
 * Generate impact scenarios based on active recommendations and projects
 */
export async function generateImpactScenarios(userId: string): Promise<ImpactScenario[]> {
  try {
    // Fetch active recommendations (keyed by user_id)
    const { data: recommendations } = await supabase
      .from('recommendations')
      .select('impact_score, status')
      .eq('user_id', userId)
      .in('status', ['pending', 'in_progress']);

    // Get user's organization for project lookup
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();

    const orgId = profileData?.organization_id;

    // Fetch active DMAIC projects using correct columns (no expected_savings column)
    let projects: any[] = [];
    if (orgId) {
      const { data: projectData } = await supabase
        .from('dmaic_projects')
        .select('id, name, phase, status')
        .eq('organization_id', orgId)
        .not('status', 'eq', 'completed');
      projects = projectData || [];
    }

    let totalImpact = 0;
    let totalInvestment = 0;

    if (recommendations) {
      recommendations.forEach(rec => {
        const impactValue = (rec.impact_score || 0) * 1000;
        totalImpact += impactValue;
        totalInvestment += impactValue * 0.35;
      });
    }

    // Estimate project impact based on phase (no expected_savings column)
    const phaseImpactMap: Record<string, number> = {
      define: 10000,
      measure: 25000,
      analyze: 50000,
      improve: 80000,
      control: 100000
    };

    projects.forEach(proj => {
      const phaseImpact = phaseImpactMap[proj.phase] || 20000;
      totalImpact += phaseImpact;
      totalInvestment += phaseImpact * 0.25;
    });

    // Ensure minimum values so UI is always meaningful
    if (totalImpact === 0) {
      totalImpact = 500000;
      totalInvestment = 175000;
    }

    const scenarios: ImpactScenario[] = [
      {
        id: 'minimal',
        name: 'Minimal Investment',
        description: 'Implement only quick wins and low-hanging fruit',
        investment: Math.round(totalInvestment * 0.25),
        timeline: '2-3 months',
        roi: 180,
        risk: 'Low',
        annualImpact: Math.round(totalImpact * 0.15),
        probability: 95,
        breakdown: {
          processEfficiency: Math.round(totalImpact * 0.15 * 0.4),
          qualityImprovement: Math.round(totalImpact * 0.15 * 0.25),
          resourceOptimization: Math.round(totalImpact * 0.15 * 0.2),
          wasteReduction: Math.round(totalImpact * 0.15 * 0.15)
        }
      },
      {
        id: 'balanced',
        name: 'Balanced Approach',
        description: 'Implement 70% of recommendations with proven ROI',
        investment: Math.round(totalInvestment * 0.7),
        timeline: '6-8 months',
        roi: 286,
        risk: 'Low',
        annualImpact: Math.round(totalImpact * 0.7),
        probability: 85,
        breakdown: {
          processEfficiency: Math.round(totalImpact * 0.7 * 0.38),
          qualityImprovement: Math.round(totalImpact * 0.7 * 0.28),
          resourceOptimization: Math.round(totalImpact * 0.7 * 0.22),
          wasteReduction: Math.round(totalImpact * 0.7 * 0.12)
        }
      },
      {
        id: 'aggressive',
        name: 'Aggressive Growth',
        description: 'Full implementation with accelerated timeline',
        investment: Math.round(totalInvestment * 1.2),
        timeline: '10-12 months',
        roi: 220,
        risk: 'Medium',
        annualImpact: Math.round(totalImpact * 1.1),
        probability: 70,
        breakdown: {
          processEfficiency: Math.round(totalImpact * 1.1 * 0.36),
          qualityImprovement: Math.round(totalImpact * 1.1 * 0.3),
          resourceOptimization: Math.round(totalImpact * 1.1 * 0.24),
          wasteReduction: Math.round(totalImpact * 1.1 * 0.1)
        }
      },
      {
        id: 'transformation',
        name: 'Full Transformation',
        description: 'Complete organizational transformation with new technologies',
        investment: Math.round(totalInvestment * 2),
        timeline: '14-18 months',
        roi: 195,
        risk: 'High',
        annualImpact: Math.round(totalImpact * 1.5),
        probability: 60,
        breakdown: {
          processEfficiency: Math.round(totalImpact * 1.5 * 0.35),
          qualityImprovement: Math.round(totalImpact * 1.5 * 0.32),
          resourceOptimization: Math.round(totalImpact * 1.5 * 0.25),
          wasteReduction: Math.round(totalImpact * 1.5 * 0.08)
        }
      }
    ];

    return scenarios;
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
    // Get user's organization for scoped metric_data query
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();

    const orgId = profileData?.organization_id;

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
    const selectedScenario = scenarios.find(s => s.id === scenarioId) || scenarios[1];

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
    const scenarios = await generateImpactScenarios(userId);
    const scenario = scenarios.find(s => s.id === scenarioId) || scenarios[1];

    const breakdown: ImpactBreakdown[] = [
      {
        category: 'Process Efficiency',
        baseline: 180,
        withActions: scenario.breakdown.processEfficiency / 1000,
        change: '',
        changePercent: 0
      },
      {
        category: 'Quality Improvement',
        baseline: 120,
        withActions: scenario.breakdown.qualityImprovement / 1000,
        change: '',
        changePercent: 0
      },
      {
        category: 'Resource Optimization',
        baseline: 95,
        withActions: scenario.breakdown.resourceOptimization / 1000,
        change: '',
        changePercent: 0
      },
      {
        category: 'Waste Reduction',
        baseline: 68,
        withActions: scenario.breakdown.wasteReduction / 1000,
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
  successRate: number = 100
): Promise<ROIMetrics> {
  try {
    const scenarios = await generateImpactScenarios(userId);
    const scenario = scenarios.find(s => s.id === scenarioId) || scenarios[1];

    const adjustedInvestment = scenario.investment * (implementationScope / 100);
    const adjustedSavings = scenario.annualImpact * (implementationScope / 100) * (successRate / 100);
    const monthlySavings = adjustedSavings / 12;

    const roi = adjustedInvestment > 0 ? ((adjustedSavings - adjustedInvestment) / adjustedInvestment) * 100 : 0;
    const paybackMonths = monthlySavings > 0 ? adjustedInvestment / monthlySavings : 0;

    // Calculate NPV (assuming 10% discount rate)
    const discountRate = 0.1;
    let npv = -adjustedInvestment;
    for (let year = 1; year <= 3; year++) {
      npv += adjustedSavings / Math.pow(1 + discountRate, year);
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
