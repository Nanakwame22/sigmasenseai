import { supabase } from '../lib/supabase';
import type { OracleSmartConnectionResult } from './oracleHealthSmart';
import { buildOraclePlatformMetrics } from './oraclePlatformMetrics';

export const ORACLE_SANDBOX_SOURCE_NAME = 'Oracle Health Open Sandbox';
export const ORACLE_SANDBOX_PIPELINE_NAME = 'Oracle Health Sandbox Sync';

interface SyncOraclePlatformArtifactsInput {
  organizationId: string;
  userId: string;
  connection: OracleSmartConnectionResult;
}

interface DataSourceRow {
  id: string;
  name: string;
  connection_config?: Record<string, unknown> | null;
}

interface PipelineRow {
  id: string;
}

interface MetricRow {
  id: string;
  name: string;
}

function buildSourceConfig(connection: OracleSmartConnectionResult) {
  const resourceTypes = connection.resources.map((resource) => resource.resourceType);
  return {
    base_url: connection.issuer,
    auth_type: connection.mode === 'open-sandbox' ? 'none' : 'bearer',
    mode: connection.mode,
    resource_types: resourceTypes,
    current_columns: resourceTypes,
    columns: resourceTypes,
    managed_connector: 'oracle-health-sandbox',
    last_verified_at: connection.connectedAt,
  };
}

