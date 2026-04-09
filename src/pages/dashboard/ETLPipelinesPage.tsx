import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { buildMappingSuggestion } from '../../lib/mappingAssistant';

interface Pipeline {
  id: string;
  name: string;
  description: string;
  source_id: string | null;
  destination_type: string;
  status: string;
  schedule: string;
  transformation_rules: any;
  last_run_at: string | null;
  next_run_at: string | null;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  records_processed: number;
  created_at: string;
}

interface PipelineRun {
  id: string;
  pipeline_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  records_success: number;
  records_failed: number;
  duration_seconds: number | null;
  error_message: string | null;
}

interface IngestionEvent {
  id: string;
  pipeline_id: string;
  run_id: string | null;
  level: 'info' | 'warning' | 'error';
  stage: 'queued' | 'startup' | 'fetch' | 'transform' | 'load' | 'complete' | 'failure';
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface PipelineRunResponse {
  success: boolean;
  status: string;
  pipelineId: string;
  runId: string;
  records_processed?: number;
  records_success?: number;
  records_failed?: number;
  batch_records_processed?: number;
  batch_records_success?: number;
  batch_records_failed?: number;
  total_records_available?: number;
  next_batch_offset?: number;
  has_more?: boolean;
  batch_size?: number;
  message?: string;
}

interface DataSource {
  id: string;
  name: string;
  type: string;
  connection_config?: any;
  file_data?: any[];
}

interface FieldMapping {
  sourceField: string;
  destinationType: 'metric_name' | 'value' | 'timestamp' | 'unit';
  targetMetricId?: string;
}

interface PipelineValidationResult {
  valid: boolean;
  issues: string[];
}

interface FieldInsight {
  field: string;
  numericRatio: number;
  sampleCount: number;
  mostlyNumeric: boolean;
}

function isManagedOracleSource(source?: DataSource | null) {
  return source?.type === 'api' && source.connection_config?.managed_connector === 'oracle-health-sandbox';
}

export default function ETLPipelinesPage() {
  const { user, organizationId } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const appliedFocusRef = useRef<string | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [latestRuns, setLatestRuns] = useState<Record<string, PipelineRun>>({});
  const [ingestionEvents, setIngestionEvents] = useState<IngestionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);
  const [filter, setFilter] = useState('all');
  const [currentStep, setCurrentStep] = useState(1);
  const [sourcePreview, setSourcePreview] = useState<any[]>([]);
  const [sourceFields, setSourceFields] = useState<string[]>([]);
  const [fieldInsights, setFieldInsights] = useState<FieldInsight[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [runningPipelines, setRunningPipelines] = useState<Set<string>>(new Set());
  const [recordsIngestedToday, setRecordsIngestedToday] = useState(0);

  const [pipelineHistory, setPipelineHistory] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryPipeline, setRecoveryPipeline] = useState<Pipeline | null>(null);
  const [recoveryMode, setRecoveryMode] = useState<'replay' | 'backfill'>('replay');
  const [recoveryRunId, setRecoveryRunId] = useState('');
  const [backfillWindow, setBackfillWindow] = useState({ start: '', end: '' });

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [focusedPipelineId, setFocusedPipelineId] = useState<string | null>(null);
  const focusedMetricId = new URLSearchParams(location.search).get('metric');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    source_id: '',
    destination_type: 'metrics',
    schedule: 'daily',
    transformation_rules: {
      operations: [] as any[],
      field_mappings: [] as FieldMapping[]
    }
  });

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    if (selectedPipeline) {
      loadPipelineRuns(selectedPipeline.id);
    }
  }, [selectedPipeline]);

  useEffect(() => {
    if (loading || pipelines.length === 0) return;

    const params = new URLSearchParams(location.search);
    const pipelineParam = params.get('pipeline');
    const sourceParam = params.get('source');
    const metricParam = params.get('metric');
    const focusKey = `${pipelineParam || ''}-${sourceParam || ''}-${metricParam || ''}`;

    if (!pipelineParam && !sourceParam && !metricParam) return;
    if (appliedFocusRef.current === focusKey) return;

    let nextPipeline: Pipeline | null = null;

    if (pipelineParam) {
      nextPipeline = pipelines.find((pipeline) => pipeline.id === pipelineParam) || null;
    }

    if (!nextPipeline && metricParam) {
      nextPipeline = pipelines.find((pipeline) =>
        Array.isArray(pipeline.transformation_rules?.field_mappings) &&
        pipeline.transformation_rules.field_mappings.some((mapping: FieldMapping) => mapping.targetMetricId === metricParam)
      ) || null;
    }

    if (!nextPipeline && sourceParam) {
      nextPipeline = pipelines.find((pipeline) => pipeline.source_id === sourceParam) || null;
    }

    if (nextPipeline) {
      setSelectedPipeline(nextPipeline);
      setFocusedPipelineId(nextPipeline.id);
    }

    appliedFocusRef.current = focusKey;
  }, [location.search, loading, pipelines]);

  // Calculate next run times and subscribe to realtime updates
  useEffect(() => {
    const interval = setInterval(() => {
      setPipelines(prev => [...prev]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to realtime updates for pipeline runs
  useEffect(() => {
    if (!user) return;

    const getUserOrg = async () => {
      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrgs) return;

      // Subscribe to pipeline runs changes
      const channel = supabase
        .channel('etl_pipeline_runs_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'etl_pipeline_runs',
          },
          (payload) => {
            console.log('Pipeline run changed:', payload);
            
            if (payload.eventType === 'UPDATE') {
              loadData();
              
              // Update selected pipeline runs if viewing details
              if (selectedPipeline && (payload.new as any).pipeline_id === selectedPipeline.id) {
                loadPipelineRuns(selectedPipeline.id);
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    getUserOrg();
  }, [user, selectedPipeline]);

  const loadData = async () => {
    if (!user) return;

    try {
      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrgs) return;

      // Load pipelines
      const { data: pipelinesData, error: pipelinesError } = await supabase
        .from('etl_pipelines')
        .select('*')
        .eq('organization_id', userOrgs.organization_id)
        .order('created_at', { ascending: false });

      if (pipelinesError) throw pipelinesError;
      setPipelines(pipelinesData || []);

      // Load data sources
      const { data: sourcesData, error: sourcesError } = await supabase
        .from('data_sources')
        .select('*')
        .eq('organization_id', userOrgs.organization_id);

      if (sourcesError) throw sourcesError;
      setDataSources(sourcesData || []);

      // Load metrics
      const { data: metricsData, error: metricsError } = await supabase
        .from('metrics')
        .select('id, name, unit')
        .eq('organization_id', userOrgs.organization_id);

      if (metricsError) throw metricsError;
      setMetrics(metricsData || []);

      // Calculate records ingested today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: todayRuns, error: runsError } = await supabase
        .from('etl_pipeline_runs')
        .select('records_success')
        .gte('started_at', today.toISOString())
        .in('status', ['completed', 'partial']);

      if (!runsError && todayRuns) {
        const total = todayRuns.reduce((sum, run) => sum + (run.records_success || 0), 0);
        setRecordsIngestedToday(total);
      }

      const { data: recentRuns, error: recentRunsError } = await supabase
        .from('etl_pipeline_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100);

      if (!recentRunsError && recentRuns) {
        const latestByPipeline: Record<string, PipelineRun> = {};
        recentRuns.forEach((run: PipelineRun) => {
          if (!latestByPipeline[run.pipeline_id]) {
            latestByPipeline[run.pipeline_id] = run;
          }
        });
        setLatestRuns(latestByPipeline);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPipelineRuns = async (pipelineId: string) => {
    try {
      const { data, error } = await supabase
        .from('etl_pipeline_runs')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setPipelineRuns(data || []);

      const { data: eventData, error: eventError } = await supabase
        .from('etl_ingestion_events')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('created_at', { ascending: false })
        .limit(25);

      if (!eventError) {
        setIngestionEvents((eventData as IngestionEvent[]) || []);
      } else {
        setIngestionEvents([]);
      }
    } catch (error) {
      console.error('Error loading pipeline runs:', error);
      setIngestionEvents([]);
    }
  };

  const inferFieldInsights = (previewData: any[], fields: string[]): FieldInsight[] => {
    return fields.map((field) => {
      const values = previewData
        .map((row) => row?.[field])
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== '');

      const numericValues = values.filter((value) => {
        if (typeof value === 'number') return !Number.isNaN(value);
        const normalized = String(value).replace(/,/g, '').trim();
        return normalized !== '' && !Number.isNaN(Number(normalized));
      });

      const sampleCount = values.length;
      const numericRatio = sampleCount > 0 ? numericValues.length / sampleCount : 0;

      return {
        field,
        sampleCount,
        numericRatio,
        mostlyNumeric: numericRatio >= 0.6,
      };
    });
  };

  const getValueCandidateFields = (fields: string[], insights: FieldInsight[]): string[] => {
    const ranked = [...fields].sort((a, b) => {
      const insightA = insights.find((item) => item.field === a);
      const insightB = insights.find((item) => item.field === b);
      const scoreA = insightA?.numericRatio ?? 0;
      const scoreB = insightB?.numericRatio ?? 0;

      if (scoreA !== scoreB) return scoreB - scoreA;

      const nameBoostA = /(value|amount|score|count|rate|total|number|qty)/i.test(a) ? 1 : 0;
      const nameBoostB = /(value|amount|score|count|rate|total|number|qty)/i.test(b) ? 1 : 0;

      if (nameBoostA !== nameBoostB) return nameBoostB - nameBoostA;
      return a.localeCompare(b);
    });

    return ranked;
  };

  const buildOracleFallbackPreview = (source: DataSource) => {
    const resourceTypes = Array.isArray(source.connection_config?.resource_types)
      ? source.connection_config.resource_types
      : Array.isArray(source.connection_config?.current_columns)
        ? source.connection_config.current_columns
        : [];
    const verifiedAt =
      source.connection_config?.last_verified_at ||
      source.connection_config?.last_sync ||
      new Date().toISOString();

    return (resourceTypes.length > 0 ? resourceTypes : ['CapabilityStatement']).slice(0, 5).map((resourceType: string) => ({
      metric_name: `Oracle ${resourceType} Coverage`,
      value: 1,
      target_value: 1,
      unit: 'resource',
      category: 'Oracle Health',
      timestamp: verifiedAt,
      source: `oracle-health:${String(resourceType).toLowerCase()}`,
      evidence_summary: `Managed Oracle sandbox connector verified ${resourceType} from the live public FHIR endpoint.`,
    }));
  };

  const loadManagedOraclePreview = async (source: DataSource) => {
    if (!organizationId) {
      return buildOracleFallbackPreview(source);
    }

    const { data: metricRows, error: metricError } = await supabase
      .from('metrics')
      .select('id, name, unit, current_value, target_value, category, description')
      .eq('organization_id', organizationId)
      .eq('data_source_id', source.id)
      .order('name', { ascending: true });

    if (metricError) throw metricError;

    if (!metricRows || metricRows.length === 0) {
      return buildOracleFallbackPreview(source);
    }

    const metricIds = metricRows.map((metric: any) => metric.id);
    const latestPointsByMetric = new Map<string, { value: number; timestamp: string; source?: string }>();

    if (metricIds.length > 0) {
      const { data: pointRows, error: pointError } = await supabase
        .from('metric_data')
        .select('metric_id, value, timestamp, source')
        .eq('organization_id', organizationId)
        .in('metric_id', metricIds)
        .order('timestamp', { ascending: false })
        .limit(Math.max(metricIds.length * 3, 25));

      if (pointError) throw pointError;

      (pointRows || []).forEach((point: any) => {
        if (!latestPointsByMetric.has(point.metric_id)) {
          latestPointsByMetric.set(point.metric_id, {
            value: Number(point.value) || 0,
            timestamp: point.timestamp,
            source: point.source || undefined,
          });
        }
      });
    }

    return metricRows.slice(0, 8).map((metric: any) => {
      const latestPoint = latestPointsByMetric.get(metric.id);
      return {
        metric_name: metric.name,
        value: latestPoint?.value ?? Number(metric.current_value) ?? 0,
        target_value: Number(metric.target_value) || 0,
        unit: metric.unit || '',
        category: metric.category || 'Oracle Health',
        timestamp:
          latestPoint?.timestamp ||
          source.connection_config?.last_verified_at ||
          new Date().toISOString(),
        source: latestPoint?.source || 'oracle-health-sandbox',
        evidence_summary:
          metric.description ||
          'Managed Oracle sandbox metric generated from the shared integration bridge.',
      };
    });
  };

  const loadSourcePreview = async (sourceId: string) => {
    if (!sourceId) return;

    setLoadingPreview(true);
    try {
      const source = dataSources.find(s => s.id === sourceId);
      if (!source) return;

      let previewData: any[] = [];
      let fields: string[] = [];

      if (isManagedOracleSource(source)) {
        previewData = await loadManagedOraclePreview(source);
      } else if (source.type === 'api' && source.connection_config) {
        // Fetch from API
        const config = source.connection_config;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };

        if (config.auth_type === 'api_key' && config.auth_key_name && config.auth_key_value) {
          headers[config.auth_key_name] = config.auth_key_value;
        } else if (config.auth_type === 'bearer' && config.auth_key_value) {
          headers['Authorization'] = `Bearer ${config.auth_key_value}`;
        } else if (config.auth_type === 'basic' && config.auth_key_name && config.auth_key_value) {
          const encoded = btoa(`${config.auth_key_name}:${config.auth_key_value}`);
          headers['Authorization'] = `Basic ${encoded}`;
        }

        if (config.custom_headers && Array.isArray(config.custom_headers)) {
          config.custom_headers.forEach((header: any) => {
            if (header.key && header.value) {
              headers[header.key] = header.value;
            }
          });
        }

        const response = await fetch(config.base_url, {
          method: config.http_method || 'GET',
          headers
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const extractedData = extractDataFromJsonPath(data, config.json_path || '');
        previewData = extractedData.slice(0, 5);
      } else if (source.file_data && Array.isArray(source.file_data)) {
        // Use file data
        previewData = source.file_data.slice(0, 5);
      }

      if (previewData.length > 0) {
        fields = Object.keys(previewData[0]);
      }

      setSourcePreview(previewData);
      setSourceFields(fields);

      const insights = inferFieldInsights(previewData, fields);
      setFieldInsights(insights);

      // Initialize field mappings if empty
      if (fieldMappings.length === 0 && fields.length > 0) {
        const initialMappings: FieldMapping[] = [];
        const valueCandidates = getValueCandidateFields(fields, insights);
        
        // Auto-detect common field names
        const nameField = fields.find(f => 
          f.toLowerCase().includes('name') || f.toLowerCase().includes('metric')
        );
        const valueField = valueCandidates.find(f => 
          f.toLowerCase().includes('value') || f.toLowerCase().includes('amount')
        ) || valueCandidates[0];
        const timestampField = fields.find(f => 
          f.toLowerCase().includes('date') || f.toLowerCase().includes('time')
        );
        const unitField = fields.find(f => 
          f.toLowerCase().includes('unit')
        );

        if (nameField) {
          initialMappings.push({ sourceField: nameField, destinationType: 'metric_name' });
        }
        if (valueField) {
          initialMappings.push({ sourceField: valueField, destinationType: 'value' });
        }
        if (timestampField) {
          initialMappings.push({ sourceField: timestampField, destinationType: 'timestamp' });
        }
        if (unitField) {
          initialMappings.push({ sourceField: unitField, destinationType: 'unit' });
        }

        setFieldMappings(initialMappings);
      }
    } catch (error) {
      console.error('Error loading source preview:', error);
      showToast('Failed to load source preview', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const extractDataFromJsonPath = (data: any, path: string): any[] => {
    if (!path || path.trim() === '') {
      if (Array.isArray(data)) return data;
      return [data];
    }

    const keys = path.split('.').filter(k => k.trim() !== '');
    let current = data;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        throw new Error(`JSON path "${path}" not found in response`);
      }
    }

    if (Array.isArray(current)) {
      return current;
    }

    return [current];
  };

  const validatePipelineConfiguration = (pipeline: Pipeline): PipelineValidationResult => {
    const issues: string[] = [];
    const source = dataSources.find((item) => item.id === pipeline.source_id);
    const mappings = Array.isArray(pipeline.transformation_rules?.field_mappings)
      ? pipeline.transformation_rules.field_mappings as FieldMapping[]
      : [];

    if (!pipeline.source_id) {
      issues.push('No data source is selected.');
    }

    if (pipeline.source_id && !source) {
      issues.push('The selected data source is no longer available.');
    }

    if (source?.type === 'api' && !source.connection_config?.base_url) {
      issues.push('The API source is missing its base URL.');
    }

    if (source?.type !== 'api' && (!Array.isArray(source?.file_data) || source.file_data.length === 0)) {
      issues.push('The source does not contain any uploaded data yet.');
    }

    if (mappings.length === 0) {
      issues.push('No field mappings have been configured.');
    }

    if (!mappings.some((mapping) => mapping.destinationType === 'value' && mapping.sourceField)) {
      issues.push('A value mapping is required before this pipeline can run.');
    }

    const incompleteMappings = mappings.filter((mapping) => !mapping.sourceField);
    if (incompleteMappings.length > 0) {
      issues.push('One or more field mappings are incomplete.');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const hasValueMapping = fieldMappings.some(
      (mapping) => mapping.destinationType === 'value' && mapping.sourceField
    );

    if (!hasValueMapping) {
      showToast('Add at least one valid value mapping before saving this pipeline.', 'error');
      return;
    }

    try {
      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrgs) return;

      const pipelineData = {
        organization_id: userOrgs.organization_id,
        name: formData.name,
        description: formData.description,
        source_id: formData.source_id || null,
        destination_type: formData.destination_type,
        schedule: formData.schedule,
        transformation_rules: {
          ...formData.transformation_rules,
          field_mappings: fieldMappings
        },
        status: 'draft',
        created_by: user.id
      };

      if (editingPipeline) {
        const { error } = await supabase
          .from('etl_pipelines')
          .update(pipelineData)
          .eq('id', editingPipeline.id);

        if (error) throw error;
        showToast('Pipeline updated successfully', 'success');
      } else {
        const { error } = await supabase
          .from('etl_pipelines')
          .insert([pipelineData]);

        if (error) throw error;
        showToast('Pipeline created successfully', 'success');
      }

      setShowModal(false);
      setEditingPipeline(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving pipeline:', error);
      showToast('Failed to save pipeline', 'error');
    }
  };

  const executePipelineRun = async ({
    pipelineId,
    replayRunId,
    windowStart,
    windowEnd,
  }: {
    pipelineId: string;
    replayRunId?: string;
    windowStart?: string;
    windowEnd?: string;
  }) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline || !pipeline.source_id) {
      showToast('Pipeline has no data source configured', 'error');
      return;
    }

    const validation = validatePipelineConfiguration(pipeline);
    if (!validation.valid) {
      showToast(validation.issues[0], 'error', 5000);
      return;
    }

    setRunningPipelines(prev => new Set(prev).add(pipelineId));

    try {
      showToast(
        replayRunId
          ? 'Replay started'
          : windowStart || windowEnd
            ? 'Backfill started'
            : 'Pipeline started',
        'info'
      );

      let nextBatchOffset = 0;
      let existingRunId: string | null = null;
      let finalResponse: PipelineRunResponse | null = null;
      let hasMore = true;
      const batchSize = 1000;

      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('run-etl-pipeline', {
          body: {
            pipelineId,
            replayRunId: replayRunId || null,
            windowStart: windowStart || null,
            windowEnd: windowEnd || null,
            existingRunId,
            batchOffset: nextBatchOffset,
            batchSize,
          }
        });

        if (error) throw error;

        finalResponse = data as PipelineRunResponse;
        existingRunId = finalResponse.runId;
        hasMore = Boolean(finalResponse.has_more);
        nextBatchOffset = finalResponse.next_batch_offset || 0;
      }

      showToast(finalResponse?.message || 'Pipeline completed successfully', 'success');
      loadData();
      if (selectedPipeline?.id === pipelineId) {
        loadPipelineRuns(pipelineId);
      }
    } catch (error: any) {
      console.error('Error running pipeline:', error);
      showToast(error.message || 'Pipeline execution failed', 'error');
    } finally {
      setRunningPipelines(prev => {
        const updated = new Set(prev);
        updated.delete(pipelineId);
        return updated;
      });
    }
  };

  const handleRunPipeline = async (pipelineId: string) => {
    await executePipelineRun({ pipelineId });
  };

  const openRecoveryModal = async (pipeline: Pipeline) => {
    await loadPipelineRuns(pipeline.id);
    setRecoveryPipeline(pipeline);
    setRecoveryMode('replay');
    setRecoveryRunId(latestRuns[pipeline.id]?.id || '');
    setBackfillWindow({ start: '', end: '' });
    setShowRecoveryModal(true);
  };

  const handleRecoverySubmit = async () => {
    if (!recoveryPipeline) return;

    if (recoveryMode === 'backfill') {
      if (!backfillWindow.start && !backfillWindow.end) {
        showToast('Choose a backfill start or end date before running.', 'error');
        return;
      }

      await executePipelineRun({
        pipelineId: recoveryPipeline.id,
        windowStart: backfillWindow.start || undefined,
        windowEnd: backfillWindow.end || undefined,
      });
    } else {
      await executePipelineRun({
        pipelineId: recoveryPipeline.id,
        replayRunId: recoveryRunId || undefined,
      });
    }

    setShowRecoveryModal(false);
  };

  const getNextRunCountdown = (nextRunAt: string | null): string => {
    if (!nextRunAt) return 'Not scheduled';
    
    const now = new Date().getTime();
    const next = new Date(nextRunAt).getTime();
    const diff = next - now;

    if (diff <= 0) return 'Overdue';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const handleToggleStatus = async (pipeline: Pipeline) => {
    try {
      const newStatus = pipeline.status === 'active' ? 'paused' : 'active';
      const { error } = await supabase
        .from('etl_pipelines')
        .update({ status: newStatus })
        .eq('id', pipeline.id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error toggling pipeline status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Pipeline',
      message: 'Are you sure you want to delete this pipeline? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('etl_pipelines')
            .delete()
            .eq('id', id);

          if (error) throw error;
          
          showToast('Pipeline deleted successfully', 'success');
          loadData();
          if (selectedPipeline?.id === id) {
            setSelectedPipeline(null);
          }
        } catch (error) {
          console.error('Error deleting pipeline:', error);
          showToast('Failed to delete pipeline', 'error');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const handleEdit = (pipeline: Pipeline) => {
    setEditingPipeline(pipeline);
    setFormData({
      name: pipeline.name,
      description: pipeline.description || '',
      source_id: pipeline.source_id || '',
      destination_type: pipeline.destination_type,
      schedule: pipeline.schedule || 'daily',
      transformation_rules: pipeline.transformation_rules || { operations: [] }
    });
    
    if (pipeline.transformation_rules?.field_mappings) {
      setFieldMappings(pipeline.transformation_rules.field_mappings);
    }
    
    if (pipeline.source_id) {
      loadSourcePreview(pipeline.source_id);
    }
    
    setCurrentStep(1);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      source_id: '',
      destination_type: 'metrics',
      schedule: 'daily',
      transformation_rules: { operations: [] }
    });
    setCurrentStep(1);
    setSourcePreview([]);
    setSourceFields([]);
    setFieldInsights([]);
    setFieldMappings([]);
  };

  const addTransformationRule = () => {
    setFormData({
      ...formData,
      transformation_rules: {
        ...formData.transformation_rules,
        operations: [
          ...formData.transformation_rules.operations,
          { type: 'filter', field: '', condition: 'equals', value: '' }
        ]
      }
    });
  };

  const removeTransformationRule = (index: number) => {
    const newOperations = [...formData.transformation_rules.operations];
    newOperations.splice(index, 1);
    setFormData({
      ...formData,
      transformation_rules: { 
        ...formData.transformation_rules,
        operations: newOperations 
      }
    });
  };

  const addFieldMapping = () => {
    setFieldMappings([...fieldMappings, { sourceField: '', destinationType: 'value' }]);
  };

  const removeFieldMapping = (index: number) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== index));
  };

  const updateFieldMapping = (index: number, field: keyof FieldMapping, value: any) => {
    const updated = [...fieldMappings];
    updated[index] = { ...updated[index], [field]: value };
    setFieldMappings(updated);
  };

  const filteredPipelines = pipelines.filter(pipeline => {
    if (filter === 'all') return true;
    return pipeline.status === filter;
  });
  const mappingSuggestion = buildMappingSuggestion(sourceFields, fieldInsights as any, sourcePreview);

  const stats = {
    total: pipelines.length,
    active: pipelines.filter(p => p.status === 'active').length,
    paused: pipelines.filter(p => p.status === 'paused').length,
    totalRuns: pipelines.reduce((sum, p) => sum + p.total_runs, 0),
    recordsIngestedToday: recordsIngestedToday
  };

  const viewPipelineHistory = async (pipelineId: string) => {
    try {
      const pipeline = pipelines.find((item) => item.id === pipelineId) || null;
      setSelectedPipeline(pipeline);
      await loadPipelineRuns(pipelineId);

      const { data, error } = await supabase
        .from('etl_pipeline_runs')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('started_at', { ascending: true })
        .limit(20);

      if (error) throw error;

      const historyData = data?.map(run => ({
        date: new Date(run.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        duration: run.duration_seconds || 0,
        records: run.records_processed || 0,
        success: run.status === 'completed' ? 1 : 0
      })) || [];

      setPipelineHistory(historyData);
      setShowHistoryModal(true);
    } catch (error) {
      console.error('Error loading pipeline history:', error);
    }
  };

  const statusDistribution = [
    { status: 'Active', count: pipelines.filter(p => p.status === 'active').length, color: '#10B981' },
    { status: 'Paused', count: pipelines.filter(p => p.status === 'paused').length, color: '#F59E0B' },
    { status: 'Failed', count: pipelines.filter(p => p.status === 'failed').length, color: '#EF4444' }
  ];

  const getRunStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700';
      case 'partial':
        return 'bg-amber-100 text-amber-700';
      case 'running':
        return 'bg-sky-100 text-sky-700';
      case 'queued':
        return 'bg-slate-100 text-slate-600';
      case 'failed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getEventLevelBadge = (level: IngestionEvent['level']) => {
    switch (level) {
      case 'error':
        return 'bg-red-100 text-red-700';
      case 'warning':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ETL Pipelines</h1>
          <p className="text-sm text-gray-600 mt-1">Automate data extraction, transformation, and loading</p>
        </div>
        <button
          onClick={() => {
            setEditingPipeline(null);
            resetForm();
            setShowModal(true);
          }}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-2"
        >
          <i className="ri-add-line"></i>
          Create Pipeline
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Pipelines</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="ri-git-branch-line text-2xl text-blue-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-play-circle-line text-2xl text-green-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Paused</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{stats.paused}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="ri-pause-circle-line text-2xl text-orange-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Runs</p>
              <p className="text-2xl font-bold text-teal-600 mt-1">{stats.totalRuns}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-refresh-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Records Today</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{stats.recordsIngestedToday.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <i className="ri-database-line text-2xl text-purple-600"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['all', 'active', 'paused', 'draft', 'failed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filter === status
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {selectedPipeline && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">ETL Provenance</div>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {focusedMetricId
              ? `Focused on the pipeline currently feeding the selected metric`
              : 'Focused on the latest pipeline execution context'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Latest known run status:{' '}
            <span className="font-semibold text-slate-900">
              {latestRuns[selectedPipeline.id]?.status || 'No run history yet'}
            </span>
            {latestRuns[selectedPipeline.id]?.started_at
              ? ` • started ${new Date(latestRuns[selectedPipeline.id].started_at).toLocaleString()}`
              : ''}
            . SigmaSense currently traces metrics to the pipeline and run stream, but not yet to an exact per-point run id inside `metric_data`.
          </p>
        </div>
      )}

      {/* Pipeline Status Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Pipeline Status Overview</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={statusDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="status" stroke="#6B7280" style={{ fontSize: '12px' }} />
            <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
              labelStyle={{ color: '#111827', fontWeight: 600 }}
            />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {statusDistribution.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pipelines Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredPipelines.map((pipeline) => (
          <div
            key={pipeline.id}
            className={`bg-white rounded-lg shadow-sm border p-6 ${
              focusedPipelineId === pipeline.id
                ? 'border-teal-400 ring-2 ring-teal-100'
                : 'border-gray-200'
            }`}
          >
            {(() => {
              const validation = validatePipelineConfiguration(pipeline);
              const source = dataSources.find((item) => item.id === pipeline.source_id);

              return (
                <>
                  {!validation.valid && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-semibold text-amber-800">Needs configuration</p>
                      <p className="text-xs text-amber-700 mt-1">{validation.issues[0]}</p>
                    </div>
                  )}
                  {source && (
                    <div className="mb-3 text-xs text-gray-500">
                      Source: <span className="font-medium text-gray-700">{source.name}</span>
                    </div>
                  )}
                </>
              );
            })()}

            {latestRuns[pipeline.id] && (
              <div className="flex items-center justify-between mb-3">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getRunStatusBadge(latestRuns[pipeline.id].status)}`}>
                  {latestRuns[pipeline.id].status}
                </span>
                <span className="text-xs text-gray-500">
                  Last run {new Date(latestRuns[pipeline.id].started_at).toLocaleString()}
                </span>
              </div>
            )}

            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{pipeline.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{pipeline.description}</p>
              </div>
              <button
                onClick={() => viewPipelineHistory(pipeline.id)}
                className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                title="View History"
              >
                <i className="ri-line-chart-line text-lg"></i>
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
              <span className="flex items-center gap-1">
                <i className="ri-time-line"></i>
                {pipeline.schedule}
              </span>
              <span className="flex items-center gap-1">
                <i className="ri-database-2-line"></i>
                {pipeline.destination_type}
              </span>
              {pipeline.status === 'active' && pipeline.next_run_at && (
                <span className="flex items-center gap-1 text-teal-600 font-medium">
                  <i className="ri-timer-line"></i>
                  Next: {getNextRunCountdown(pipeline.next_run_at)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs mb-3">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-teal-600 h-1.5 rounded-full"
                  style={{
                    width: `${pipeline.total_runs > 0 ? (pipeline.successful_runs / pipeline.total_runs) * 100 : 0}%`
                  }}
                ></div>
              </div>
              <span className="text-gray-600">
                {pipeline.successful_runs}/{pipeline.total_runs} runs
              </span>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRunPipeline(pipeline.id);
                }}
                disabled={runningPipelines.has(pipeline.id)}
                className="px-3 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {runningPipelines.has(pipeline.id) ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-1"></i>
                    Running...
                  </>
                ) : (
                  <>
                    <i className="ri-play-line mr-1"></i>
                    Run Now
                  </>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openRecoveryModal(pipeline);
                }}
                className="px-3 py-1 text-xs border border-teal-200 text-teal-700 rounded hover:bg-teal-50 transition-colors whitespace-nowrap"
              >
                Recovery
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleStatus(pipeline);
                }}
                className="px-3 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                {pipeline.status === 'active' ? 'Pause' : 'Activate'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(pipeline);
                }}
                className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
              >
                <i className="ri-edit-line"></i>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(pipeline.id);
                }}
                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Pipeline Execution History</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Runs</h3>
                <div className="space-y-3">
                  {pipelineRuns.map((run) => (
                    <div key={run.id} className="flex items-start justify-between border border-gray-200 rounded-lg p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getRunStatusBadge(run.status)}`}>
                            {run.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(run.started_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-2">
                          {run.records_success} succeeded, {run.records_failed} failed, {run.records_processed} processed
                        </p>
                        {run.error_message && (
                          <p className="text-xs text-red-600 mt-1">{run.error_message}</p>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {run.duration_seconds || 0}s
                      </div>
                    </div>
                  ))}
                  {pipelineRuns.length === 0 && (
                    <p className="text-sm text-gray-500">No pipeline runs recorded yet.</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Ingestion Events</h3>
                <div className="space-y-3">
                  {ingestionEvents.map((event) => (
                    <div key={event.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getEventLevelBadge(event.level)}`}>
                            {event.level}
                          </span>
                          <span className="text-xs uppercase tracking-wide text-gray-500">{event.stage}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 mt-2">{event.message}</p>
                      {event.details && Object.keys(event.details).length > 0 && (
                        <pre className="mt-2 bg-gray-50 rounded p-2 text-xs text-gray-600 overflow-x-auto">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                  {ingestionEvents.length === 0 && (
                    <p className="text-sm text-gray-500">No ingestion events available. Run the SQL file for ETL event logging if this stays empty.</p>
                  )}
                </div>
              </div>

              {/* Duration Chart */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Execution Duration (seconds)</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={pipelineHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" stroke="#6B7280" style={{ fontSize: '11px' }} />
                    <YAxis stroke="#6B7280" style={{ fontSize: '11px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                    />
                    <Line type="monotone" dataKey="duration" stroke="#14B8A6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Records Processed Chart */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Records Processed</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={pipelineHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" stroke="#6B7280" style={{ fontSize: '11px' }} />
                    <YAxis stroke="#6B7280" style={{ fontSize: '11px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                    />
                    <Bar dataKey="records" fill="#3B82F6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRecoveryModal && recoveryPipeline && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Recovery Controls</h2>
                <p className="text-sm text-gray-600 mt-1">Replay the latest stored snapshot or backfill a timestamp window.</p>
              </div>
              <button
                onClick={() => setShowRecoveryModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{recoveryPipeline.name}</p>
                <p className="text-xs text-slate-600 mt-1">
                  Recovery mode works against the current connected source and records the replay or backfill context in ingestion logs.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setRecoveryMode('replay')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${recoveryMode === 'replay' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Replay
                </button>
                <button
                  onClick={() => setRecoveryMode('backfill')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${recoveryMode === 'backfill' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Backfill
                </button>
              </div>

              {recoveryMode === 'replay' ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Reference run</label>
                  <select
                    value={recoveryRunId}
                    onChange={(e) => setRecoveryRunId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">Use latest source snapshot</option>
                    {pipelineRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {new Date(run.started_at).toLocaleString()} - {run.status}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">Replay reruns the latest stored source snapshot and tags the recovery with a prior run reference.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start</label>
                    <input
                      type="datetime-local"
                      value={backfillWindow.start}
                      onChange={(e) => setBackfillWindow((current) => ({ ...current, start: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End</label>
                    <input
                      type="datetime-local"
                      value={backfillWindow.end}
                      onChange={(e) => setBackfillWindow((current) => ({ ...current, end: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                  <p className="md:col-span-2 text-xs text-gray-500">Backfill requires a timestamp mapping on the pipeline so SigmaSense can replay only the records in that window.</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowRecoveryModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecoverySubmit}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  Run Recovery
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingPipeline ? 'Edit Pipeline' : 'Create Pipeline'}
              </h2>
              
              {/* Step Indicator */}
              <div className="flex items-center gap-2 mt-4">
                <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-teal-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 1 ? 'bg-teal-600 text-white' : 'bg-gray-200'}`}>
                    1
                  </div>
                  <span className="text-sm font-medium">Basic Info</span>
                </div>
                <div className="flex-1 h-0.5 bg-gray-200"></div>
                <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-teal-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 2 ? 'bg-teal-600 text-white' : 'bg-gray-200'}`}>
                    2
                  </div>
                  <span className="text-sm font-medium">Field Mapping</span>
                </div>
                <div className="flex-1 h-0.5 bg-gray-200"></div>
                <div className={`flex items-center gap-2 ${currentStep >= 3 ? 'text-teal-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 3 ? 'bg-teal-600 text-white' : 'bg-gray-200'}`}>
                    3
                  </div>
                  <span className="text-sm font-medium">Review</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Step 1: Basic Info */}
              {currentStep === 1 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pipeline Name</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      placeholder="My ETL Pipeline"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      rows={2}
                      placeholder="Describe what this pipeline does..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Data Source</label>
                      <select
                        value={formData.source_id}
                        onChange={(e) => {
                          setFormData({ ...formData, source_id: e.target.value });
                          if (e.target.value) {
                            loadSourcePreview(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      >
                        <option value="">Select source...</option>
                        {dataSources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.name} ({source.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                      <select
                        value={formData.destination_type}
                        onChange={(e) => setFormData({ ...formData, destination_type: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      >
                        <option value="metrics">Metrics</option>
                        <option value="database">Database</option>
                        <option value="file">File</option>
                        <option value="api">API</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Schedule</label>
                    <select
                      value={formData.schedule}
                      onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    >
                      <option value="manual">Manual</option>
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </>
              )}

              {/* Step 2: Field Mapping */}
              {currentStep === 2 && (
                <>
                  {loadingPreview ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                    </div>
                  ) : (
                    <>
                      {sourcePreview.length > 0 && (
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Source Data Preview</h3>
                          <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-auto">
                            <pre className="text-xs text-gray-700">
                              {JSON.stringify(sourcePreview, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}

                      {sourceFields.length > 0 && (
                        <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-4 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <i className="ri-ai-generate text-teal-600"></i>
                                <p className="text-sm font-semibold text-teal-900">AI-assisted mapping suggestion</p>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  mappingSuggestion.confidence === 'high'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : mappingSuggestion.confidence === 'medium'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {mappingSuggestion.confidence} confidence
                                </span>
                              </div>
                              <p className="text-sm text-teal-900/90 mt-1">
                                Best value candidate: <span className="font-semibold">{mappingSuggestion.recommendedValueField || 'review manually'}</span>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setFieldMappings(mappingSuggestion.mappings as FieldMapping[]);
                                showToast(`Suggested mappings applied with ${mappingSuggestion.confidence} confidence`, 'success');
                              }}
                              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm whitespace-nowrap"
                            >
                              Apply suggestion
                            </button>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              {mappingSuggestion.rationale.map((reason) => (
                                <div key={reason} className="rounded-lg border border-teal-100 bg-white px-3 py-2 text-sm text-slate-700">
                                  {reason}
                                </div>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-2 content-start">
                              {getValueCandidateFields(sourceFields, fieldInsights)
                                .filter((field) => fieldInsights.find((insight) => insight.field === field)?.mostlyNumeric)
                                .slice(0, 4)
                                .map((field) => {
                                  const insight = fieldInsights.find((item) => item.field === field);
                                  return (
                                    <span
                                      key={field}
                                      className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-teal-700 border border-teal-200"
                                    >
                                      {field} {insight ? `(${Math.round(insight.numericRatio * 100)}% numeric)` : ''}
                                    </span>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">Field Mappings</label>
                          <button
                            type="button"
                            onClick={addFieldMapping}
                            className="text-sm text-teal-600 hover:text-teal-700 whitespace-nowrap"
                          >
                            <i className="ri-add-line"></i> Add Mapping
                          </button>
                        </div>
                        <div className="space-y-3">
                          {fieldMappings.map((mapping, index) => (
                            <div key={index} className="flex gap-2 items-center bg-gray-50 p-3 rounded-lg">
                              <div className="flex-1">
                                <label className="block text-xs text-gray-600 mb-1">Source Field</label>
                                <select
                                  value={mapping.sourceField}
                                  onChange={(e) => updateFieldMapping(index, 'sourceField', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                >
                                  <option value="">Select field...</option>
                                  {(mapping.destinationType === 'value'
                                    ? getValueCandidateFields(sourceFields, fieldInsights)
                                    : sourceFields
                                  ).map(field => {
                                    const insight = fieldInsights.find((item) => item.field === field);
                                    const isNumericHint = mapping.destinationType === 'value' && insight?.mostlyNumeric;

                                    return (
                                      <option key={field} value={field}>
                                        {field}{isNumericHint ? ` - ${Math.round((insight?.numericRatio || 0) * 100)}% numeric` : ''}
                                      </option>
                                    );
                                  })}
                                  {sourceFields.length === 0 && (
                                    <option value="" disabled>No fields available</option>
                                  )}
                                </select>
                              </div>
                              <div className="w-8 h-8 flex items-center justify-center text-gray-400">
                                <i className="ri-arrow-right-line"></i>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs text-gray-600 mb-1">Destination Type</label>
                                <select
                                  value={mapping.destinationType}
                                  onChange={(e) => updateFieldMapping(index, 'destinationType', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                >
                                  <option value="metric_name">Metric Name</option>
                                  <option value="value">Value</option>
                                  <option value="timestamp">Timestamp</option>
                                  <option value="unit">Unit</option>
                                </select>
                              </div>
                              {mapping.destinationType === 'value' && (
                                <div className="flex-1">
                                  <label className="block text-xs text-gray-600 mb-1">Target Metric</label>
                                  <select
                                    value={mapping.targetMetricId || ''}
                                    onChange={(e) => updateFieldMapping(index, 'targetMetricId', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  >
                                    <option value="">Auto-create from name</option>
                                    {metrics.map(metric => (
                                      <option key={metric.id} value={metric.id}>{metric.name}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => removeFieldMapping(index)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            </div>
                          ))}
                          {fieldMappings.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">No field mappings added</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Step 3: Review */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Pipeline Configuration</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Name:</span>
                        <span className="font-medium">{formData.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Source:</span>
                        <span className="font-medium">
                          {dataSources.find(s => s.id === formData.source_id)?.name || 'None'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Destination:</span>
                        <span className="font-medium">{formData.destination_type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Schedule:</span>
                        <span className="font-medium">{formData.schedule}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Field Mappings:</span>
                        <span className="font-medium">{fieldMappings.length}</span>
                      </div>
                    </div>
                  </div>

                  {fieldMappings.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Field Mappings</h3>
                      <div className="space-y-2">
                        {fieldMappings.map((mapping, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <span className="text-gray-600">{mapping.sourceField}</span>
                            <i className="ri-arrow-right-line text-gray-400"></i>
                            <span className="font-medium">{mapping.destinationType}</span>
                            {mapping.targetMetricId && (
                              <>
                                <i className="ri-arrow-right-line text-gray-400"></i>
                                <span className="text-teal-600">
                                  {metrics.find(m => m.id === mapping.targetMetricId)?.name}
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                {currentStep > 1 && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(currentStep - 1)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-arrow-left-line mr-1"></i>
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingPipeline(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                {currentStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (currentStep === 1 && !formData.source_id) {
                        showToast('Please select a data source', 'error');
                        return;
                      }
                      if (currentStep === 2 && !fieldMappings.some((mapping) => mapping.destinationType === 'value' && mapping.sourceField)) {
                        showToast('Add at least one value mapping before continuing.', 'error');
                        return;
                      }
                      setCurrentStep(currentStep + 1);
                    }}
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    Next
                    <i className="ri-arrow-right-line ml-1"></i>
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    {editingPipeline ? 'Update Pipeline' : 'Create Pipeline'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
