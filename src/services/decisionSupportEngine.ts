import { supabase } from '../lib/supabase';

export interface DecisionScenario {
  id: string;
  name: string;
  cost: string;
  timeline: string;
  roi: number;
  risk: 'Low' | 'Medium' | 'High';
  impact: string;
  score: number;
  pros: string[];
  cons: string[];
}

export interface RecommendationJustification {
  id: string;
  recommendation: string;
  reasoning: string;
  dataEvidence: string[];
  confidence: number;
  sources: string[];
  expectedOutcome: string;
  risks: string[];
  alternatives: string[];
}

export interface TradeOffAnalysis {
  benefits: {
    category: string;
    items: string[];
  }[];
  considerations: {
    category: string;
    items: string[];
  }[];
  netScore: number;
  recommendation: 'Proceed' | 'Proceed with Caution' | 'Reconsider';
}

export interface ConfidenceFactor {
  factor: string;
  score: number;
  description: string;
  weight: number;
}

interface OrgContext {
  orgId: string | null;
  recommendations: any[];
  projects: any[];
  actionItems: any[];
  alerts: any[];
  metrics: any[];
  forecasts: any[];
  anomalies: any[];
  qualityResults: any[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatCurrency = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return `$${Math.round(value)}`;
};

async function getOrganizationId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();

  if (data?.organization_id) {
    return data.organization_id;
  }

  const { data: membership } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.organization_id ?? null;
}

async function loadOrgContext(userId: string): Promise<OrgContext> {
  const orgId = await getOrganizationId(userId);
  if (!orgId) {
    return {
      orgId: null,
      recommendations: [],
      projects: [],
      actionItems: [],
      alerts: [],
      metrics: [],
      forecasts: [],
      anomalies: [],
      qualityResults: [],
    };
  }

  const [
    { data: recommendations },
    { data: projects },
    { data: actionItems },
    { data: alerts },
    { data: metrics },
    { data: forecasts },
    { data: anomalies },
    { data: qualityResults },
  ] = await Promise.all([
    supabase
      .from('recommendations')
      .select('*')
      .eq('organization_id', orgId)
      .in('status', ['pending', 'in_progress', 'completed'])
      .order('impact_score', { ascending: false }),
    supabase
      .from('dmaic_projects')
      .select('*')
      .eq('organization_id', orgId)
      .in('status', ['active', 'in_progress', 'define', 'measure', 'analyze', 'improve', 'control', 'completed']),
    supabase
      .from('action_items')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('alerts')
      .select('*')
      .eq('organization_id', orgId)
      .in('status', ['new', 'acknowledged', 'resolved'])
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('metrics')
      .select('id, name, current_value, target_value, unit, updated_at')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('forecasts')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('anomalies')
      .select('*')
      .eq('organization_id', orgId)
      .order('detected_at', { ascending: false })
      .limit(50),
    supabase
      .from('data_quality_results')
      .select('*')
      .eq('organization_id', orgId)
      .order('checked_at', { ascending: false })
      .limit(100),
  ]);

  return {
    orgId,
    recommendations: recommendations ?? [],
    projects: projects ?? [],
    actionItems: actionItems ?? [],
    alerts: alerts ?? [],
    metrics: metrics ?? [],
    forecasts: forecasts ?? [],
    anomalies: anomalies ?? [],
    qualityResults: qualityResults ?? [],
  };
}

function scenarioRiskLabel(riskScore: number): 'Low' | 'Medium' | 'High' {
  if (riskScore >= 72) return 'High';
  if (riskScore >= 45) return 'Medium';
  return 'Low';
}

function buildScenarioPros(name: string, risk: 'Low' | 'Medium' | 'High', impact: number, actionLoad: number): string[] {
  const base = [
    `${formatCurrency(impact)} annualized upside if execution stays on track`,
    `${risk} delivery risk based on current alert and action load`,
  ];

  if (name === 'Stabilize & Triage') {
    return [...base, 'Smallest coordination burden across frontline teams', 'Useful for stabilizing the operation before wider rollout'];
  }

  if (name === 'Balanced Improvement') {
    return [...base, 'Best balance between impact capture and execution pressure', 'Fits a phased rollout without stalling active work'];
  }

  if (name === 'Capacity Recovery') {
    return [...base, `Captures more upside while ${actionLoad} open actions are still manageable`, 'Good fit when leadership wants faster visible results'];
  }

  return [...base, 'Captures the highest upside if teams can absorb sustained change', 'Most useful when the organization is ready for broad transformation'];
}