export async function syncOraclePlatformArtifacts({
  organizationId,
  userId,
  connection,
}: SyncOraclePlatformArtifactsInput) {
  const totalSamples = connection.resources.reduce((sum, resource) => sum + resource.sampleIds.length, 0);

  const { data: existingSourceData, error: existingSourceError } = await supabase
    .from('data_sources')
    .select('id, name, connection_config')
    .eq('organization_id', organizationId)
    .eq('name', ORACLE_SANDBOX_SOURCE_NAME)
    .limit(1)
    .maybeSingle();

  if (existingSourceError) throw existingSourceError;

  const sourceConfig = buildSourceConfig(connection);
  let sourceRow = existingSourceData as DataSourceRow | null;

  if (!sourceRow?.id) {
    const { data: insertedSource, error: insertSourceError } = await supabase
      .from('data_sources')
      .insert({
        name: ORACLE_SANDBOX_SOURCE_NAME,
        type: 'api',
        status: 'active',
        organization_id: organizationId,
        records_count: totalSamples,
        connection_config: sourceConfig,
        last_sync: connection.connectedAt,
        created_by: userId,
      })
      .select('id, name, connection_config')
      .single();

    if (insertSourceError) throw insertSourceError;
    sourceRow = insertedSource as DataSourceRow;
  } else {
    const { error: updateSourceError } = await supabase
      .from('data_sources')
      .update({
        status: 'active',
        records_count: totalSamples,
        connection_config: {
          ...(sourceRow.connection_config || {}),
          ...sourceConfig,
        },
        last_sync: connection.connectedAt,
      })
      .eq('id', sourceRow.id);

    if (updateSourceError) throw updateSourceError;
  }

  const { data: existingPipelineData, error: existingPipelineError } = await supabase
    .from('etl_pipelines')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('name', ORACLE_SANDBOX_PIPELINE_NAME)
    .eq('source_id', sourceRow.id)
    .limit(1)
    .maybeSingle();

  if (existingPipelineError) throw existingPipelineError;

  let pipelineRow = existingPipelineData as PipelineRow | null;
  if (!pipelineRow?.id) {
    const { data: insertedPipeline, error: insertPipelineError } = await supabase
      .from('etl_pipelines')
      .insert({
        organization_id: organizationId,
        name: ORACLE_SANDBOX_PIPELINE_NAME,
        description: 'Managed Oracle Health sandbox sync for shared platform metrics.',
        source_id: sourceRow.id,
        destination_type: 'metrics',
        schedule: 'manual',
        transformation_rules: {
          managed_connector: 'oracle-health-sandbox',
          resource_types: sourceConfig.resource_types,
          operations: [],
        },
        status: 'active',
        created_by: userId,
      })
      .select('id')
      .single();

    if (insertPipelineError) throw insertPipelineError;
    pipelineRow = insertedPipeline as PipelineRow;
  }

  const metricDefinitions = buildOraclePlatformMetrics(connection);
  const { data: existingMetricsData, error: existingMetricsError } = await supabase
    .from('metrics')
    .select('id, name')
    .eq('organization_id', organizationId)
    .in('name', metricDefinitions.map((metric) => metric.name));

  if (existingMetricsError) throw existingMetricsError;

  const metricsByName = new Map((existingMetricsData || []).map((metric) => [metric.name as string, metric as MetricRow]));
  const missingMetrics = metricDefinitions.filter((metric) => !metricsByName.has(metric.name));

  if (missingMetrics.length > 0) {
    const { data: insertedMetrics, error: insertMetricsError } = await supabase
      .from('metrics')
      .insert(
        missingMetrics.map((metric) => ({
          name: metric.name,
          description: metric.evidenceSummary,
          unit: metric.unit,
          target_value: metric.targetValue,
          current_value: metric.currentValue,
          actual_value: metric.currentValue,
          category: metric.category,
          organization_id: organizationId,
          data_source_id: sourceRow.id,
        }))
      )
      .select('id, name');

    if (insertMetricsError) throw insertMetricsError;
    (insertedMetrics || []).forEach((metric) => {
      metricsByName.set(metric.name as string, metric as MetricRow);
    });
  }

  const { data: existingRunData, error: existingRunError } = await supabase
    .from('etl_pipeline_runs')
    .select('id')
    .eq('pipeline_id', pipelineRow.id)
    .eq('started_at', connection.connectedAt)
    .limit(1)
    .maybeSingle();

  if (existingRunError) throw existingRunError;

  let runId = (existingRunData as { id: string } | null)?.id || null;
  if (!runId) {
    const { data: insertedRun, error: insertRunError } = await supabase
      .from('etl_pipeline_runs')
      .insert({
        pipeline_id: pipelineRow.id,
        status: 'completed',
        started_at: connection.connectedAt,
        completed_at: connection.connectedAt,
        records_processed: metricDefinitions.length,
        records_success: metricDefinitions.length,
        records_failed: 0,
        duration_seconds: 1,
      })
      .select('id')
      .single();

    if (insertRunError) throw insertRunError;
    runId = insertedRun?.id as string;

    await supabase.from('etl_ingestion_events').insert({
      organization_id: organizationId,
      pipeline_id: pipelineRow.id,
      run_id: runId,
      source_id: sourceRow.id,
      level: 'info',
      stage: 'complete',
      message: 'Oracle Health sandbox sync completed and refreshed shared platform metrics.',
      details: {
        issuer: connection.issuer,
        mode: connection.mode,
        resources_captured: connection.resources.length,
        metric_count: metricDefinitions.length,
      },
    });
  }

  for (const metric of metricDefinitions) {
    const metricRow = metricsByName.get(metric.name);
    if (!metricRow?.id) continue;

    const { data: existingPoint, error: existingPointError } = await supabase
      .from('metric_data')
      .select('id')
      .eq('metric_id', metricRow.id)
      .eq('timestamp', metric.timestamp)
      .eq('source', metric.source)
      .limit(1)
      .maybeSingle();

    if (existingPointError) throw existingPointError;

    if (!existingPoint?.id) {
      const { error: insertPointError } = await supabase
        .from('metric_data')
        .insert({
          metric_id: metricRow.id,
          value: metric.currentValue,
          timestamp: metric.timestamp,
          organization_id: organizationId,
          source: metric.source,
        });

      if (insertPointError) throw insertPointError;
    }

    const { error: updateMetricError } = await supabase
      .from('metrics')
      .update({
        current_value: metric.currentValue,
        actual_value: metric.currentValue,
        target_value: metric.targetValue,
        data_source_id: sourceRow.id,
        description: metric.evidenceSummary,
      })
      .eq('id', metricRow.id)
      .eq('organization_id', organizationId);

    if (updateMetricError) throw updateMetricError;
  }

  const { count: totalRuns } = await supabase
    .from('etl_pipeline_runs')
    .select('*', { count: 'exact', head: true })
    .eq('pipeline_id', pipelineRow.id);

  const { count: successfulRuns } = await supabase
    .from('etl_pipeline_runs')
    .select('*', { count: 'exact', head: true })
    .eq('pipeline_id', pipelineRow.id)
    .in('status', ['completed', 'partial']);

  const { count: failedRuns } = await supabase
    .from('etl_pipeline_runs')
    .select('*', { count: 'exact', head: true })
    .eq('pipeline_id', pipelineRow.id)
    .eq('status', 'failed');

  await supabase
    .from('etl_pipelines')
    .update({
      status: 'active',
      last_run_at: connection.connectedAt,
      next_run_at: null,
      total_runs: totalRuns || 0,
      successful_runs: successfulRuns || 0,
      failed_runs: failedRuns || 0,
      records_processed: totalSamples,
    })
    .eq('id', pipelineRow.id);

  return {
    sourceId: sourceRow.id,
    pipelineId: pipelineRow.id,
    metricCount: metricDefinitions.length,
  };
}
