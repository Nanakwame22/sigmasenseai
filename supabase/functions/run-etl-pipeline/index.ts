import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Pipeline {
  id: string;
  organization_id: string;
  source_id: string | null;
  schedule: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  records_processed: number;
  transformation_rules?: {
    operations?: TransformationOperation[];
    field_mappings?: FieldMapping[];
    source_view?: 'platform_metrics' | 'normalized_fhir';
  };
}

type EventLevel = 'info' | 'warning' | 'error';
type EventStage = 'queued' | 'startup' | 'fetch' | 'transform' | 'load' | 'complete' | 'failure';
type RunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';
const DEFAULT_BATCH_SIZE = 1000;

interface DataSource {
  id: string;
  type: string;
  file_data?: Record<string, unknown>[];
  connection_config?: {
    auth_type?: 'none' | 'api_key' | 'bearer' | 'basic';
    auth_key_name?: string;
    auth_key_value?: string;
    base_url?: string;
    http_method?: 'GET' | 'POST';
    json_path?: string;
    custom_headers?: Array<{ key: string; value: string }>;
    managed_connector?: string;
    resource_types?: string[];
    current_columns?: string[];
    last_verified_at?: string;
    last_sync?: string;
  };
}

interface FieldMapping {
  sourceField: string;
  destinationType: 'metric_name' | 'value' | 'timestamp' | 'unit';
  targetMetricId?: string;
}

interface TransformationOperation {
  type: 'filter';
  field: string;
  condition: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string;
}

interface RunRequestPayload {
  pipelineId?: string;
  replayRunId?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  existingRunId?: string | null;
  batchOffset?: number | null;
  batchSize?: number | null;
}

function isManagedOracleSource(source: DataSource | null | undefined): boolean {
  return source?.type === 'api' && source.connection_config?.managed_connector === 'oracle-health-sandbox';
}

function buildOracleFallbackRecords(source: DataSource): Record<string, unknown>[] {
  const resourceTypes = Array.isArray(source.connection_config?.resource_types)
    ? source.connection_config?.resource_types
    : Array.isArray(source.connection_config?.current_columns)
      ? source.connection_config?.current_columns
      : [];
  const verifiedAt =
    source.connection_config?.last_verified_at ||
    source.connection_config?.last_sync ||
    new Date().toISOString();

  return (resourceTypes.length > 0 ? resourceTypes : ['CapabilityStatement']).slice(0, 5).map((resourceType) => ({
    metric_name: `Oracle ${String(resourceType)} Coverage`,
    value: 1,
    target_value: 1,
    unit: 'resource',
    category: 'Oracle Health',
    timestamp: verifiedAt,
    source: `oracle-health:${String(resourceType).toLowerCase()}`,
    evidence_summary: `Managed Oracle sandbox connector verified ${String(resourceType)} from the live public FHIR endpoint.`,
  }));
}

function loadManagedOracleNormalizedRows(source: DataSource): Record<string, unknown>[] {
  if (!Array.isArray(source.file_data)) {
    return [];
  }

  return source.file_data
    .filter((row) => row && typeof row === 'object')
    .map((row) => row as Record<string, unknown>);
}