function buildScenarioCons(name: string, risk: 'Low' | 'Medium' | 'High', alertPressure: number): string[] {
  const base = [
    `${alertPressure} active alert signal${alertPressure === 1 ? '' : 's'} still competing for attention`,
    `${risk} chance of execution drag if staffing or ownership is unclear`,
  ];

  if (name === 'Stabilize & Triage') {
    return [...base, 'May not clear the full backlog of recommended improvements', 'Can leave strategic upside on the table'];
  }

  if (name === 'Balanced Improvement') {
    return [...base, 'Requires active program management and change discipline', 'Needs consistent sponsor support to hold pace'];
  }

  if (name === 'Capacity Recovery') {
    return [...base, 'Higher resource contention across teams and projects', 'More exposed to adoption fatigue if alerts rise further'];
  }

  return [...base, 'Largest coordination load across operations and analytics', 'Hardest option to sustain if near-term risk pressure increases'];
}

/**
 * Generate decision scenarios for comparison
 */
export async function generateDecisionScenarios(userId: string): Promise<DecisionScenario[]> {
  try {
    const context = await loadOrgContext(userId);
    if (!context.orgId) return [];

    const activeRecommendations = context.recommendations.filter((rec) =>
      ['pending', 'in_progress'].includes(rec.status)
    );
    const activeProjects = context.projects.filter((project) =>
      ['active', 'in_progress', 'define', 'measure', 'analyze', 'improve', 'control'].includes(project.status)
    );
    const openActions = context.actionItems.filter((item) =>
      ['open', 'pending', 'in_progress', 'not_started'].includes(item.status)
    );
    const activeAlerts = context.alerts.filter((alert) =>
      ['new', 'acknowledged'].includes(alert.status)
    );

    const recommendationImpact = activeRecommendations.reduce(
      (sum, rec) => sum + ((rec.impact_score || 0) * 1000),
      0
    );
    const projectImpact = activeProjects.reduce(
      (sum, project) => sum + (project.expected_savings || 0),
      0
    );
    const totalImpactPotential = Math.max(50000, recommendationImpact + projectImpact);

    const effortLoad = activeRecommendations.reduce(
      (sum, rec) => sum + (rec.effort_score || 40),
      0
    );
    const actionLoad = openActions.length;
    const alertPressure = activeAlerts.length;
    const criticalAlerts = activeAlerts.filter((alert) => alert.severity === 'critical').length;

    const baseInvestment = Math.max(
      25000,
      (effortLoad * 450) + (actionLoad * 1800) + (criticalAlerts * 5000)
    );

    const scenarioConfigs = [
      { id: 'scenario-1', name: 'Stabilize & Triage', costMultiplier: 0.4, impactCapture: 0.28, months: 3, accelerationPenalty: 4, executionBoost: 10 },
      { id: 'scenario-2', name: 'Balanced Improvement', costMultiplier: 0.85, impactCapture: 0.72, months: 7, accelerationPenalty: 8, executionBoost: 18 },
      { id: 'scenario-3', name: 'Capacity Recovery', costMultiplier: 1.2, impactCapture: 0.98, months: 10, accelerationPenalty: 18, executionBoost: 10 },
      { id: 'scenario-4', name: 'Transformation Program', costMultiplier: 1.55, impactCapture: 1.18, months: 15, accelerationPenalty: 28, executionBoost: 2 },
    ];

    return scenarioConfigs.map((config) => {
      const estimatedCost = Math.round(baseInvestment * config.costMultiplier);
      const annualImpact = Math.round(totalImpactPotential * config.impactCapture);
      const roi = Math.round(((annualImpact - estimatedCost) / Math.max(estimatedCost, 1)) * 100);

      const riskScore = clamp(
        18 +
          criticalAlerts * 12 +
          Math.round(alertPressure * 3.5) +
          Math.round(actionLoad * 1.8) +
          config.accelerationPenalty -
          config.executionBoost,
        20,
        92
      );

      const score = clamp(
        Math.round(
          55 +
            Math.min(25, roi / 18) +
            Math.min(12, annualImpact / 150000) -
            riskScore * 0.32
        ),
        45,
        96
      );

      const risk = scenarioRiskLabel(riskScore);

      return {
        id: config.id,
        name: config.name,
        cost: formatCurrency(estimatedCost),
        timeline: `${config.months}-${config.months + 1} months`,
        roi,
        risk,
        impact: formatCurrency(annualImpact),
        score,
        pros: buildScenarioPros(config.name, risk, annualImpact, actionLoad),
        cons: buildScenarioCons(config.name, risk, alertPressure),
      };
    });
  } catch (error) {
    console.error('Error generating decision scenarios:', error);
    return [];
  }
}

