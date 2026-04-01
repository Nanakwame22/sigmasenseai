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
    field_mappings?: FieldMapping[];
  };
}

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
  };
}

interface FieldMapping {
  sourceField: string;
  destinationType: 'metric_name' | 'value' | 'timestamp' | 'unit';
  targetMetricId?: string;
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

  try {
    const { data: userData, error: authError } = await authClient.auth.getUser();
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { pipelineId } = await req.json();
    if (!pipelineId) {
      return new Response(JSON.stringify({ error: 'pipelineId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: membership, error: membershipError } = await adminClient
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userData.user.id)
      .single();

    if (membershipError || !membership?.organization_id) {
      return new Response(JSON.stringify({ error: 'Organization membership not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const organizationId = membership.organization_id as string;

    const { data: pipelineData, error: pipelineError } = await adminClient
      .from('etl_pipelines')
      .select('*')
      .eq('id', pipelineId)
      .eq('organization_id', organizationId)
      .single();

    if (pipelineError || !pipelineData) {
      return new Response(JSON.stringify({ error: 'Pipeline not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    pipeline = pipelineData as Pipeline;

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

    const { data: runData, error: runError } = await adminClient
      .from('etl_pipeline_runs')
      .insert({
        pipeline_id: pipelineId,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (runError || !runData?.id) {
      throw new Error(runError?.message ?? 'Failed to create pipeline run');
    }

    runId = runData.id as string;

    const source = sourceData as DataSource;
    let records: Record<string, unknown>[] = [];

    if (source.type === 'api' && source.connection_config?.base_url) {
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
    }

    const mappings = pipeline.transformation_rules?.field_mappings || [];
    const metricNameMapping = mappings.find((m) => m.destinationType === 'metric_name');
    const valueMapping = mappings.find((m) => m.destinationType === 'value');
    const timestampMapping = mappings.find((m) => m.destinationType === 'timestamp');
    const unitMapping = mappings.find((m) => m.destinationType === 'unit');

    if (!valueMapping) {
      throw new Error('Pipeline is missing a value mapping');
    }

    const { data: metricsData } = await adminClient
      .from('metrics')
      .select('id, name')
      .eq('organization_id', organizationId);

    const metricsByName = new Map((metricsData || []).map((metric) => [metric.name, metric.id]));
    const dataPoints: Array<{ metric_id: string; value: number; timestamp: string }> = [];
    let recordsSuccess = 0;
    let recordsFailed = 0;

    for (const record of records) {
      try {
        const rawValue = record[valueMapping.sourceField];
        const value = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue ?? ''));

        if (Number.isNaN(value)) {
          recordsFailed++;
          continue;
        }

        let metricId = valueMapping.targetMetricId;

        if (!metricId && metricNameMapping) {
          const metricName = String(record[metricNameMapping.sourceField] ?? '').trim();
          if (!metricName) {
            recordsFailed++;
            continue;
          }

          metricId = metricsByName.get(metricName);

          if (!metricId) {
            const { data: newMetric, error: newMetricError } = await adminClient
              .from('metrics')
              .insert({
                name: metricName,
                organization_id: organizationId,
                unit: unitMapping ? String(record[unitMapping.sourceField] ?? '') : '',
                target_value: 0,
                current_value: value,
              })
              .select('id, name')
              .single();

            if (newMetricError || !newMetric?.id) {
              throw new Error(newMetricError?.message ?? `Failed to create metric "${metricName}"`);
            }

            metricId = newMetric.id as string;
            metricsByName.set(newMetric.name as string, metricId);
          }
        }

        if (!metricId) {
          recordsFailed++;
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

        dataPoints.push({ metric_id: metricId, value, timestamp });

        await adminClient
          .from('metrics')
          .update({ current_value: value, actual_value: value })
          .eq('id', metricId)
          .eq('organization_id', organizationId);

        recordsSuccess++;
      } catch (error) {
        console.error('Error processing ETL record:', error);
        recordsFailed++;
      }
    }

    if (dataPoints.length > 0) {
      const { error: insertError } = await adminClient
        .from('metric_data')
        .insert(dataPoints);

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    await adminClient
      .from('etl_pipeline_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        records_processed: records.length,
        records_success: recordsSuccess,
        records_failed: recordsFailed,
        duration_seconds: durationSeconds,
      })
      .eq('id', runId);

    await adminClient
      .from('etl_pipelines')
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: calculateNextRun(pipeline.schedule),
        total_runs: (pipeline.total_runs || 0) + 1,
        successful_runs: (pipeline.successful_runs || 0) + 1,
        records_processed: (pipeline.records_processed || 0) + recordsSuccess,
        status: 'active',
      })
      .eq('id', pipelineId)
      .eq('organization_id', organizationId);

    return new Response(JSON.stringify({
      success: true,
      pipelineId,
      runId,
      records_processed: records.length,
      records_success: recordsSuccess,
      records_failed: recordsFailed,
      duration_seconds: durationSeconds,
      message: `Pipeline completed: ${recordsSuccess} records ingested`,
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

    if (pipeline?.id) {
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