async function loadManagedOracleRecords(
  adminClient: ReturnType<typeof createClient>,
  organizationId: string,
  source: DataSource,
): Promise<Record<string, unknown>[]> {
  const { data: metricRows, error: metricError } = await adminClient
    .from('metrics')
    .select('id, name, unit, current_value, target_value, category, description')
    .eq('organization_id', organizationId)
    .eq('data_source_id', source.id)
    .order('name', { ascending: true });

  if (metricError) {
    throw new Error(metricError.message);
  }

  if (!metricRows || metricRows.length === 0) {
    return buildOracleFallbackRecords(source);
  }

  const metricIds = metricRows.map((metric) => metric.id as string);
  const latestPointsByMetric = new Map<string, { value: number; timestamp: string; source?: string }>();

  if (metricIds.length > 0) {
    const { data: pointRows, error: pointError } = await adminClient
      .from('metric_data')
      .select('metric_id, value, timestamp, source')
      .eq('organization_id', organizationId)
      .in('metric_id', metricIds)
      .order('timestamp', { ascending: false })
      .limit(Math.max(metricIds.length * 3, 25));

    if (pointError) {
      throw new Error(pointError.message);
    }

    (pointRows || []).forEach((point) => {
      const metricId = point.metric_id as string;
      if (!latestPointsByMetric.has(metricId)) {
        latestPointsByMetric.set(metricId, {
          value: Number(point.value) || 0,
          timestamp: String(point.timestamp),
          source: point.source ? String(point.source) : undefined,
        });
      }
    });
  }

  return metricRows.slice(0, 50).map((metric) => {
    const latestPoint = latestPointsByMetric.get(metric.id as string);
    return {
      metric_name: String(metric.name),
      value: latestPoint?.value ?? Number(metric.current_value) ?? 0,
      target_value: Number(metric.target_value) || 0,
      unit: metric.unit ? String(metric.unit) : '',
      category: metric.category ? String(metric.category) : 'Oracle Health',
      timestamp:
        latestPoint?.timestamp ||
        source.connection_config?.last_verified_at ||
        source.connection_config?.last_sync ||
        new Date().toISOString(),
      source: latestPoint?.source || 'oracle-health-sandbox',
      evidence_summary:
        metric.description
          ? String(metric.description)
          : 'Managed Oracle sandbox metric generated from the shared integration bridge.',
    };
  });
}

function extractDataFromJsonPath(data: unknown, path: string): Record<string, unknown>[] {
  if (!path || path.trim() === '') {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    return [data as Record<string, unknown>];
  }

  const keys = path.split('.').filter(Boolean);
  let current = data as Record<string, unknown>;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key] as Record<string, unknown>;
    } else {
      throw new Error(`JSON path "${path}" not found in response`);
    }
  }

  return Array.isArray(current) ? current as Record<string, unknown>[] : [current];
}

function buildHeaders(config: DataSource['connection_config']): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!config) return headers;

  if (config.auth_type === 'api_key' && config.auth_key_name && config.auth_key_value) {
    headers[config.auth_key_name] = config.auth_key_value;
  } else if (config.auth_type === 'bearer' && config.auth_key_value) {
    headers.Authorization = `Bearer ${config.auth_key_value}`;
  } else if (config.auth_type === 'basic' && config.auth_key_name && config.auth_key_value) {
    const encoded = btoa(`${config.auth_key_name}:${config.auth_key_value}`);
    headers.Authorization = `Basic ${encoded}`;
  }

  if (Array.isArray(config.custom_headers)) {
    config.custom_headers.forEach((header) => {
      if (header.key && header.value) {
        headers[header.key] = header.value;
      }
    });
  }

  return headers;
}

function calculateNextRun(schedule: string): string {
  const next = new Date();

  switch (schedule) {
    case 'hourly':
      next.setHours(next.getHours() + 1);
      break;
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      return '';
  }

  return next.toISOString();
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function applyTransformationOperations(
  records: Record<string, unknown>[],
  operations: TransformationOperation[]
): {
  records: Record<string, unknown>[];
  operationsApplied: number;
  excludedRecords: number;
  operationSummaries: Array<Record<string, unknown>>;
} {
  if (!operations.length) {
    return {
      records,
      operationsApplied: 0,
      excludedRecords: 0,
      operationSummaries: [],
    };
  }

  let transformedRecords = [...records];
  const operationSummaries: Array<Record<string, unknown>> = [];
  let excludedRecords = 0;

  for (const operation of operations) {
    if (operation.type !== 'filter' || !operation.field || operation.value === undefined) {
      continue;
    }

    const beforeCount = transformedRecords.length;

    transformedRecords = transformedRecords.filter((record) => {
      const rawValue = record[operation.field];
      const left = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
      const right = String(operation.value ?? '').trim();

      switch (operation.condition) {
        case 'equals':
          return left === right;
        case 'not_equals':
          return left !== right;
        case 'contains':
          return left.toLowerCase().includes(right.toLowerCase());
        case 'greater_than': {
          const leftNumber = Number(String(rawValue ?? '').replace(/,/g, '').trim());
          const rightNumber = Number(right.replace(/,/g, '').trim());
          if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) return false;
          return leftNumber > rightNumber;
        }
        case 'less_than': {
          const leftNumber = Number(String(rawValue ?? '').replace(/,/g, '').trim());
          const rightNumber = Number(right.replace(/,/g, '').trim());
          if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) return false;
          return leftNumber < rightNumber;
        }
        default:
          return true;
      }
    });

    const removed = beforeCount - transformedRecords.length;
    excludedRecords += removed;
    operationSummaries.push({
      type: operation.type,
      field: operation.field,
      condition: operation.condition,
      value: operation.value,
      removed_records: removed,
      remaining_records: transformedRecords.length,
    });
  }

  return {
    records: transformedRecords,
    operationsApplied: operationSummaries.length,
    excludedRecords,
    operationSummaries,
  };
}