/**
 * Generate detailed justification for recommendations
 */
export async function generateRecommendationJustification(
  userId: string,
  recommendationId?: string
): Promise<RecommendationJustification[]> {
  try {
    const context = await loadOrgContext(userId);
    if (!context.orgId) return [];

    const scopedRecommendations = context.recommendations
      .filter((rec) => ['pending', 'in_progress'].includes(rec.status))
      .filter((rec) => (recommendationId ? rec.id === recommendationId : true))
      .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0))
      .slice(0, recommendationId ? 1 : 5);

    const metricsWithTargets = context.metrics.filter((metric) => metric.target_value);
    const openAlerts = context.alerts.filter((alert) => ['new', 'acknowledged'].includes(alert.status));
    const recentForecasts = context.forecasts.slice(0, 5);

    return scopedRecommendations.map((rec) => {
      const dataEvidence: string[] = [];
      const sources: string[] = [];

      if (metricsWithTargets.length > 0) {
        const offTarget = metricsWithTargets.filter((metric) => {
          if (!metric.target_value || metric.target_value === 0) return false;
          return Math.abs(((metric.current_value || 0) - metric.target_value) / metric.target_value) > 0.1;
        }).length;
        dataEvidence.push(`${metricsWithTargets.length} metrics have defined targets, with ${offTarget} meaningfully off target.`);
        sources.push(`Metrics layer (${metricsWithTargets.length} target-backed measures)`);
      }

      if (openAlerts.length > 0) {
        dataEvidence.push(`${openAlerts.length} active alert${openAlerts.length === 1 ? '' : 's'} are reinforcing the need for action.`);
        sources.push('Predictive alert stream');
      }

      if (context.anomalies.length > 0) {
        dataEvidence.push(`${context.anomalies.length} recent anomaly signal${context.anomalies.length === 1 ? '' : 's'} are in the same decision environment.`);
        sources.push('Anomaly detection history');
      }

      if (recentForecasts.length > 0) {
        dataEvidence.push(`${recentForecasts.length} recent forecast${recentForecasts.length === 1 ? '' : 's'} contribute forward-looking context.`);
        sources.push('Forecast models and scenario outputs');
      }

      dataEvidence.push(`Confidence score is ${rec.confidence_score || 0}% and impact score is ${rec.impact_score || 0}.`);
      sources.push('Recommendation engine scoring');

      return {
        id: rec.id,
        recommendation: rec.title,
        reasoning:
          rec.description ||
          'This recommendation is being prioritized because live performance, alert, and forecast signals all point to a meaningful operating gap.',
        dataEvidence,
        confidence: rec.confidence_score || 0,
        sources,
        expectedOutcome:
          rec.expected_impact ||
          `Expected improvement in ${rec.category || 'performance'} once the action sequence is completed.`,
        risks: [
          'Execution may slow if ownership is not assigned quickly.',
          'Benefits may arrive later if existing alert pressure interrupts rollout.',
          'Frontline adoption risk rises when the action requires process changes across shifts.',
          'Resource contention is likely if multiple high-priority actions launch at the same time.',
        ],
        alternatives: [
          'Pilot the action in one team or shift before wider rollout.',
          'Split the action into a short stabilization phase and a later optimization phase.',
          'Delay lower-impact changes and focus only on the highest-yield step first.',
          'Pair the recommendation with a monitoring checkpoint before full rollout.',
        ],
      };
    });
  } catch (error) {
    console.error('Error generating recommendation justification:', error);
    return [];
  }
}

/**
 * Analyze trade-offs for decision making
 */
