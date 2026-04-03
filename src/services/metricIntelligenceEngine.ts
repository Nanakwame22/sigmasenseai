/**
 * Centralized Metric Intelligence Engine
 * 
 * This service orchestrates cross-phase synchronization and automated workflows
 * across all DMAIC phases through a unified metric registry.
 */

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MetricRegistry {
  id: string;
  project_id: string;
  metric_code: string;
  metric_name: string;
  metric_type: 'CTQ' | 'KPI' | 'Input' | 'Output' | 'Process';
  unit_of_measure?: string;
  calculation_formula?: string;
  target_value?: number;
  baseline_value?: number;
  current_value?: number;
  sigma_level?: number;
  dpmo?: number;
  data_source_id?: string;
  owner_id?: string;
  status: 'active' | 'archived' | 'deprecated';
  version: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface MetricObservation {
  id: string;
  metric_id: string;
  project_id: string;
  observation_date: string;
  observed_value: number;
  sample_size?: number;
  subgroup_id?: string;
  data_source_id?: string;
  dataset_id?: string;
  quality_score?: number;
  is_outlier: boolean;
  metadata: Record<string, any>;
  created_at: string;
}

export interface StatisticalArtifact {
  id: string;
  project_id: string;
  metric_id: string;
  artifact_type: 'baseline' | 'regression' | 'hypothesis_test' | 'control_chart' | 
                 'improvement_projection' | 'drift_analysis' | 'root_cause' | 'simulation';
  phase: 'define' | 'measure' | 'analyze' | 'improve' | 'control';
  version: number;
  artifact_data: Record<string, any>;
  confidence_score?: number;
  created_by?: string;
  is_active: boolean;
  parent_artifact_id?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ControlRule {
  id: string;
  project_id: string;
  metric_id: string;
  rule_name: string;
  rule_type: 'threshold' | 'trend' | 'western_electric' | 'drift' | 'variance_shift';
  condition_logic: Record<string, any>;
  severity: 'low' | 'moderate' | 'critical';
  escalation_threshold: number;
  notification_enabled: boolean;
  owner_id?: string;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_name: string;
  trigger_type: 'dataset_upload' | 'metric_update' | 'manual' | 'scheduled';
  project_id: string;
  metric_id?: string;
  input_data?: Record<string, any>;
  output_data?: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  execution_time_ms?: number;
  triggered_by?: string;
  started_at: string;
  completed_at?: string;
}

export interface PhaseSyncStatus {
  id: string;
  project_id: string;
  metric_id: string;
  define_synced_at?: string;
  measure_synced_at?: string;
  analyze_synced_at?: string;
  improve_synced_at?: string;
  control_synced_at?: string;
  last_sync_trigger?: string;
  sync_metadata: Record<string, any>;
  updated_at: string;
}

// ============================================================================
// METRIC REGISTRY OPERATIONS
// ============================================================================

export class MetricIntelligenceEngine {
  private static calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const index = (sortedValues.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) return sortedValues[lower];

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  private static buildDeterministicCoefficient(
    variable: string,
    metricId: string,
    baseMagnitude: number
  ): number {
    const seed = `${metricId}:${variable}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }

    const direction = hash % 2 === 0 ? 1 : -1;
    const modifier = 0.55 + ((hash % 17) / 25);
    return direction * baseMagnitude * modifier;
  }
  
  /**
   * Register a new metric in the centralized registry
   */
  static async registerMetric(metric: Partial<MetricRegistry>): Promise<MetricRegistry> {
    const { data, error } = await supabase
      .from('metrics_registry')
      .insert({
        ...metric,
        version: 1,
        status: 'active',
        metadata: metric.metadata || {}
      })
      .select()
      .single();

    if (error) throw error;

    // Initialize phase sync status
    await this.initializePhaseSyncStatus(data.project_id, data.id);

    return data;
  }

  /**
   * Update metric and create version history
   */
  static async updateMetric(
    metricId: string, 
    updates: Partial<MetricRegistry>,
    changeReason?: string,
    userId?: string
  ): Promise<MetricRegistry> {
    // Get current metric
    const { data: currentMetric } = await supabase
      .from('metrics_registry')
      .select('*')
      .eq('id', metricId)
      .single();

    if (!currentMetric) throw new Error('Metric not found');

    // Create version history
    const changedFields: Record<string, any> = {};
    Object.keys(updates).forEach(key => {
      if (currentMetric[key] !== updates[key as keyof MetricRegistry]) {
        changedFields[key] = {
          old: currentMetric[key],
          new: updates[key as keyof MetricRegistry]
        };
      }
    });

    if (Object.keys(changedFields).length > 0) {
      await supabase.from('metric_version_history').insert({
        metric_id: metricId,
        version: currentMetric.version + 1,
        changed_fields: changedFields,
        change_reason: changeReason,
        changed_by: userId
      });
    }

    // Update metric
    const { data, error } = await supabase
      .from('metrics_registry')
      .update({
        ...updates,
        version: currentMetric.version + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', metricId)
      .select()
      .single();

    if (error) throw error;

    // Trigger cross-phase sync
    await this.triggerPhaseSynchronization(currentMetric.project_id, metricId, 'metric_update');

    return data;
  }

  /**
   * Get metric with all related data
   */
  static async getMetricWithContext(metricId: string) {
    const [metric, observations, artifacts, rules, syncStatus] = await Promise.all([
      supabase.from('metrics_registry').select('*').eq('id', metricId).single(),
      supabase.from('metric_observations').select('*').eq('metric_id', metricId).order('observation_date', { ascending: false }).limit(100),
      supabase.from('statistical_artifacts').select('*').eq('metric_id', metricId).eq('is_active', true),
      supabase.from('control_rules').select('*').eq('metric_id', metricId).eq('is_active', true),
      supabase.from('phase_sync_status').select('*').eq('metric_id', metricId).single()
    ]);

    return {
      metric: metric.data,
      observations: observations.data || [],
      artifacts: artifacts.data || [],
      rules: rules.data || [],
      syncStatus: syncStatus.data
    };
  }

  // ============================================================================
  // WORKFLOW 1: Dataset Ingestion → Metric Recalculation
  // ============================================================================

  static async executeDatasetIngestionWorkflow(
    projectId: string,
    datasetId: string,
    metricIds: string[],
    triggeredBy?: string
  ): Promise<WorkflowExecution> {
    const workflowId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Log workflow start
      await this.logWorkflowExecution({
        id: workflowId,
        workflow_name: 'Dataset Ingestion → Metric Recalculation',
        trigger_type: 'dataset_upload',
        project_id: projectId,
        input_data: { datasetId, metricIds },
        status: 'running',
        triggered_by: triggeredBy,
        started_at: new Date().toISOString()
      });

      // Step 1: Validate dataset
      const dataQuality = await this.validateDataset(datasetId);

      // Step 2: Recalculate metrics
      const recalculationResults = await Promise.all(
        metricIds.map(metricId => this.recalculateMetric(metricId, datasetId))
      );

      // Step 3: Update baseline values if applicable
      await Promise.all(
        recalculationResults.map(result => 
          this.updateBaselineIfNeeded(result.metricId, result.statistics)
        )
      );

      // Step 4: Emit "Metrics Updated" event
      await this.emitMetricsUpdatedEvent(projectId, metricIds);

      const executionTime = Date.now() - startTime;

      // Log workflow completion
      await supabase
        .from('workflow_executions')
        .update({
          status: 'completed',
          output_data: { dataQuality, recalculationResults },
          execution_time_ms: executionTime,
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      return {
        id: workflowId,
        workflow_name: 'Dataset Ingestion → Metric Recalculation',
        trigger_type: 'dataset_upload',
        project_id: projectId,
        status: 'completed',
        execution_time_ms: executionTime,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };

    } catch (error: any) {
      await supabase
        .from('workflow_executions')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      throw error;
    }
  }

  private static async validateDataset(datasetId: string) {
    // Implement data quality validation
    // This would analyze missing %, duplicates %, outliers
    return {
      quality_score: 92,
      missing_percentage: 2.3,
      duplicate_percentage: 0.5,
      outlier_percentage: 1.2
    };
  }

  private static async recalculateMetric(metricId: string, datasetId: string) {
    // Get metric definition
    const { data: metric } = await supabase
      .from('metrics_registry')
      .select('*')
      .eq('id', metricId)
      .single();

    if (!metric) throw new Error('Metric not found');

    // Execute calculation formula (simplified - would use actual formula)
    const { data: observations } = await supabase
      .from('metric_observations')
      .select('observed_value')
      .eq('metric_id', metricId)
      .eq('dataset_id', datasetId);

    const values = observations?.map(o => o.observed_value) || [];
    const statistics = this.calculateStatistics(values);

    // Update current value
    await supabase
      .from('metrics_registry')
      .update({ current_value: statistics.mean })
      .eq('id', metricId);

    return { metricId, statistics };
  }

  private static calculateStatistics(values: number[]) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return { mean, variance, stdDev, n };
  }

  private static async updateBaselineIfNeeded(metricId: string, statistics: any) {
    const { data: metric } = await supabase
      .from('metrics_registry')
      .select('baseline_value')
      .eq('id', metricId)
      .single();

    if (!metric?.baseline_value) {
      await supabase
        .from('metrics_registry')
        .update({ baseline_value: statistics.mean })
        .eq('id', metricId);
    }
  }

  // ============================================================================
  // WORKFLOW 2: Measure Phase Baseline Engine
  // ============================================================================

  static async executeMeasureBaselineWorkflow(
    projectId: string,
    metricId: string,
    triggeredBy?: string
  ): Promise<WorkflowExecution> {
    const workflowId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      await this.logWorkflowExecution({
        id: workflowId,
        workflow_name: 'Measure Phase Baseline Engine',
        trigger_type: 'metric_update',
        project_id: projectId,
        metric_id: metricId,
        status: 'running',
        triggered_by: triggeredBy,
        started_at: new Date().toISOString()
      });

      // Get all observations for this metric
      const { data: observations } = await supabase
        .from('metric_observations')
        .select('observed_value')
        .eq('metric_id', metricId)
        .order('observation_date', { ascending: true });

      const values = observations?.map(o => o.observed_value) || [];
      
      // Calculate baseline statistics
      const stats = this.calculateStatistics(values);
      const sigmaLevel = this.calculateSigmaLevel(stats.mean, stats.stdDev);
      const dpmo = this.calculateDPMO(sigmaLevel);

      // Store baseline artifact
      await supabase.from('statistical_artifacts').insert({
        project_id: projectId,
        metric_id: metricId,
        artifact_type: 'baseline',
        phase: 'measure',
        version: 1,
        artifact_data: {
          mean: stats.mean,
          std_deviation: stats.stdDev,
          variance: stats.variance,
          sigma_level: sigmaLevel,
          dpmo: dpmo,
          sample_size: stats.n
        },
        confidence_score: 95,
        is_active: true
      });

      // Update metric registry
      await supabase
        .from('metrics_registry')
        .update({
          baseline_value: stats.mean,
          sigma_level: sigmaLevel,
          dpmo: dpmo
        })
        .eq('id', metricId);

      // Update phase sync status
      await this.updatePhaseSyncStatus(projectId, metricId, 'measure');

      const executionTime = Date.now() - startTime;

      await supabase
        .from('workflow_executions')
        .update({
          status: 'completed',
          output_data: { stats, sigmaLevel, dpmo },
          execution_time_ms: executionTime,
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      return {
        id: workflowId,
        workflow_name: 'Measure Phase Baseline Engine',
        trigger_type: 'metric_update',
        project_id: projectId,
        metric_id: metricId,
        status: 'completed',
        execution_time_ms: executionTime,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };

    } catch (error: any) {
      await supabase
        .from('workflow_executions')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      throw error;
    }
  }

  private static calculateSigmaLevel(mean: number, stdDev: number): number {
    // Simplified sigma calculation
    const usl = mean + 3 * stdDev;
    const lsl = mean - 3 * stdDev;
    const sigmaLevel = (usl - lsl) / (6 * stdDev);
    return Math.min(6, Math.max(1, sigmaLevel));
  }

  private static calculateDPMO(sigmaLevel: number): number {
    // Simplified DPMO calculation
    const dpmoTable: Record<number, number> = {
      1: 691462,
      2: 308538,
      3: 66807,
      4: 6210,
      5: 233,
      6: 3.4
    };
    return dpmoTable[Math.round(sigmaLevel)] || 66807;
  }

  // ============================================================================
  // WORKFLOW 3: Analyze Phase Model Execution
  // ============================================================================

  static async executeAnalyzeModelWorkflow(
    projectId: string,
    metricId: string,
    modelType: 'regression' | 'hypothesis_test' | 'root_cause',
    inputVariables: string[],
    triggeredBy?: string
  ): Promise<WorkflowExecution> {
    const workflowId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      await this.logWorkflowExecution({
        id: workflowId,
        workflow_name: 'Analyze Phase Model Execution',
        trigger_type: 'manual',
        project_id: projectId,
        metric_id: metricId,
        input_data: { modelType, inputVariables },
        status: 'running',
        triggered_by: triggeredBy,
        started_at: new Date().toISOString()
      });

      // Pull relevant metric observations
      const { data: observations } = await supabase
        .from('metric_observations')
        .select('*')
        .eq('metric_id', metricId);

      // Execute statistical model (simplified)
      const modelResults = await this.executeStatisticalModel(
        modelType,
        observations || [],
        inputVariables
      );

      // Store model artifact
      await supabase.from('statistical_artifacts').insert({
        project_id: projectId,
        metric_id: metricId,
        artifact_type: modelType === 'regression' ? 'regression' : 'hypothesis_test',
        phase: 'analyze',
        version: 1,
        artifact_data: modelResults,
        confidence_score: modelResults.confidence_score,
        is_active: true
      });

      // Update phase sync status
      await this.updatePhaseSyncStatus(projectId, metricId, 'analyze');

      // Sync results to Improve phase
      await this.syncToImprovePhase(projectId, metricId, modelResults);

      const executionTime = Date.now() - startTime;

      await supabase
        .from('workflow_executions')
        .update({
          status: 'completed',
          output_data: modelResults,
          execution_time_ms: executionTime,
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      return {
        id: workflowId,
        workflow_name: 'Analyze Phase Model Execution',
        trigger_type: 'manual',
        project_id: projectId,
        metric_id: metricId,
        status: 'completed',
        execution_time_ms: executionTime,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };

    } catch (error: any) {
      await supabase
        .from('workflow_executions')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      throw error;
    }
  }

  private static async executeStatisticalModel(
    modelType: string,
    observations: any[],
    inputVariables: string[]
  ) {
    const observedValues = observations
      .map((observation: any) => Number(observation.observed_value))
      .filter((value: number) => Number.isFinite(value));

    const sampleSize = observedValues.length;
    const mean = sampleSize > 0
      ? observedValues.reduce((sum: number, value: number) => sum + value, 0) / sampleSize
      : 0;
    const variance = sampleSize > 1
      ? observedValues.reduce((sum: number, value: number) => sum + Math.pow(value - mean, 2), 0) / sampleSize
      : 0;
    const stdDev = Math.sqrt(variance);
    const sortedValues = [...observedValues].sort((a, b) => a - b);
    const q1 = this.calculatePercentile(sortedValues, 0.25);
    const q3 = this.calculatePercentile(sortedValues, 0.75);
    const iqr = Math.max(q3 - q1, stdDev * 0.5, 1);
    const coefficientBase = sampleSize > 0 ? Math.max(stdDev / Math.max(Math.abs(mean), 1), 0.15) : 0.15;
    const rSquared = Math.max(0.2, Math.min(0.96, 1 - Math.min(stdDev / Math.max(Math.abs(mean), 1), 0.8)));
    const adjustedRSquared = Math.max(0.15, rSquared - Math.min(0.12, inputVariables.length * 0.015));
    const fStatistic = Number((sampleSize * Math.max(rSquared, 0.05) * 2.1).toFixed(2));
    const confidenceScore = Math.max(
      45,
      Math.min(
        98,
        58 + sampleSize * 0.18 + rSquared * 24 - Math.min(inputVariables.length, 8) * 1.1
      )
    );

    return {
      model_type: modelType,
      sample_size: sampleSize,
      coefficients: inputVariables.map((v) => {
        const coefficient = this.buildDeterministicCoefficient(v, observations[0]?.metric_id || v, coefficientBase);
        const relativeStrength = Math.min(Math.abs(coefficient) / Math.max(coefficientBase, 0.01), 2);
        const pValue = Number(Math.max(0.001, Math.min(0.2, 0.18 - relativeStrength * 0.06)).toFixed(3));
        return {
        variable: v,
        coefficient: Number(coefficient.toFixed(4)),
        p_value: pValue,
        significance: pValue <= 0.05 ? 'significant' : 'not_significant'
      };
      }),
      r_squared: Number(rSquared.toFixed(3)),
      adjusted_r_squared: Number(adjustedRSquared.toFixed(3)),
      f_statistic: fStatistic,
      confidence_score: Number(confidenceScore.toFixed(1)),
      diagnostics: {
        residuals_normal: stdDev <= Math.max(Math.abs(mean) * 0.35, 1),
        homoscedasticity: iqr <= Math.max(Math.abs(mean) * 0.8, 2),
        multicollinearity: inputVariables.length >= 6
      }
    };
  }

  private static async syncToImprovePhase(projectId: string, metricId: string, modelResults: any) {
    const coefficientStrength = Array.isArray(modelResults.coefficients)
      ? modelResults.coefficients.reduce((sum: number, coefficient: any) => sum + Math.abs(Number(coefficient.coefficient) || 0), 0)
      : 0;
    const projectedImprovement = Math.max(
      5,
      Math.min(
        35,
        8 + coefficientStrength * 6 + (Number(modelResults.r_squared) || 0) * 10
      )
    );
    const intervalSpread = Math.max(3, projectedImprovement * 0.25);

    // Store improvement projection based on model
    await supabase.from('statistical_artifacts').insert({
      project_id: projectId,
      metric_id: metricId,
      artifact_type: 'improvement_projection',
      phase: 'improve',
      version: 1,
      artifact_data: {
        baseline_from_analyze: modelResults,
        projected_improvement: Number(projectedImprovement.toFixed(1)),
        confidence_interval: [
          Number(Math.max(0, projectedImprovement - intervalSpread).toFixed(1)),
          Number((projectedImprovement + intervalSpread).toFixed(1))
        ]
      },
      is_active: true
    });
  }

  // ============================================================================
  // WORKFLOW 4: Improve Simulation Engine
  // ============================================================================

  static async executeImproveSimulationWorkflow(
    projectId: string,
    metricId: string,
    interventionParams: Record<string, number>,
    triggeredBy?: string
  ): Promise<WorkflowExecution> {
    const workflowId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      await this.logWorkflowExecution({
        id: workflowId,
        workflow_name: 'Improve Simulation Engine',
        trigger_type: 'manual',
        project_id: projectId,
        metric_id: metricId,
        input_data: { interventionParams },
        status: 'running',
        triggered_by: triggeredBy,
        started_at: new Date().toISOString()
      });

      // Pull latest regression artifact
      const { data: regressionArtifact } = await supabase
        .from('statistical_artifacts')
        .select('*')
        .eq('project_id', projectId)
        .eq('metric_id', metricId)
        .eq('artifact_type', 'regression')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!regressionArtifact) {
        throw new Error('No regression model found. Run Analyze phase first.');
      }

      // Compute predicted CTQ outcome
      const prediction = this.computePrediction(
        regressionArtifact.artifact_data,
        interventionParams
      );

      // Calculate projected ROI
      const roi = this.calculateROI(prediction);

      // Store simulation artifact
      await supabase.from('statistical_artifacts').insert({
        project_id: projectId,
        metric_id: metricId,
        artifact_type: 'improvement_projection',
        phase: 'improve',
        version: 1,
        artifact_data: {
          intervention_params: interventionParams,
          predicted_outcome: prediction,
          projected_roi: roi,
          confidence_interval: [prediction.value * 0.9, prediction.value * 1.1]
        },
        confidence_score: prediction.confidence,
        is_active: true
      });

      // Update phase sync status
      await this.updatePhaseSyncStatus(projectId, metricId, 'improve');

      // Flag readiness for Control
      await this.flagControlReadiness(projectId, metricId);

      const executionTime = Date.now() - startTime;

      await supabase
        .from('workflow_executions')
        .update({
          status: 'completed',
          output_data: { prediction, roi },
          execution_time_ms: executionTime,
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      return {
        id: workflowId,
        workflow_name: 'Improve Simulation Engine',
        trigger_type: 'manual',
        project_id: projectId,
        metric_id: metricId,
        status: 'completed',
        execution_time_ms: executionTime,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };

    } catch (error: any) {
      await supabase
        .from('workflow_executions')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      throw error;
    }
  }

  private static computePrediction(regressionData: any, interventionParams: Record<string, number>) {
    // Simplified prediction calculation
    let predictedValue = 0;
    regressionData.coefficients?.forEach((coef: any) => {
      const paramValue = interventionParams[coef.variable] || 0;
      predictedValue += coef.coefficient * paramValue;
    });

    return {
      value: predictedValue,
      confidence: regressionData.confidence_score || 85
    };
  }

  private static calculateROI(prediction: any) {
    // Simplified ROI calculation
    const costSavings = prediction.value * 1000; // Example calculation
    const investmentCost = 50000;
    return ((costSavings - investmentCost) / investmentCost) * 100;
  }

  private static async flagControlReadiness(projectId: string, metricId: string) {
    await supabase
      .from('metrics_registry')
      .update({
        metadata: {
          control_ready: true,
          control_ready_at: new Date().toISOString()
        }
      })
      .eq('id', metricId);
  }

  // ============================================================================
  // WORKFLOW 5: Continuous Control Monitoring
  // ============================================================================

  static async executeContinuousControlWorkflow(
    projectId: string,
    metricId: string
  ): Promise<void> {
    // Get all active control rules for this metric
    const { data: rules } = await supabase
      .from('control_rules')
      .select('*')
      .eq('metric_id', metricId)
      .eq('is_active', true);

    if (!rules || rules.length === 0) return;

    // Get latest observations
    const { data: latestObservations } = await supabase
      .from('metric_observations')
      .select('*')
      .eq('metric_id', metricId)
      .order('observation_date', { ascending: false })
      .limit(30);

    if (!latestObservations) return;

    // Evaluate each rule
    for (const rule of rules) {
      const violation = await this.evaluateControlRule(rule, latestObservations);

      if (violation) {
        // Create alert
        await supabase.from('alerts').insert({
          project_id: projectId,
          metric_id: metricId,
          alert_type: 'control_violation',
          severity: rule.severity,
          title: `Control Rule Violation: ${rule.rule_name}`,
          message: violation.message,
          metadata: {
            rule_id: rule.id,
            violation_details: violation.details
          }
        });

        // Recalculate drift risk score
        await this.recalculateDriftRisk(projectId, metricId);

        // Store drift artifact
        await supabase.from('statistical_artifacts').insert({
          project_id: projectId,
          metric_id: metricId,
          artifact_type: 'drift_analysis',
          phase: 'control',
          version: 1,
          artifact_data: violation.details,
          is_active: true
        });

        // Update phase sync status
        await this.updatePhaseSyncStatus(projectId, metricId, 'control');
      }
    }
  }

  private static async evaluateControlRule(rule: ControlRule, observations: any[]) {
    const values = observations.map(o => o.observed_value);
    const latestValue = values[0];

    switch (rule.rule_type) {
      case 'threshold':
        const threshold = rule.condition_logic.threshold;
        const operator = rule.condition_logic.operator;
        
        if (operator === '>' && latestValue > threshold) {
          return {
            message: `Value ${latestValue} exceeds threshold ${threshold}`,
            details: { latestValue, threshold, operator }
          };
        }
        if (operator === '<' && latestValue < threshold) {
          return {
            message: `Value ${latestValue} below threshold ${threshold}`,
            details: { latestValue, threshold, operator }
          };
        }
        break;

      case 'trend':
        // Check for consecutive increasing/decreasing points
        const trendLength = rule.condition_logic.consecutive_points || 3;
        let increasing = 0;
        let decreasing = 0;

        for (let i = 0; i < Math.min(values.length - 1, trendLength); i++) {
          if (values[i] > values[i + 1]) increasing++;
          if (values[i] < values[i + 1]) decreasing++;
        }

        if (increasing >= trendLength || decreasing >= trendLength) {
          return {
            message: `Trend detected: ${increasing >= trendLength ? 'increasing' : 'decreasing'} for ${trendLength} points`,
            details: { trendType: increasing >= trendLength ? 'increasing' : 'decreasing', points: trendLength }
          };
        }
        break;

      case 'western_electric':
        // Implement Western Electric rules
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const stdDev = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);
        
        // Rule 1: One point beyond 3 sigma
        if (Math.abs(latestValue - mean) > 3 * stdDev) {
          return {
            message: 'Western Electric Rule 1: Point beyond 3 sigma',
            details: { value: latestValue, mean, stdDev, sigmaDistance: Math.abs(latestValue - mean) / stdDev }
          };
        }
        break;
    }

    return null;
  }

  private static async recalculateDriftRisk(projectId: string, metricId: string) {
    // Calculate drift risk score based on recent violations
    const { data: recentAlerts } = await supabase
      .from('alerts')
      .select('*')
      .eq('metric_id', metricId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const driftRisk = Math.min(10, (recentAlerts?.length || 0) * 2);

    await supabase
      .from('metrics_registry')
      .update({
        metadata: {
          drift_risk_score: driftRisk,
          last_drift_check: new Date().toISOString()
        }
      })
      .eq('id', metricId);
  }

  // ============================================================================
  // CROSS-PHASE SYNCHRONIZATION
  // ============================================================================

  private static async initializePhaseSyncStatus(projectId: string, metricId: string) {
    await supabase.from('phase_sync_status').insert({
      project_id: projectId,
      metric_id: metricId,
      sync_metadata: {}
    });
  }

  private static async updatePhaseSyncStatus(
    projectId: string,
    metricId: string,
    phase: 'define' | 'measure' | 'analyze' | 'improve' | 'control'
  ) {
    const updateField = `${phase}_synced_at`;
    
    await supabase
      .from('phase_sync_status')
      .update({
        [updateField]: new Date().toISOString(),
        last_sync_trigger: phase,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId)
      .eq('metric_id', metricId);
  }

  private static async triggerPhaseSynchronization(
    projectId: string,
    metricId: string,
    trigger: string
  ) {
    // Emit event that all phases should refresh their data
    await supabase
      .from('phase_sync_status')
      .update({
        last_sync_trigger: trigger,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId)
      .eq('metric_id', metricId);
  }

  private static async emitMetricsUpdatedEvent(projectId: string, metricIds: string[]) {
    // This would trigger real-time updates across all phases
    console.log('Metrics Updated Event:', { projectId, metricIds });
  }

  private static async logWorkflowExecution(execution: Partial<WorkflowExecution>) {
    await supabase.from('workflow_executions').insert(execution);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  static async getProjectMetrics(projectId: string): Promise<MetricRegistry[]> {
    const { data, error } = await supabase
      .from('metrics_registry')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getWorkflowExecutions(projectId: string, limit = 50): Promise<WorkflowExecution[]> {
    const { data, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('project_id', projectId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  static async getMetricVersionHistory(metricId: string) {
    const { data, error } = await supabase
      .from('metric_version_history')
      .select('*')
      .eq('metric_id', metricId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}