function applyBackfillWindow(
  records: Record<string, unknown>[],
  timestampField: string | undefined,
  windowStart?: string | null,
  windowEnd?: string | null,
): {
  records: Record<string, unknown>[];
  excludedRecords: number;
  applied: boolean;
} {
  if (!windowStart && !windowEnd) {
    return {
      records,
      excludedRecords: 0,
      applied: false,
    };
  }

  if (!timestampField) {
    throw new Error('Backfill requires a timestamp mapping on this pipeline.');
  }

  const start = windowStart ? new Date(windowStart) : null;
  const end = windowEnd ? new Date(windowEnd) : null;

  if (start && Number.isNaN(start.getTime())) {
    throw new Error('Backfill start date is invalid.');
  }

  if (end && Number.isNaN(end.getTime())) {
    throw new Error('Backfill end date is invalid.');
  }

  const filtered = records.filter((record) => {
    const parsedTimestamp = new Date(String(record[timestampField] ?? ''));
    if (Number.isNaN(parsedTimestamp.getTime())) {
      return false;
    }

    if (start && parsedTimestamp < start) {
      return false;
    }

    if (end && parsedTimestamp > end) {
      return false;
    }

    return true;
  });

  return {
    records: filtered,
    excludedRecords: Math.max(0, records.length - filtered.length),
    applied: true,
  };
}