export async function analyzeTradeOffs(
  userId: string,
  scenarioId: string = 'balanced'
): Promise<TradeOffAnalysis> {
  try {
    const scenarios = await generateDecisionScenarios(userId);
    const normalizedId = scenarioId.startsWith('scenario-') ? scenarioId : `scenario-${scenarioId}`;
    const scenario = scenarios.find((item) => item.id === normalizedId) || scenarios[1];

    if (!scenario) {
      return {
        benefits: [],
        considerations: [],
        netScore: 0,
        recommendation: 'Reconsider',
      };
    }

    const context = await loadOrgContext(userId);
    const openActions = context.actionItems.filter((item) => ['open', 'pending', 'in_progress', 'not_started'].includes(item.status)).length;
    const criticalAlerts = context.alerts.filter((alert) => alert.status !== 'resolved' && alert.severity === 'critical').length;
    const completedProjects = context.projects.filter((project) => project.status === 'completed').length;

    return {
      benefits: [
        {
          category: 'Financial',
          items: [
            `${scenario.impact} estimated annual upside`,
            `${scenario.roi}% return on investment`,
            `Cost to execute is currently modeled at ${scenario.cost}`,
            `Completed improvement history: ${completedProjects} completed project${completedProjects === 1 ? '' : 's'}`,
          ],
        },
        {
          category: 'Operational',
          items: [
            `${openActions} active action${openActions === 1 ? '' : 's'} already create a live delivery baseline`,
            `${criticalAlerts} critical alert${criticalAlerts === 1 ? '' : 's'} define the urgency of intervention`,
            `Timeline assumption: ${scenario.timeline}`,
            'Execution path is based on live recommendation and project load',
          ],
        },
        {
          category: 'Strategic',
          items: [
            `Decision score is ${scenario.score}/100`,
            `Risk profile is ${scenario.risk.toLowerCase()}`,
            'Supports more transparent trade-off review with frontline and leadership teams',
            'Creates a reusable decision record inside AIM',
          ],
        },
      ],
      considerations: [
        {
          category: 'Investment',
          items: [
            `Upfront cost estimate: ${scenario.cost}`,
            `Execution window: ${scenario.timeline}`,
            'Training and adoption work still need explicit ownership',
            'Benefits will lag if workflow capacity is already constrained',
          ],
        },
        {
          category: 'Operational Risk',
          items: [
            `Current risk classification: ${scenario.risk}`,
            `${criticalAlerts} critical signal${criticalAlerts === 1 ? '' : 's'} could interrupt rollout pacing`,
            `${openActions} concurrent action${openActions === 1 ? '' : 's'} may compete for the same teams`,
            'Escalation handling must stay active during implementation',
          ],
        },
        {
          category: 'Execution Readiness',
          items: [
            'Clear due dates and owners are required for the scenario to stay on track',
            'A phased rollout is safer if shift-to-shift adoption varies',
            'Progress checkpoints should be tied to metric movement, not just task completion',
            'Leadership review is needed before broader scale-up',
          ],
        },
      ],
      netScore: scenario.score,
      recommendation:
        scenario.score >= 85 ? 'Proceed' : scenario.score >= 70 ? 'Proceed with Caution' : 'Reconsider',
    };
  } catch (error) {
    console.error('Error analyzing trade-offs:', error);
    return {
      benefits: [],
      considerations: [],
      netScore: 0,
      recommendation: 'Reconsider',
    };
  }
}

/**
 * Calculate confidence score breakdown
 */
export async function calculateConfidenceBreakdown(
  userId: string,
  recommendationId?: string
): Promise<{ factors: ConfidenceFactor[]; overallScore: number }> {
  try {
    const context = await loadOrgContext(userId);
    if (!context.orgId) {
      return { factors: [], overallScore: 0 };
    }

    const passedChecks = context.qualityResults.filter((item) => item.status === 'passed').length;
    const totalChecks = context.qualityResults.length;
    const dataQualityScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 70;

    const metricsWithTargets = context.metrics.filter((metric) => metric.target_value && metric.target_value !== 0);
    const metricsWithTargetsScore = context.metrics.length > 0
      ? Math.round((metricsWithTargets.length / context.metrics.length) * 100)
      : 60;

    const forecastAccuracyValues = context.forecasts
      .map((forecast) => Number(forecast.accuracy))
      .filter((value) => Number.isFinite(value) && value > 0);
    const modelAccuracyScore = forecastAccuracyValues.length > 0
      ? Math.round(forecastAccuracyValues.reduce((sum, value) => sum + value, 0) / forecastAccuracyValues.length)
      : clamp(metricsWithTargetsScore, 65, 88);

    const openRecommendations = context.recommendations.filter((rec) => ['pending', 'in_progress'].includes(rec.status));
    const recommendationConfidenceValues = openRecommendations
      .filter((rec) => !recommendationId || rec.id === recommendationId)
      .map((rec) => rec.confidence_score || 0)
      .filter((value) => value > 0);
    const signalAlignmentScore = recommendationConfidenceValues.length > 0
      ? Math.round(recommendationConfidenceValues.reduce((sum, value) => sum + value, 0) / recommendationConfidenceValues.length)
      : 72;

    const completedActions = context.actionItems.filter((item) => item.status === 'completed').length;
    const openActions = context.actionItems.filter((item) => ['open', 'pending', 'in_progress', 'not_started'].includes(item.status)).length;
    const implementationReadinessScore = clamp(
      68 + completedActions * 4 - openActions * 2,
      45,
      94
    );

    const coverageDepthScore = clamp(
      55 +
        Math.min(20, metricsWithTargets.length * 3) +
        Math.min(15, context.forecasts.length * 2) +
        Math.min(10, totalChecks > 0 ? 10 : 0),
      55,
      95
    );

    const factors: ConfidenceFactor[] = [
      {
        factor: 'Data Quality',
        score: dataQualityScore,
        description: totalChecks > 0
          ? `${passedChecks} of ${totalChecks} recent quality checks passed`
          : 'No recent quality checks were available, so SigmaSense is using a conservative baseline.',
        weight: 0.25,
      },
      {
        factor: 'Model Accuracy',
        score: modelAccuracyScore,
        description: forecastAccuracyValues.length > 0
          ? `Average forecast accuracy is ${modelAccuracyScore}% across recent model runs`
          : 'Forecast coverage is limited, so model confidence is based on target-backed metric coverage.',
        weight: 0.25,
      },
      {
        factor: 'Coverage Depth',
        score: coverageDepthScore,
        description: `${metricsWithTargets.length} metrics with targets and ${context.forecasts.length} forecast${context.forecasts.length === 1 ? '' : 's'} are contributing evidence`,
        weight: 0.2,
      },
      {
        factor: 'Signal Alignment',
        score: signalAlignmentScore,
        description: recommendationConfidenceValues.length > 0
          ? `Open recommendation confidence averages ${signalAlignmentScore}%`
          : 'No active recommendation confidence was available, so SigmaSense is using the broader operational signal set.',
        weight: 0.2,
      },
      {
        factor: 'Implementation Readiness',
        score: implementationReadinessScore,
        description: `${completedActions} completed actions vs ${openActions} still in flight`,
        weight: 0.1,
      },
    ];

    const overallScore = Math.round(
      factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0)
    );

    return { factors, overallScore };
  } catch (error) {
    console.error('Error calculating confidence breakdown:', error);
    return {
      factors: [],
      overallScore: 0,
    };
  }
}

/**
 * Generate decision brief document
 */
export interface DecisionBrief {
  title: string;
  executiveSummary: string;
  recommendedScenario: DecisionScenario;
  keyFindings: string[];
  risks: string[];
  nextSteps: string[];
  generatedAt: string;
}

export async function generateDecisionBrief(
  userId: string,
  scenarioId: string = 'scenario-2'
): Promise<DecisionBrief> {
  const scenarios = await generateDecisionScenarios(userId);
  const scenario = scenarios.find((item) => item.id === scenarioId) || scenarios[1];
  const tradeOffs = await analyzeTradeOffs(userId, scenarioId);
  const confidence = await calculateConfidenceBreakdown(userId);

  if (!scenario) {
    throw new Error('No decision scenarios available');
  }

  return {
    title: `Decision Brief: ${scenario.name}`,
    executiveSummary: `SigmaSense recommends the "${scenario.name}" option based on current live recommendation pressure, active alerts, execution load, and expected financial upside. The scenario balances ${scenario.cost} of estimated delivery cost against ${scenario.impact} of annualized value, with an overall confidence score of ${confidence.overallScore}%.`,
    recommendedScenario: scenario,
    keyFindings: [
      `Estimated annual upside: ${scenario.impact}`,
      `Projected ROI: ${scenario.roi}%`,
      `Delivery timeline: ${scenario.timeline}`,
      `Current risk classification: ${scenario.risk}`,
      `Decision score: ${scenario.score}/100`,
      `Confidence score: ${confidence.overallScore}%`,
    ],
    risks: tradeOffs.considerations.flatMap((group) => group.items).slice(0, 5),
    nextSteps: [
      'Validate the chosen scenario with operations and finance leads.',
      'Assign owners and due states to the top supporting actions.',
      'Tie implementation checkpoints to live KPI movement inside AIM.',
      'Review alert pressure weekly during rollout.',
      'Capture outcomes so SigmaSense can improve future decision scoring.',
    ],
    generatedAt: new Date().toISOString(),
  };
}