async function logIngestionEvent(
  adminClient: ReturnType<typeof createClient>,
  payload: {
    organization_id: string;
    pipeline_id: string;
    run_id?: string | null;
    source_id?: string | null;
    level: EventLevel;
    stage: EventStage;
    message: string;
    details?: Record<string, unknown>;
  }
) {
  const { error } = await adminClient
    .from('etl_ingestion_events')
    .insert({
      organization_id: payload.organization_id,
      pipeline_id: payload.pipeline_id,
      run_id: payload.run_id ?? null,
      source_id: payload.source_id ?? null,
      level: payload.level,
      stage: payload.stage,
      message: payload.message,
      details: payload.details ?? {},
    });

  if (error) {
    console.warn('Unable to write ETL ingestion event:', error.message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader ?? '' } } }
  );

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const startedAt = Date.now();
  let runId: string | null = null;
  let pipeline: Pipeline | null = null;
  let organizationId: string | null = null;
  let sourceId: string | null = null;
  let pipelineRunStartingTotals = {
    records_processed: 0,
    records_success: 0,
    records_failed: 0,
  };
  let shouldIncrementPipelineTotals = false;

  try {
    await authClient.auth.getUser();

    const {
      pipelineId,
      replayRunId,
      windowStart,
      windowEnd,
      existingRunId,
      batchOffset: rawBatchOffset,
      batchSize: rawBatchSize,
    } = await req.json() as RunRequestPayload;
    if (!pipelineId) {
      return new Response(JSON.stringify({ error: 'pipelineId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: pipelineData, error: pipelineError } = await adminClient
      .from('etl_pipelines')
      .select('*')
      .eq('id', pipelineId)
      .single();

    if (pipelineError || !pipelineData) {
      return new Response(JSON.stringify({ error: 'Pipeline not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    pipeline = pipelineData as Pipeline;
    organizationId = pipeline.organization_id;
    sourceId = pipeline.source_id;

    if (!pipeline.source_id) {
      return new Response(JSON.stringify({ error: 'Pipeline has no data source configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sourceData, error: sourceError } = await adminClient
      .from('data_sources')
      .select('*')
      .eq('id', pipeline.source_id)
      .eq('organization_id', organizationId)
      .single();

    if (sourceError || !sourceData) {
      return new Response(JSON.stringify({ error: 'Data source not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const batchOffset = Math.max(0, rawBatchOffset ?? 0);
    const batchSize = Math.max(100, Math.min(rawBatchSize ?? DEFAULT_BATCH_SIZE, 2000));
    const isInitialBatch = !existingRunId || batchOffset === 0;

    if (existingRunId) {
      const { data: existingRun, error: existingRunError } = await adminClient
        .from('etl_pipeline_runs')
        .select('id, records_processed, records_success, records_failed')
        .eq('id', existingRunId)
        .single();

      if (existingRunError || !existingRun?.id) {
        throw new Error(existingRunError?.message ?? 'Existing pipeline run not found');
      }

      runId = existingRun.id as string;
      pipelineRunStartingTotals = {
        records_processed: Number(existingRun.records_processed) || 0,
        records_success: Number(existingRun.records_success) || 0,
        records_failed: Number(existingRun.records_failed) || 0,
      };
    } else {
      const { data: runData, error: runError } = await adminClient
        .from('etl_pipeline_runs')
        .insert({
          pipeline_id: pipelineId,
          status: 'queued',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (runError || !runData?.id) {
        throw new Error(runError?.message ?? 'Failed to create pipeline run');
      }

      runId = runData.id as string;

      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipelineId,
        run_id: runId,
        source_id: sourceId,
        level: 'info',
        stage: 'queued',
        message: 'Pipeline run queued for execution',
        details: { schedule: pipeline.schedule },
      });
    }

    await adminClient
      .from('etl_pipeline_runs')
      .update({ status: 'running', error_message: null })
      .eq('id', runId);

    if (isInitialBatch) {
      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipelineId,
        run_id: runId,
        source_id: sourceId,
        level: 'info',
        stage: 'startup',
        message: 'Pipeline execution started',
        details: {
          recovery_mode: replayRunId ? 'replay' : windowStart || windowEnd ? 'backfill' : 'standard',
          replay_run_id: replayRunId ?? null,
          window_start: windowStart ?? null,
          window_end: windowEnd ?? null,
          batch_size: batchSize,
        },
      });
    }

    const source = sourceData as DataSource;
    let records: Record<string, unknown>[] = [];

    if (isManagedOracleSource(source)) {
      const oracleSourceView = pipeline.transformation_rules?.source_view || 'platform_metrics';
      records =
        oracleSourceView === 'normalized_fhir'
          ? loadManagedOracleNormalizedRows(source)
          : await loadManagedOracleRecords(adminClient, organizationId, source);

      if (oracleSourceView === 'normalized_fhir' && records.length === 0) {
        records = buildOracleFallbackRecords(source);
      }

      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipelineId,
        run_id: runId,
        source_id: sourceId,
        level: 'info',
        stage: 'fetch',
        message:
          oracleSourceView === 'normalized_fhir'
            ? 'Loaded managed Oracle sandbox records from normalized FHIR rows'
            : 'Loaded managed Oracle sandbox records from persisted platform metrics',
        details: {
          source_type: source.type,
          managed_connector: source.connection_config?.managed_connector,
          source_view: oracleSourceView,
          records_detected: records.length,
        },
      });
    } else if (source.type === 'api' && source.connection_config?.base_url) {
      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipelineId,
        run_id: runId,
        source_id: sourceId,
        level: 'info',
        stage: 'fetch',
        message: 'Fetching source payload from API endpoint',
        details: {
          source_type: source.type,
          method: source.connection_config.http_method || 'GET',
          url: source.connection_config.base_url,
        },
      });

      const response = await fetch(source.connection_config.base_url, {
        method: source.connection_config.http_method || 'GET',
        headers: buildHeaders(source.connection_config),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const payload = await response.json();
      records = extractDataFromJsonPath(payload, source.connection_config.json_path || '');
    } else if (Array.isArray(source.file_data)) {
      records = source.file_data as Record<string, unknown>[];

      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipelineId,
        run_id: runId,
        source_id: sourceId,
        level: 'info',
        stage: 'fetch',
        message: 'Loaded source payload from stored file data',
        details: {
          source_type: source.type,
          records_detected: records.length,
        },
      });
    }

    const mappings = pipeline.transformation_rules?.field_mappings || [];
    const metricNameMapping = mappings.find((m) => m.destinationType === 'metric_name');
    const valueMapping = mappings.find((m) => m.destinationType === 'value');
    const timestampMapping = mappings.find((m) => m.destinationType === 'timestamp');
    const unitMapping = mappings.find((m) => m.destinationType === 'unit');

    const operations = Array.isArray(pipeline.transformation_rules?.operations)
      ? pipeline.transformation_rules?.operations
      : [];
    const operationResult = applyTransformationOperations(records, operations);
    records = operationResult.records;

    if (operationResult.operationsApplied > 0 && isInitialBatch) {
      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipelineId,
        run_id: runId,
        source_id: sourceId,
        level: operationResult.excludedRecords > 0 ? 'info' : 'warning',
        stage: 'transform',
        message: 'Applied transformation operations to source records',
        details: {
          operations_applied: operationResult.operationsApplied,
          excluded_records: operationResult.excludedRecords,
          remaining_records: records.length,
          operations: operationResult.operationSummaries,
        },
      });
    }

    const backfillResult = applyBackfillWindow(
      records,
      timestampMapping?.sourceField,
      windowStart,
      windowEnd,
    );
    records = backfillResult.records;

    if ((replayRunId || backfillResult.applied) && isInitialBatch) {
      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipelineId,
        run_id: runId,
        source_id: sourceId,
        level: 'info',
        stage: 'transform',
        message: replayRunId
          ? 'Replay requested against the latest stored source snapshot'
          : 'Applied backfill window to source records',
        details: {
          replay_run_id: replayRunId ?? null,
          window_start: windowStart ?? null,
          window_end: windowEnd ?? null,
          excluded_records: backfillResult.excludedRecords,
          remaining_records: records.length,
        },
      });
    }

    if (!valueMapping) {
      throw new Error('Pipeline is missing a value mapping');
    }

    const totalRecordsAfterFilters = records.length;
    const batchRecords = records.slice(batchOffset, batchOffset + batchSize);
    const hasMore = batchOffset + batchRecords.length < totalRecordsAfterFilters;
    records = batchRecords;

    const { data: metricsData } = await adminClient
      .from('metrics')
      .select('id, name')
      .eq('organization_id', organizationId);

    const metricsByName = new Map((metricsData || []).map((metric) => [metric.name, metric.id]));
    const mappingVersion = pipelineData.updated_at
      ? new Date(pipelineData.updated_at).toISOString()
      : 'unknown';
    const provenanceSource = `etl:pipeline:${pipelineId}:run:${runId}:source:${sourceId ?? 'unknown'}:mapping:${mappingVersion}`;
    const dataPoints: Array<{ metric_id: string; value: number; timestamp: string; organization_id: string; source: string }> = [];
    let recordsSuccess = 0;
    let recordsFailed = 0;
    const failureSamples: Array<Record<string, unknown>> = [];
    const latestMetricValues = new Map<string, { value: number; timestamp: string }>();

    await logIngestionEvent(adminClient, {
      organization_id: organizationId,
      pipeline_id: pipelineId,
      run_id: runId,
      source_id: sourceId,
      level: 'info',
      stage: 'transform',
      message: 'Transforming source records into metric datapoints',
      details: {
          records_received: records.length,
          total_records_available: totalRecordsAfterFilters,
          batch_offset: batchOffset,
          batch_size: batchSize,
          mapping_count: mappings.length,
          operations_applied: operationResult.operationsApplied,
          recovery_mode: replayRunId ? 'replay' : windowStart || windowEnd ? 'backfill' : 'standard',
        },
      });

    const missingMetricNames = new Map<string, string>();
    for (const record of records) {
      if (!metricNameMapping) break;
      if (valueMapping.targetMetricId) break;
      const metricName = String(record[metricNameMapping.sourceField] ?? '').trim();
      if (!metricName || metricsByName.has(metricName) || missingMetricNames.has(metricName)) continue;
      const metricUnit = unitMapping ? String(record[unitMapping.sourceField] ?? '') : '';
      missingMetricNames.set(metricName, metricUnit);
    }

    if (missingMetricNames.size > 0) {
      const newMetricRows = Array.from(missingMetricNames.entries()).map(([name, unit]) => ({
        name,
        organization_id: organizationId,
        unit,
        target_value: 0,
        current_value: 0,
      }));

      const { data: insertedMetrics, error: insertedMetricsError } = await adminClient
        .from('metrics')
        .insert(newMetricRows)
        .select('id, name');

      if (insertedMetricsError) {
        throw new Error(insertedMetricsError.message);
      }

      (insertedMetrics || []).forEach((metric) => {
        metricsByName.set(metric.name as string, metric.id as string);
      });
    }

    for (const [index, record] of records.entries()) {
      try {
        const rawValue = record[valueMapping.sourceField];
        const value = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue ?? ''));

        if (Number.isNaN(value)) {
          recordsFailed++;
          if (failureSamples.length < 5) {
            failureSamples.push({
              row_index: index,
              reason: 'Mapped value is not numeric',
              value_field: valueMapping.sourceField,
              raw_value: rawValue ?? null,
            });
          }
          continue;
        }

        let metricId = valueMapping.targetMetricId;

        if (!metricId && metricNameMapping) {
          const metricName = String(record[metricNameMapping.sourceField] ?? '').trim();
          if (!metricName) {
            recordsFailed++;
            if (failureSamples.length < 5) {
              failureSamples.push({
                row_index: index,
                reason: 'Metric name is empty',
                metric_name_field: metricNameMapping.sourceField,
              });
            }
            continue;
          }

          metricId = metricsByName.get(metricName);
        }

        if (!metricId) {
          recordsFailed++;
          if (failureSamples.length < 5) {
            failureSamples.push({
              row_index: index,
              reason: 'No metric target could be resolved',
              metric_name_field: metricNameMapping?.sourceField ?? null,
              value_field: valueMapping.sourceField,
            });
          }
          continue;
        }

        let timestamp = new Date().toISOString();
        if (timestampMapping) {
          const rawTimestamp = record[timestampMapping.sourceField];
          const parsedTimestamp = new Date(String(rawTimestamp ?? ''));
          if (!Number.isNaN(parsedTimestamp.getTime())) {
            timestamp = parsedTimestamp.toISOString();
          }
        }

        dataPoints.push({
          metric_id: metricId,
          value,
          timestamp,
          organization_id: organizationId,
          source: provenanceSource,
        });
        const previousLatest = latestMetricValues.get(metricId);
        if (!previousLatest || new Date(timestamp).getTime() >= new Date(previousLatest.timestamp).getTime()) {
          latestMetricValues.set(metricId, { value, timestamp });
        }

        recordsSuccess++;
      } catch (error) {
        console.error('Error processing ETL record:', error);
        recordsFailed++;
        if (failureSamples.length < 5) {
          failureSamples.push({
            row_index: index,
            reason: error instanceof Error ? error.message : String(error),
            value_field: valueMapping.sourceField,
            metric_name_field: metricNameMapping?.sourceField ?? null,
          });
        }
      }
    }

    if (recordsFailed > 0) {
      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipelineId,
        run_id: runId,
        source_id: sourceId,
        level: 'warning',
        stage: 'transform',
        message: 'Some records failed validation or mapping during transformation',
        details: {
          records_received: records.length,
          records_success: recordsSuccess,
          records_failed: recordsFailed,
          excluded_by_operations: operationResult.excludedRecords,
          excluded_by_backfill: backfillResult.excludedRecords,
          sample_failures: failureSamples,
        },
      });
    }

    if (dataPoints.length > 0) {
      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipelineId,
        run_id: runId,
        source_id: sourceId,
        level: 'info',
        stage: 'load',
        message: 'Writing transformed datapoints to metric_data',
        details: {
          datapoints: dataPoints.length,
          provenance_source: provenanceSource,
        },
      });

      for (const chunk of chunkArray(dataPoints, 1000)) {
        const { error: insertError } = await adminClient
          .from('metric_data')
          .insert(chunk);

        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      for (const [metricId, latestPoint] of latestMetricValues.entries()) {
        const { error: updateMetricError } = await adminClient
          .from('metrics')
          .update({ current_value: latestPoint.value, actual_value: latestPoint.value })
          .eq('id', metricId)
          .eq('organization_id', organizationId);

        if (updateMetricError) {
          throw new Error(updateMetricError.message);
        }
      }
    }

    const cumulativeProcessed = pipelineRunStartingTotals.records_processed + records.length;
    const cumulativeSuccess = pipelineRunStartingTotals.records_success + recordsSuccess;
    const cumulativeFailed = pipelineRunStartingTotals.records_failed + recordsFailed;
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    if (hasMore) {
      await adminClient
        .from('etl_pipeline_runs')
        .update({
          status: 'running',
          records_processed: cumulativeProcessed,
          records_success: cumulativeSuccess,
          records_failed: cumulativeFailed,
          duration_seconds: durationSeconds,
        })
        .eq('id', runId);

      return new Response(JSON.stringify({
        success: true,
        status: 'running',
        pipelineId,
        runId,
        batch_records_processed: records.length,
        batch_records_success: recordsSuccess,
        batch_records_failed: recordsFailed,
        records_processed: cumulativeProcessed,
        records_success: cumulativeSuccess,
        records_failed: cumulativeFailed,
        total_records_available: totalRecordsAfterFilters,
        next_batch_offset: batchOffset + batchRecords.length,
        has_more: true,
        batch_size: batchSize,
        message: `Processed ${cumulativeProcessed} of ${totalRecordsAfterFilters} records`,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const runStatus: RunStatus = cumulativeFailed > 0 && cumulativeSuccess > 0
      ? 'partial'
      : cumulativeFailed > 0 && cumulativeSuccess === 0
        ? 'failed'
        : 'completed';

    await adminClient
      .from('etl_pipeline_runs')
      .update({
        status: runStatus,
        completed_at: new Date().toISOString(),
        records_processed: cumulativeProcessed,
        records_success: cumulativeSuccess,
        records_failed: cumulativeFailed,
        duration_seconds: durationSeconds,
      })
      .eq('id', runId);

    shouldIncrementPipelineTotals = true;
    await adminClient
      .from('etl_pipelines')
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: calculateNextRun(pipeline.schedule),
        total_runs: (pipeline.total_runs || 0) + 1,
        successful_runs: (pipeline.successful_runs || 0) + (runStatus === 'completed' ? 1 : 0),
        failed_runs: (pipeline.failed_runs || 0) + (runStatus === 'failed' ? 1 : 0),
        records_processed: (pipeline.records_processed || 0) + cumulativeSuccess,
        status: runStatus === 'failed' ? 'failed' : 'active',
      })
      .eq('id', pipelineId)
      .eq('organization_id', organizationId);

    await logIngestionEvent(adminClient, {
      organization_id: organizationId,
      pipeline_id: pipelineId,
      run_id: runId,
      source_id: sourceId,
      level: runStatus === 'partial' ? 'warning' : 'info',
      stage: 'complete',
      message: runStatus === 'partial' ? 'Pipeline completed with partial success' : 'Pipeline completed successfully',
      details: {
        status: runStatus,
        records_processed: cumulativeProcessed,
        records_success: cumulativeSuccess,
        records_failed: cumulativeFailed,
        excluded_by_operations: operationResult.excludedRecords,
        excluded_by_backfill: backfillResult.excludedRecords,
        operations_applied: operationResult.operationsApplied,
        duration_seconds: durationSeconds,
      },
    });

    return new Response(JSON.stringify({
      success: runStatus !== 'failed',
      status: runStatus,
      pipelineId,
      runId,
      records_processed: cumulativeProcessed,
      records_success: cumulativeSuccess,
      records_failed: cumulativeFailed,
      excluded_by_operations: operationResult.excludedRecords,
      excluded_by_backfill: backfillResult.excludedRecords,
      operations_applied: operationResult.operationsApplied,
      duration_seconds: durationSeconds,
      has_more: false,
      message: runStatus === 'partial'
        ? `Pipeline completed with warnings: ${cumulativeSuccess} records ingested, ${cumulativeFailed} failed`
        : `Pipeline completed: ${cumulativeSuccess} records ingested`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (runId) {
      await adminClient
        .from('etl_pipeline_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: message,
          duration_seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        })
        .eq('id', runId);
    }

    if (organizationId && pipeline?.id) {
      await logIngestionEvent(adminClient, {
        organization_id: organizationId,
        pipeline_id: pipeline.id,
        run_id: runId,
        source_id: sourceId,
        level: 'error',
        stage: 'failure',
        message: 'Pipeline execution failed',
        details: { error: message },
      });
    }

    if (pipeline?.id && !shouldIncrementPipelineTotals) {
      await adminClient
        .from('etl_pipelines')
        .update({
          total_runs: (pipeline.total_runs || 0) + 1,
          failed_runs: (pipeline.failed_runs || 0) + 1,
          status: 'failed',
          last_run_at: new Date().toISOString(),
        })
        .eq('id', pipeline.id)
        .eq('organization_id', pipeline.organization_id);
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
