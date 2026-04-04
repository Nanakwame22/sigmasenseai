import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface DataSource {
  id: string;
  name: string;
  type: string;
  status: string;
  last_sync: string;
  records_count: number;
  file_data?: any[];
  connection_config?: any;
  health_status?: 'healthy' | 'warning' | 'critical' | 'idle';
  linked_pipelines?: number;
  recent_records_processed?: number;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  last_run_status?: string | null;
  last_error_message?: string | null;
  attention_message?: string | null;
  recent_event_count?: number;
  schema_drift_status?: 'stable' | 'drift' | 'unknown';
  missing_fields?: string[];
  new_fields?: string[];
  schema_field_count?: number;
  reliability_score?: number;
  auth_health?: 'configured' | 'missing' | 'not_required';
  avg_duration_seconds?: number;
  failure_trend?: 'improving' | 'stable' | 'degrading' | 'unknown';
  ai_health_summary?: string;
}

interface SourcePipeline {
  id: string;
  source_id: string | null;
  status: string;
}

interface SourcePipelineRun {
  id: string;
  pipeline_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_processed: number | null;
  records_success: number | null;
  records_failed: number | null;
  error_message: string | null;
  duration_seconds: number | null;
}

interface SourceIngestionEvent {
  id: string;
  source_id: string | null;
  pipeline_id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  created_at: string;
  details?: Record<string, unknown> | null;
}

interface SourceDetailRun {
  id: string;
  pipeline_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_processed: number | null;
  records_success: number | null;
  records_failed: number | null;
  duration_seconds: number | null;
  error_message: string | null;
}

type TabType = 'file' | 'api';
type AuthType = 'none' | 'api_key' | 'bearer' | 'basic';

export default function DataIntegrationPage() {
  const { user, organizationId } = useAuth();
  const location = useLocation();
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('file');
  
  // File upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  // API connection states
  const [apiSourceName, setApiSourceName] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [httpMethod, setHttpMethod] = useState<'GET' | 'POST'>('GET');
  const [authType, setAuthType] = useState<AuthType>('none');
  const [authKeyName, setAuthKeyName] = useState('');
  const [authKeyValue, setAuthKeyValue] = useState('');
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [jsonPath, setJsonPath] = useState('');
  const [testResponse, setTestResponse] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingApi, setIsSavingApi] = useState(false);
  
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncTargetId, setSyncTargetId] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [sourceDetailRuns, setSourceDetailRuns] = useState<SourceDetailRun[]>([]);
  const [sourceDetailEvents, setSourceDetailEvents] = useState<SourceIngestionEvent[]>([]);
  const [sourceDetailPipelines, setSourceDetailPipelines] = useState<SourcePipeline[]>([]);
  const [loadingSourceDetail, setLoadingSourceDetail] = useState(false);

  const healthSummary = dataSources.reduce(
    (summary, source) => {
      summary.total += 1;
      summary.records += source.records_count || 0;
      summary.events += source.recent_event_count || 0;

      if (source.health_status === 'healthy') summary.healthy += 1;
      if (source.health_status === 'warning') summary.warning += 1;
      if (source.health_status === 'critical') summary.critical += 1;
      if (source.health_status === 'idle') summary.idle += 1;
      if (source.schema_drift_status === 'drift') summary.drift += 1;

      if (source.last_success_at) summary.recentSuccesses += 1;
      if (source.last_failure_at) summary.recentFailures += 1;
      summary.reliability += source.reliability_score || 0;
      return summary;
    },
    {
      total: 0,
      healthy: 0,
      warning: 0,
      critical: 0,
      idle: 0,
      drift: 0,
      recentSuccesses: 0,
      recentFailures: 0,
      records: 0,
      events: 0,
      reliability: 0,
    }
  );

  useEffect(() => {
    if (organizationId) {
      fetchDataSources();
    } else {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const sourceId = new URLSearchParams(location.search).get('source');
    if (!sourceId || dataSources.length === 0 || selectedSource?.id === sourceId) return;

    const focusedSource = dataSources.find((source) => source.id === sourceId);
    if (focusedSource) {
      loadSourceDetail(focusedSource);
    }
  }, [location.search, dataSources, selectedSource]);

  const fetchDataSources = async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      const [{ data: sourcesData, error: sourcesError }, { data: pipelineData, error: pipelineError }] = await Promise.all([
        supabase
          .from('data_sources')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
        supabase
          .from('etl_pipelines')
          .select('id, source_id, status')
          .eq('organization_id', organizationId),
      ]);

      if (sourcesError || pipelineError) {
        console.error('Error fetching data sources:', sourcesError || pipelineError);
        setErrorMessage('Failed to load data sources');
        return;
      }

      const sources = (sourcesData || []) as DataSource[];
      const pipelines = (pipelineData || []) as SourcePipeline[];
      const pipelineIds = pipelines.map((pipeline) => pipeline.id);

      let runs: SourcePipelineRun[] = [];
      let events: SourceIngestionEvent[] = [];

      if (pipelineIds.length > 0) {
        const since = new Date();
        since.setDate(since.getDate() - 7);

        const [{ data: runData, error: runError }, { data: eventData, error: eventError }] = await Promise.all([
          supabase
            .from('etl_pipeline_runs')
            .select('id, pipeline_id, status, started_at, completed_at, records_processed, records_success, records_failed, error_message, duration_seconds')
            .in('pipeline_id', pipelineIds)
            .order('started_at', { ascending: false })
            .limit(300),
          supabase
            .from('etl_ingestion_events')
            .select('id, source_id, pipeline_id, level, message, created_at')
            .eq('organization_id', organizationId)
            .gte('created_at', since.toISOString())
            .order('created_at', { ascending: false })
            .limit(300),
        ]);

        if (runError) {
          console.error('Error fetching pipeline runs:', runError);
        } else {
          runs = (runData || []) as SourcePipelineRun[];
        }

        if (eventError) {
          console.warn('Integration Health Center event feed unavailable:', eventError.message);
        } else {
          events = (eventData || []) as SourceIngestionEvent[];
        }
      }

      const pipelinesBySource = new Map<string, SourcePipeline[]>();
      pipelines.forEach((pipeline) => {
        if (!pipeline.source_id) return;
        const sourcePipelines = pipelinesBySource.get(pipeline.source_id) || [];
        sourcePipelines.push(pipeline);
        pipelinesBySource.set(pipeline.source_id, sourcePipelines);
      });

      const runsByPipeline = new Map<string, SourcePipelineRun[]>();
      runs.forEach((run) => {
        const pipelineRuns = runsByPipeline.get(run.pipeline_id) || [];
        pipelineRuns.push(run);
        runsByPipeline.set(run.pipeline_id, pipelineRuns);
      });

      const eventsBySource = new Map<string, SourceIngestionEvent[]>();
      events.forEach((event) => {
        if (!event.source_id) return;
        const sourceEvents = eventsBySource.get(event.source_id) || [];
        sourceEvents.push(event);
        eventsBySource.set(event.source_id, sourceEvents);
      });

      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const enrichedSources = sources.map((source) => {
        const expectedFields = getExpectedSchemaFields(source);
        const currentFields = getCurrentSchemaFields(source);
        const missingFields = expectedFields.filter((field) => !currentFields.includes(field));
        const newFields = currentFields.filter((field) => !expectedFields.includes(field));
        const hasSchemaDrift = expectedFields.length > 0 && (missingFields.length > 0 || newFields.length > 0);

        const linkedPipelines = pipelinesBySource.get(source.id) || [];
        const linkedRuns = linkedPipelines.flatMap((pipeline) => runsByPipeline.get(pipeline.id) || []);
        const linkedEvents = eventsBySource.get(source.id) || [];

        const latestRun = linkedRuns[0];
        const lastSuccess = linkedRuns.find((run) => run.status === 'completed' || run.status === 'partial');
        const lastFailure = linkedRuns.find((run) => run.status === 'failed');
        const recentRecordsProcessed = linkedRuns
          .filter((run) => new Date(run.started_at).getTime() >= last24Hours.getTime())
          .reduce((sum, run) => sum + (run.records_success || run.records_processed || 0), 0);
        const recentWindowRuns = linkedRuns.slice(0, 6);
        const successfulWindowRuns = recentWindowRuns.filter((run) => run.status === 'completed' || run.status === 'partial');
        const failedWindowRuns = recentWindowRuns.filter((run) => run.status === 'failed');
        const reliabilityBase = recentWindowRuns.length > 0
          ? Math.round((successfulWindowRuns.length / recentWindowRuns.length) * 100)
          : linkedPipelines.length > 0 ? 65 : 0;
        const durationValues = recentWindowRuns
          .map((run) => run.duration_seconds || 0)
          .filter((value) => value > 0);
        const avgDurationSeconds = durationValues.length > 0
          ? Math.round(durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length)
          : 0;
        const newerFailures = recentWindowRuns.slice(0, 3).filter((run) => run.status === 'failed').length;
        const olderFailures = recentWindowRuns.slice(3, 6).filter((run) => run.status === 'failed').length;
        const failureTrend: DataSource['failure_trend'] = recentWindowRuns.length < 4
          ? 'unknown'
          : newerFailures > olderFailures
            ? 'degrading'
            : newerFailures < olderFailures
              ? 'improving'
              : 'stable';
        const authHealth: DataSource['auth_health'] = source.type === 'api'
          ? source.connection_config?.auth_type && source.connection_config.auth_type !== 'none'
            ? source.connection_config.auth_key_value
              ? 'configured'
              : 'missing'
            : 'not_required'
          : 'not_required';

        let healthStatus: DataSource['health_status'] = 'idle';
        let attentionMessage = 'Waiting for the first successful sync.';

        if (linkedPipelines.length === 0) {
          healthStatus = 'idle';
          attentionMessage = 'No ETL pipeline is attached to this source yet.';
        } else if (hasSchemaDrift) {
          healthStatus = 'warning';
          attentionMessage = `Schema changed since the source was configured. ${missingFields.length} missing, ${newFields.length} new fields detected.`;
        } else if (latestRun?.status === 'failed') {
          healthStatus = 'critical';
          attentionMessage = latestRun.error_message || 'Latest ETL run failed. Review the run history.';
        } else if (linkedEvents.some((event) => event.level === 'error')) {
          healthStatus = 'critical';
          attentionMessage = linkedEvents.find((event) => event.level === 'error')?.message || 'Recent ingestion errors need attention.';
        } else if (latestRun?.status === 'partial' || linkedEvents.some((event) => event.level === 'warning')) {
          healthStatus = 'warning';
          attentionMessage = linkedEvents.find((event) => event.level === 'warning')?.message || 'Recent runs completed with warnings.';
        } else if (latestRun?.status === 'completed' || source.status === 'active') {
          healthStatus = 'healthy';
          attentionMessage = 'Source is connected and recent runs are landing successfully.';
        }

        const reliabilityPenalty =
          (hasSchemaDrift ? 15 : 0) +
          (authHealth === 'missing' ? 25 : 0) +
          (failedWindowRuns.length > 0 ? Math.min(25, failedWindowRuns.length * 8) : 0) +
          (linkedEvents.some((event) => event.level === 'warning') ? 5 : 0);
        const reliabilityScore = Math.max(0, Math.min(100, reliabilityBase - reliabilityPenalty));

        let aiHealthSummary = 'No active operational insight yet.';
        if (healthStatus === 'critical') {
          aiHealthSummary = `${source.name} is at risk of interrupting downstream analytics. Focus on the latest failure and connector settings before the next scheduled run.`;
        } else if (hasSchemaDrift) {
          aiHealthSummary = `${source.name} is online, but its structure changed. Review missing and new fields before trusting mapped outputs.`;
        } else if (healthStatus === 'warning') {
          aiHealthSummary = `${source.name} is still flowing, but recent warnings or partial loads are lowering confidence. Monitor the next run closely.`;
        } else if (healthStatus === 'healthy') {
          aiHealthSummary = `${source.name} looks operationally healthy with a ${reliabilityScore}% reliability score and recent successful sync activity.`;
        } else if (linkedPipelines.length === 0) {
          aiHealthSummary = `${source.name} is connected, but it is not yet contributing to a live pipeline. Attach it to ETL to make it operational.`;
        }

        return {
          ...source,
          health_status: healthStatus,
          linked_pipelines: linkedPipelines.length,
          recent_records_processed: recentRecordsProcessed,
          last_success_at: lastSuccess?.completed_at || lastSuccess?.started_at || source.last_sync || null,
          last_failure_at: lastFailure?.completed_at || lastFailure?.started_at || null,
          last_run_status: latestRun?.status || null,
          last_error_message: latestRun?.status === 'failed' ? latestRun.error_message : null,
          attention_message: attentionMessage,
          recent_event_count: linkedEvents.length,
          schema_drift_status: hasSchemaDrift ? 'drift' : expectedFields.length > 0 ? 'stable' : 'unknown',
          missing_fields: missingFields,
          new_fields: newFields,
          schema_field_count: currentFields.length,
          reliability_score: reliabilityScore,
          auth_health: authHealth,
          avg_duration_seconds: avgDurationSeconds,
          failure_trend: failureTrend,
          ai_health_summary: aiHealthSummary,
        } as DataSource;
      });

      setDataSources(enrichedSources);
    } catch (error) {
      console.error('Error fetching data sources:', error);
      setErrorMessage('Failed to load data sources');
    } finally {
      setLoading(false);
    }
  };

  const getExpectedSchemaFields = (source: DataSource) => {
    const columns = source.connection_config?.columns;
    if (Array.isArray(columns)) {
      return columns
        .map((field) => String(field).trim())
        .filter(Boolean);
    }
    return [];
  };

  const getCurrentSchemaFields = (source: DataSource) => {
    if (Array.isArray(source.file_data) && source.file_data.length > 0) {
      return Object.keys(source.file_data[0] || {}).filter(Boolean);
    }

    const previewColumns = source.connection_config?.current_columns;
    if (Array.isArray(previewColumns)) {
      return previewColumns
        .map((field) => String(field).trim())
        .filter(Boolean);
    }

    return [];
  };

  const getHealthBadgeClasses = (healthStatus?: DataSource['health_status']) => {
    switch (healthStatus) {
      case 'healthy':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'warning':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'critical':
        return 'bg-red-50 text-red-700 border border-red-200';
      default:
        return 'bg-slate-100 text-slate-600 border border-slate-200';
    }
  };

  const getReliabilityTone = (score?: number) => {
    if ((score || 0) >= 85) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if ((score || 0) >= 65) return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-rose-50 text-rose-700 border border-rose-200';
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'Never';
    return new Date(value).toLocaleString();
  };

  const formatRelativeSyncWindow = (value?: string | null) => {
    if (!value) return 'No recent sync';
    const deltaMs = Date.now() - new Date(value).getTime();
    const minutes = Math.max(1, Math.round(deltaMs / (1000 * 60)));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  };

  const averageReliability = healthSummary.total > 0
    ? Math.round(healthSummary.reliability / healthSummary.total)
    : 0;

  const loadSourceDetail = async (source: DataSource) => {
    setSelectedSource(source);
    setLoadingSourceDetail(true);

    try {
      const { data: pipelinesData, error: pipelinesError } = await supabase
        .from('etl_pipelines')
        .select('id, source_id, status')
        .eq('organization_id', organizationId)
        .eq('source_id', source.id);

      if (pipelinesError) throw pipelinesError;

      const livePipelines = (pipelinesData || []) as SourcePipeline[];
      setSourceDetailPipelines(livePipelines);

      const pipelineIds = livePipelines.map((pipeline) => pipeline.id);

      if (pipelineIds.length === 0) {
        setSourceDetailRuns([]);
        setSourceDetailEvents([]);
        return;
      }

      const [{ data: runsData, error: runsError }, { data: eventsData, error: eventsError }] = await Promise.all([
        supabase
          .from('etl_pipeline_runs')
          .select('id, pipeline_id, status, started_at, completed_at, records_processed, records_success, records_failed, duration_seconds, error_message')
          .in('pipeline_id', pipelineIds)
          .order('started_at', { ascending: false })
          .limit(12),
        supabase
          .from('etl_ingestion_events')
          .select('id, source_id, pipeline_id, level, message, created_at, details')
          .eq('organization_id', organizationId)
          .eq('source_id', source.id)
          .order('created_at', { ascending: false })
          .limit(15),
      ]);

      if (runsError) throw runsError;
      if (eventsError) throw eventsError;

      setSourceDetailRuns((runsData || []) as SourceDetailRun[]);
      setSourceDetailEvents((eventsData || []) as SourceIngestionEvent[]);
    } catch (error) {
      console.error('Error loading source detail:', error);
      setErrorMessage('Failed to load source details');
      setSourceDetailRuns([]);
      setSourceDetailEvents([]);
      setSourceDetailPipelines([]);
    } finally {
      setLoadingSourceDetail(false);
    }
  };

  const closeSourceDetail = () => {
    setSelectedSource(null);
    setSourceDetailRuns([]);
    setSourceDetailEvents([]);
    setSourceDetailPipelines([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['.csv', '.xlsx', '.xls'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!validTypes.includes(fileExtension)) {
        setErrorMessage('Invalid file type. Please upload CSV or Excel files only.');
        setSelectedFile(null);
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        setErrorMessage('File is too large. Maximum size is 50MB.');
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      setErrorMessage('');
      setSuccessMessage('');
    }
  };

  const parseCSVFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            resolve(results.data);
          } else {
            reject(new Error('No data found in CSV file'));
          }
        },
        error: (error) => reject(error)
      });
    });
  };

  const parseExcelFile = async (file: File): Promise<any[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet);
    
    if (!data || data.length === 0) {
      throw new Error('No data found in Excel file');
    }
    
    return data;
  };

  const handleFileUpload = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!user) {
      setErrorMessage('You must be logged in to upload files');
      return;
    }

    if (!organizationId) {
      setErrorMessage('No organization found. Please complete onboarding first.');
      return;
    }

    if (!selectedFile) {
      setErrorMessage('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);

    try {
      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
      let parsedData: any[] = [];

      setUploadProgress(15);
      
      if (fileExtension === 'csv') {
        parsedData = await parseCSVFile(selectedFile);
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        parsedData = await parseExcelFile(selectedFile);
      } else {
        throw new Error('Unsupported file format');
      }

      if (!parsedData || parsedData.length === 0) {
        throw new Error('No data found in the file');
      }

      console.log(`✅ Parsed ${parsedData.length} records from file`);
      setUploadProgress(35);

      const { data: sourceData, error: sourceError } = await supabase
        .from('data_sources')
        .insert({
          name: selectedFile.name,
          type: fileExtension || 'unknown',
          status: 'active',
          organization_id: organizationId,
          records_count: parsedData.length,
          file_data: parsedData,
          connection_config: {
            upload_date: new Date().toISOString(),
            file_size: selectedFile.size,
            columns: Object.keys(parsedData[0] || {}),
            current_columns: Object.keys(parsedData[0] || {}),
          },
          last_sync: new Date().toISOString(),
          created_by: user.id
        })
        .select()
        .single();

      if (sourceError) {
        console.error('Database error:', sourceError);
        const errorMsg = sourceError.message || 'Unknown database error';
        throw new Error(`Failed to save data: ${errorMsg}`);
      }

      console.log('✅ Data source saved to database');
      setUploadProgress(60);

      const columns = Object.keys(parsedData[0] || {}).map(c => c.toLowerCase());
      const hasMetricColumns = columns.some(c => 
        c.includes('metric') || c.includes('name') || c.includes('value') || c.includes('target')
      );

      let importedMetricsCount = 0;

      if (hasMetricColumns) {
        console.log('🎯 Detected metric-like data, auto-importing as metrics...');
        
        const metricsToImport = parsedData.map(row => {
          const rowKeys = Object.keys(row);
          const rowKeysLower = rowKeys.map(k => k.toLowerCase());
          
          const nameKey = rowKeys.find((k, i) => {
            const lower = rowKeysLower[i];
            return lower === 'name' || lower === 'metric_name' || lower === 'metric' || 
                   lower === 'metricname' || lower.includes('metric') && lower.includes('name');
          }) || rowKeys[0];
          
          const currentValueKey = rowKeys.find((k, i) => {
            const lower = rowKeysLower[i];
            return lower === 'current_value' || lower === 'value' || lower === 'current' || 
                   lower === 'currentvalue' || lower.includes('current');
          });
          
          const targetValueKey = rowKeys.find((k, i) => {
            const lower = rowKeysLower[i];
            return lower === 'target_value' || lower === 'target' || lower === 'targetvalue' ||
                   lower.includes('target');
          });
          
          const unitKey = rowKeys.find((k, i) => {
            const lower = rowKeysLower[i];
            return lower === 'unit' || lower === 'units' || lower === 'uom';
          });
          
          const descKey = rowKeys.find((k, i) => {
            const lower = rowKeysLower[i];
            return lower === 'description' || lower === 'desc' || lower.includes('description');
          });

          const name = row[nameKey] ? String(row[nameKey]).trim() : '';
          const currentValue = currentValueKey ? (parseFloat(row[currentValueKey]) || 0) : 0;
          const targetValue = targetValueKey ? (parseFloat(row[targetValueKey]) || 0) : 0;
          const unit = unitKey ? String(row[unitKey]).trim() : '';
          const description = descKey ? String(row[descKey]).trim() : '';

          return {
            name,
            description,
            unit,
            target_value: targetValue,
            current_value: currentValue,
            organization_id: organizationId,
            data_source_id: sourceData.id
          };
        }).filter(m => m.name && m.name.length > 0);

        if (metricsToImport.length > 0) {
          setUploadProgress(70);
          
          const { data: importedMetrics, error: metricsError } = await supabase
            .from('metrics')
            .insert(metricsToImport)
            .select();

          if (metricsError) {
            console.warn('⚠️ Could not auto-import as metrics:', metricsError);
          } else if (importedMetrics && importedMetrics.length > 0) {
            importedMetricsCount = importedMetrics.length;
            console.log(`✅ Auto-imported ${importedMetricsCount} metrics`);
            
            setUploadProgress(85);
            
            const dataPoints = importedMetrics
              .filter(metric => typeof metric.current_value === 'number' && !Number.isNaN(metric.current_value))
              .map(metric => ({
                metric_id: metric.id,
                value: metric.current_value,
                timestamp: new Date().toISOString()
              }));

            if (dataPoints.length > 0) {
              const { error: dataPointsError } = await supabase
                .from('metric_data')
                .insert(dataPoints);
              
              if (dataPointsError) {
                console.warn('⚠️ Could not create initial metric data points:', dataPointsError);
              } else {
                console.log(`✅ Created ${dataPoints.length} initial metric data points for ${importedMetrics.length} metrics`);
                
                const { data: verifyData, error: verifyError } = await supabase
                  .from('metric_data')
                  .select('id')
                  .in('metric_id', importedMetrics.map(m => m.id));
                
                if (!verifyError && verifyData) {
                  console.log(`✅ Verified: ${verifyData.length} data points successfully stored in database`);
                }
              }
            }
          }
        }
      }

      console.log('📁 Storing file in uploaded_files table for analysis access...');
      
      const { data: uploadedFileData, error: uploadedFileError } = await supabase
        .from('uploaded_files')
        .insert({
          organization_id: organizationId,
          file_name: selectedFile.name,
          file_type: fileExtension || 'unknown',
          file_size: selectedFile.size,
          uploaded_by: user.id,
          storage_path: `${organizationId}/${selectedFile.name}`,
          data_preview: parsedData.slice(0, 10),
          column_names: Object.keys(parsedData[0] || {}),
          row_count: parsedData.length,
          status: 'processed'
        })
        .select()
        .single();

      if (uploadedFileError) {
        console.warn('⚠️ Could not store in uploaded_files table:', uploadedFileError);
      } else {
        console.log('✅ File stored in uploaded_files table for analysis access');
      }

      try {
        const fileBlob = new Blob([JSON.stringify(parsedData)], { type: 'application/json' });
        const storagePath = `${organizationId}/${Date.now()}-${selectedFile.name}.json`;
        
        const { error: storageError } = await supabase.storage
          .from('data-files')
          .upload(storagePath, fileBlob);

        if (storageError) {
          console.warn('⚠️ Could not store file in storage:', storageError);
        } else {
          console.log('✅ File stored in storage for quality analysis');
          
          if (uploadedFileData) {
            await supabase
              .from('uploaded_files')
              .update({ storage_path: storagePath })
              .eq('id', uploadedFileData.id);
          }
        }
      } catch (storageError) {
        console.warn('⚠️ Storage upload failed:', storageError);
      }

      setUploadProgress(100);

      const successMsg = importedMetricsCount > 0 
        ? `Successfully uploaded ${parsedData.length.toLocaleString()} records! ${importedMetricsCount} metrics have been automatically imported using the actual values in your file.`
        : `Successfully uploaded ${parsedData.length.toLocaleString()} records from ${selectedFile.name}. Data is now available across all analysis features.`;
      
      setSuccessMessage(successMsg);
      
      setTimeout(() => {
        setShowAddModal(false);
        setSelectedFile(null);
        setUploadProgress(0);
        setSuccessMessage('');
        fetchDataSources();
      }, 3000);

    } catch (error: any) {
      console.error('Upload error:', error);
      setErrorMessage(error.message || 'Failed to upload file. Please try again.');
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  // API Connection Functions
  const addCustomHeader = () => {
    setCustomHeaders([...customHeaders, { key: '', value: '' }]);
  };

  const removeCustomHeader = (index: number) => {
    setCustomHeaders(customHeaders.filter((_, i) => i !== index));
  };

  const updateCustomHeader = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...customHeaders];
    updated[index][field] = value;
    setCustomHeaders(updated);
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

  const testApiConnection = async () => {
    setErrorMessage('');
    setTestResponse(null);
    
    if (!apiBaseUrl.trim()) {
      setErrorMessage('Please enter a Base URL');
      return;
    }

    setIsTesting(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (authType === 'api_key' && authKeyName && authKeyValue) {
        headers[authKeyName] = authKeyValue;
      } else if (authType === 'bearer' && authKeyValue) {
        headers['Authorization'] = `Bearer ${authKeyValue}`;
      } else if (authType === 'basic' && authKeyName && authKeyValue) {
        const encoded = btoa(`${authKeyName}:${authKeyValue}`);
        headers['Authorization'] = `Basic ${encoded}`;
      }

      customHeaders.forEach(header => {
        if (header.key && header.value) {
          headers[header.key] = header.value;
        }
      });

      const response = await fetch(apiBaseUrl, {
        method: httpMethod,
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const extractedData = extractDataFromJsonPath(data, jsonPath);
      
      setTestResponse({
        success: true,
        preview: extractedData.slice(0, 5),
        totalRecords: extractedData.length,
        rawResponse: data
      });

      setSuccessMessage(`Connection successful! Found ${extractedData.length} records.`);
      setTimeout(() => setSuccessMessage(''), 3000);

    } catch (error: any) {
      console.error('API test error:', error);
      setErrorMessage(error.message || 'Failed to connect to API');
      setTestResponse({
        success: false,
        error: error.message
      });
    } finally {
      setIsTesting(false);
    }
  };

  const saveApiSource = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!user || !organizationId) {
      setErrorMessage('Authentication required');
      return;
    }

    if (!apiSourceName.trim()) {
      setErrorMessage('Please enter a source name');
      return;
    }

    if (!apiBaseUrl.trim()) {
      setErrorMessage('Please enter a Base URL');
      return;
    }

    if (!testResponse || !testResponse.success) {
      setErrorMessage('Please test the connection first');
      return;
    }

    setIsSavingApi(true);

    try {
      const previewFields = Array.isArray(testResponse.preview) && testResponse.preview.length > 0
        ? Object.keys(testResponse.preview[0] || {})
        : [];

      const connectionConfig = {
        base_url: apiBaseUrl,
        http_method: httpMethod,
        auth_type: authType,
        auth_key_name: authKeyName,
        auth_key_value: authKeyValue,
        custom_headers: customHeaders.filter(h => h.key && h.value),
        json_path: jsonPath,
        created_date: new Date().toISOString(),
        columns: previewFields,
        current_columns: previewFields,
      };

      const { data: sourceData, error: sourceError } = await supabase
        .from('data_sources')
        .insert({
          name: apiSourceName,
          type: 'api',
          status: 'active',
          organization_id: organizationId,
          records_count: testResponse.totalRecords || 0,
          connection_config: connectionConfig,
          last_sync: new Date().toISOString(),
          created_by: user.id
        })
        .select()
        .single();

      if (sourceError) {
        throw new Error(sourceError.message);
      }

      setSuccessMessage('API source saved successfully!');
      
      setTimeout(() => {
        resetApiForm();
        setShowAddModal(false);
        fetchDataSources();
      }, 2000);

    } catch (error: any) {
      console.error('Save API source error:', error);
      setErrorMessage(error.message || 'Failed to save API source');
    } finally {
      setIsSavingApi(false);
    }
  };

  const resetApiForm = () => {
    setApiSourceName('');
    setApiBaseUrl('');
    setHttpMethod('GET');
    setAuthType('none');
    setAuthKeyName('');
    setAuthKeyValue('');
    setCustomHeaders([]);
    setJsonPath('');
    setTestResponse(null);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const syncApiSource = async (source: DataSource) => {
    if (!source.connection_config) return;

    setSyncingIds(prev => new Set(prev).add(source.id));

    try {
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

      const { error: updateError } = await supabase
        .from('data_sources')
        .update({
          last_sync: new Date().toISOString(),
          records_count: extractedData.length,
          file_data: extractedData,
          status: 'active',
          connection_config: {
            ...(source.connection_config || {}),
            current_columns: Object.keys(extractedData[0] || {}),
            last_schema_check: new Date().toISOString(),
          }
        })
        .eq('id', source.id);

      if (updateError) throw updateError;

      setSuccessMessage(`Synced ${extractedData.length} records from ${source.name}`);
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchDataSources();

    } catch (error: any) {
      console.error('Sync error:', error);
      setErrorMessage(`Failed to sync ${source.name}: ${error.message}`);
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setSyncingIds(prev => {
        const updated = new Set(prev);
        updated.delete(source.id);
        return updated;
      });
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;

    try {
      const { error } = await supabase
        .from('data_sources')
        .delete()
        .eq('id', deleteTargetId);

      if (error) throw error;

      setDataSources(dataSources.filter(ds => ds.id !== deleteTargetId));
      setSuccessMessage('Data source deleted successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Error deleting data source:', error);
      setErrorMessage('Failed to delete data source');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  };

  const handleSync = async (id: string) => {
    const source = dataSources.find(ds => ds.id === id);
    if (!source) return;

    if (source.type === 'api') {
      syncApiSource(source);
    } else {
      setSyncTargetId(id);
      setSyncConfirmOpen(true);
    }
  };

  const handleSyncConfirm = async () => {
    if (!syncTargetId) return;

    try {
      const { error } = await supabase
        .from('data_sources')
        .update({ 
          last_sync: new Date().toISOString(),
          status: 'active'
        })
        .eq('id', syncTargetId);

      if (error) throw error;

      setSuccessMessage('Data source synced successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchDataSources();
    } catch (error: any) {
      console.error('Error syncing data source:', error);
      setErrorMessage('Failed to sync data source');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setSyncConfirmOpen(false);
      setSyncTargetId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <i className="ri-alert-line text-4xl text-yellow-600 mb-3"></i>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Organization Required</h3>
          <p className="text-gray-600 mb-4">
            You need to complete onboarding and join an organization before uploading data.
          </p>
          <a
            href="/onboarding"
            className="inline-block px-6 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors whitespace-nowrap cursor-pointer"
          >
            Complete Onboarding
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/55 p-6">
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Data Source?"
        message="Are you sure you want to delete this data source? This will also delete any associated metrics."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteTargetId(null);
        }}
      />

      <ConfirmDialog
        isOpen={syncConfirmOpen}
        title="Sync Data Source?"
        message="This will update the last sync timestamp and mark the data source as active."
        confirmText="Sync"
        cancelText="Cancel"
        confirmVariant="primary"
        onConfirm={handleSyncConfirm}
        onCancel={() => {
          setSyncConfirmOpen(false);
          setSyncTargetId(null);
        }}
      />

      {/* Header */}
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-50/60 p-7 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)]">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700">
                <span className="h-2 w-2 rounded-full bg-cyan-500"></span>
                Data Integration Control
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Data Integration</h1>
              <p className="max-w-2xl text-slate-600">
                Connect, monitor, and operationalize source systems with clear health signals, schema awareness, and ETL-ready handoff into the rest of SigmaSense.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Connected Sources</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{healthSummary.total}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Average Reliability</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{averageReliability}%</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Events Last 7 Days</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{healthSummary.events}</div>
                </div>
              </div>
            </div>
          <button
            onClick={() => {
              setShowAddModal(true);
              setActiveTab('file');
              resetApiForm();
            }}
            className="whitespace-nowrap rounded-xl bg-slate-900 px-6 py-3 font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 cursor-pointer flex items-center gap-2"
          >
            <i className="ri-add-line text-xl"></i>
            Add Data Source
          </button>
        </div>

        <div className="mb-6 rounded-[24px] border border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-cyan-50 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
                <i className="ri-bar-chart-grouped-line text-2xl text-white"></i>
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Auto-Aggregate KPIs From Raw Data</h3>
                <p className="text-sm text-slate-600">Turn uploaded operational data into KPI time-series with mapping and ETL-ready structure already in place.</p>
              </div>
            </div>
            <a
              href="/dashboard/kpi-aggregation"
              className="whitespace-nowrap rounded-xl bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 flex items-center gap-2"
            >
              Get Started
              <i className="ri-arrow-right-line"></i>
            </a>
          </div>
        </div>
      </div>

      {/* Global Messages */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <i className="ri-checkbox-circle-line text-green-600 text-xl mr-3"></i>
            <p className="text-sm text-green-800">{successMessage}</p>
          </div>
        </div>
      )}

      {errorMessage && !showAddModal && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <i className="ri-error-warning-line text-red-600 text-xl mr-3"></i>
            <p className="text-sm text-red-800">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Integration Health Center */}
      {dataSources.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Integration Health Center</h2>
              <p className="text-sm text-slate-600 mt-1">Live operational status across connectors, ETL runs, and ingestion events.</p>
            </div>
            <div className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{healthSummary.events}</span> logged events in the last 7 days
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">Healthy Sources</span>
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <i className="ri-heart-pulse-line text-emerald-600 text-xl"></i>
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">{healthSummary.healthy}</div>
              <p className="text-xs text-slate-500 mt-1">{healthSummary.total} connected sources monitored</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">Needs Attention</span>
                <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                  <i className="ri-error-warning-line text-amber-600 text-xl"></i>
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">{healthSummary.warning + healthSummary.critical}</div>
              <p className="text-xs text-slate-500 mt-1">{healthSummary.critical} critical, {healthSummary.warning} warning</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">Recent Sync Wins</span>
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <i className="ri-check-double-line text-blue-600 text-xl"></i>
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">{healthSummary.recentSuccesses}</div>
              <p className="text-xs text-slate-500 mt-1">{healthSummary.recentFailures} sources have recent failed runs</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">Records Observed</span>
                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                  <i className="ri-database-2-line text-purple-600 text-xl"></i>
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">{healthSummary.records.toLocaleString()}</div>
              <p className="text-xs text-slate-500 mt-1">Tracked across all integrated sources</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
            <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">AI Operations Summary</h3>
                  <p className="text-sm text-slate-600 mt-1">Plain-language assessment of connector health, auth posture, and reliability.</p>
                </div>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${getReliabilityTone(averageReliability)}`}>
                  {averageReliability}% avg reliability
                </div>
              </div>
              <div className="space-y-3">
                {dataSources.slice(0, 3).map((source) => (
                  <div key={`summary-${source.id}`} className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-sm font-semibold text-slate-900">{source.name}</p>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getReliabilityTone(source.reliability_score)}`}>
                        {source.reliability_score || 0}% reliable
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{source.ai_health_summary}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)]">
              <h3 className="text-sm font-semibold text-slate-900">Connector Signals</h3>
              <div className="space-y-3 mt-4">
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs text-slate-500">Auth issues</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {dataSources.filter((source) => source.auth_health === 'missing').length}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs text-slate-500">Degrading sources</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {dataSources.filter((source) => source.failure_trend === 'degrading').length}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs text-slate-500">Stable schemas</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {dataSources.filter((source) => source.schema_drift_status === 'stable').length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Schema Drift Watch</h3>
                <p className="text-sm text-slate-600 mt-1">Catch upstream field changes before they silently break mapping rules or ETL jobs.</p>
              </div>
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${healthSummary.drift > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                {healthSummary.drift > 0 ? `${healthSummary.drift} source${healthSummary.drift === 1 ? '' : 's'} changed` : 'All tracked schemas stable'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dataSources.map((source) => (
          <div key={source.id} className="group rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.42)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_28px_60px_-38px_rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <div className={`w-12 h-12 ${source.type === 'api' ? 'bg-purple-100' : 'bg-teal-100'} rounded-xl flex items-center justify-center`}>
                  <i className={`${source.type === 'api' ? 'ri-cloud-line' : 'ri-file-text-line'} text-2xl ${source.type === 'api' ? 'text-purple-600' : 'text-teal-600'}`}></i>
                </div>
                <div className="ml-3">
                  <h3 className="font-semibold text-gray-900 text-sm">{source.name}</h3>
                  <p className="text-xs text-gray-500">{source.type === 'api' ? 'API' : source.type.toUpperCase()}</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => loadSourceDetail(source)}
                  className="text-gray-400 hover:text-blue-600 cursor-pointer"
                  title="Open source detail"
                >
                  <i className="ri-layout-right-2-line"></i>
                </button>
                <button
                  onClick={() => handleSync(source.id)}
                  disabled={syncingIds.has(source.id)}
                  className="text-gray-400 hover:text-teal-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Sync data source"
                >
                  <i className={`ri-refresh-line ${syncingIds.has(source.id) ? 'animate-spin' : ''}`}></i>
                </button>
                <button
                  onClick={() => handleDelete(source.id)}
                  className="text-gray-400 hover:text-red-500 cursor-pointer"
                  title="Delete data source"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize ${getHealthBadgeClasses(source.health_status)}`}>
                {source.health_status || 'idle'}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {source.linked_pipelines || 0} linked pipeline{source.linked_pipelines === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Operational signal</p>
              <p className="text-sm text-slate-700">{source.attention_message}</p>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div>
                <p className="text-xs text-slate-500">Schema</p>
                <p className="text-sm font-semibold text-slate-900 capitalize">{source.schema_drift_status || 'unknown'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Tracked fields</p>
                <p className="text-sm font-semibold text-slate-900">{source.schema_field_count || getExpectedSchemaFields(source).length || 0}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg bg-slate-50 px-3 py-3">
                <p className="text-xs text-slate-500">Last run</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 capitalize">
                  {source.last_run_status || source.status}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-3">
                <p className="text-xs text-slate-500">Records (24h)</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {(source.recent_records_processed || 0).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-xs text-slate-500">Reliability</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {source.reliability_score || 0}%
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-xs text-slate-500">Auth</p>
                <p className={`mt-1 text-sm font-semibold capitalize ${source.auth_health === 'missing' ? 'text-red-600' : 'text-slate-900'}`}>
                  {source.auth_health === 'configured' ? 'configured' : source.auth_health === 'missing' ? 'missing' : 'not required'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-xs text-slate-500">Trend</p>
                <p className={`mt-1 text-sm font-semibold capitalize ${source.failure_trend === 'degrading' ? 'text-red-600' : source.failure_trend === 'improving' ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {source.failure_trend || 'unknown'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Source status:</span>
                <span className={`font-medium ${source.status === 'active' ? 'text-green-600' : 'text-gray-600'}`}>
                  {source.status}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Records:</span>
                <span className="font-medium text-gray-900">
                  {source.records_count ? source.records_count.toLocaleString() : '0'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Last success:</span>
                <span className="font-medium text-gray-900">
                  {formatRelativeSyncWindow(source.last_success_at)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Last failure:</span>
                <span className={`font-medium ${source.last_failure_at ? 'text-red-600' : 'text-slate-500'}`}>
                  {source.last_failure_at ? formatRelativeSyncWindow(source.last_failure_at) : 'None'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Recent events:</span>
                <span className="font-medium text-gray-900">
                  {(source.recent_event_count || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Avg latency:</span>
                <span className="font-medium text-gray-900">
                  {source.avg_duration_seconds ? `${source.avg_duration_seconds}s` : 'N/A'}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 space-y-1">
              <p className="text-xs text-slate-500">Last sync timestamp</p>
              <p className="text-sm text-slate-700">{formatDateTime(source.last_sync)}</p>
              <p className="text-xs text-slate-600 mt-2">{source.ai_health_summary}</p>
              {source.schema_drift_status === 'drift' && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-2">Schema drift detected</p>
                  {source.missing_fields && source.missing_fields.length > 0 && (
                    <p className="text-xs text-amber-700">Missing fields: {source.missing_fields.slice(0, 4).join(', ')}</p>
                  )}
                  {source.new_fields && source.new_fields.length > 0 && (
                    <p className="text-xs text-amber-700 mt-1">New fields: {source.new_fields.slice(0, 4).join(', ')}</p>
                  )}
                </div>
              )}
              {source.last_error_message && (
                <p className="text-xs text-red-600 mt-2">{source.last_error_message}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {dataSources.length === 0 && (
        <div className="text-center py-12">
          <i className="ri-database-2-line text-6xl text-gray-300 mb-4"></i>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No data sources yet</h3>
          <p className="text-gray-600 mb-4">Upload a file or connect to an API to get started</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors whitespace-nowrap cursor-pointer"
          >
            Add Data Source
          </button>
        </div>
      )}

      {selectedSource && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-2xl bg-white shadow-2xl border-l border-slate-200 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 flex items-start justify-between gap-4 z-10">
              <div>
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 ${selectedSource.type === 'api' ? 'bg-purple-100' : 'bg-teal-100'} rounded-xl flex items-center justify-center`}>
                    <i className={`${selectedSource.type === 'api' ? 'ri-cloud-line text-purple-600' : 'ri-file-text-line text-teal-600'} text-xl`}></i>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{selectedSource.name}</h2>
                    <p className="text-sm text-slate-600 capitalize">{selectedSource.type} connector detail</p>
                  </div>
                </div>
                <p className="text-sm text-slate-700 mt-3">{selectedSource.ai_health_summary}</p>
              </div>
              <button
                onClick={closeSourceDetail}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Reliability</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{selectedSource.reliability_score || 0}%</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Linked pipelines</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{sourceDetailPipelines.length}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Auth health</p>
                  <p className={`mt-1 text-sm font-semibold capitalize ${selectedSource.auth_health === 'missing' ? 'text-red-600' : 'text-slate-900'}`}>
                    {selectedSource.auth_health === 'configured' ? 'configured' : selectedSource.auth_health === 'missing' ? 'missing' : 'not required'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Avg latency</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{selectedSource.avg_duration_seconds ? `${selectedSource.avg_duration_seconds}s` : 'N/A'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleSync(selectedSource.id)}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  Sync Source
                </button>
                <a
                  href="/dashboard/data-mapping"
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Open Mapping
                </a>
                <a
                  href="/dashboard/etl-pipelines"
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Open ETL
                </a>
              </div>

              <div className="rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Schema History</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    selectedSource.schema_drift_status === 'drift'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {selectedSource.schema_drift_status || 'unknown'}
                  </span>
                </div>
                <p className="text-sm text-slate-600">Expected fields: {getExpectedSchemaFields(selectedSource).length || 0} · Current fields: {selectedSource.schema_field_count || 0}</p>
                {selectedSource.schema_drift_status === 'drift' ? (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-2">Missing fields</p>
                      <div className="flex flex-wrap gap-2">
                        {(selectedSource.missing_fields || []).map((field) => (
                          <span key={field} className="px-2.5 py-1 rounded-full bg-white border border-amber-200 text-xs text-amber-800">{field}</span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 mb-2">New fields</p>
                      <div className="flex flex-wrap gap-2">
                        {(selectedSource.new_fields || []).map((field) => (
                          <span key={field} className="px-2.5 py-1 rounded-full bg-white border border-blue-200 text-xs text-blue-800">{field}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-700 mt-4">No structural changes detected relative to the saved schema baseline.</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Runs</h3>
                {loadingSourceDetail ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                  </div>
                ) : sourceDetailRuns.length === 0 ? (
                  <p className="text-sm text-slate-500">No ETL runs recorded for this source yet.</p>
                ) : (
                  <div className="space-y-3">
                    {sourceDetailRuns.map((run) => (
                      <div key={run.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                              run.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : run.status === 'partial'
                                  ? 'bg-amber-100 text-amber-700'
                                  : run.status === 'failed'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-slate-100 text-slate-600'
                            }`}>
                              {run.status}
                            </span>
                            <span className="text-xs text-slate-500">{new Date(run.started_at).toLocaleString()}</span>
                          </div>
                          <span className="text-xs text-slate-500">{run.duration_seconds || 0}s</span>
                        </div>
                        <p className="text-sm text-slate-700 mt-2">
                          {run.records_success || 0} succeeded, {run.records_failed || 0} failed, {run.records_processed || 0} processed
                        </p>
                        {run.error_message && <p className="text-xs text-red-600 mt-2">{run.error_message}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Event Timeline</h3>
                {loadingSourceDetail ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                  </div>
                ) : sourceDetailEvents.length === 0 ? (
                  <p className="text-sm text-slate-500">No ingestion events captured for this source yet.</p>
                ) : (
                  <div className="space-y-3">
                    {sourceDetailEvents.map((event) => (
                      <div key={event.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                              event.level === 'error'
                                ? 'bg-red-100 text-red-700'
                                : event.level === 'warning'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}>
                              {event.level}
                            </span>
                            <span className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-700 mt-2">{event.message}</p>
                        {event.details && Object.keys(event.details).length > 0 && (
                          <pre className="mt-3 bg-slate-50 rounded-lg p-3 text-xs text-slate-600 overflow-x-auto">
                            {JSON.stringify(event.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Data Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-[0_40px_120px_-48px_rgba(15,23,42,0.65)]">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-6 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    New Connector
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Add Data Source</h2>
                  <p className="mt-1 text-sm text-slate-500">Bring in uploaded files or connect an API endpoint for downstream mapping and ETL.</p>
                </div>
              </div>
              
              {/* Tabs */}
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setActiveTab('file')}
                  className={`rounded-xl px-4 py-2.5 font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'file'
                      ? 'bg-teal-100 text-teal-700 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <i className="ri-file-upload-line mr-2"></i>
                  Upload File
                </button>
                <button
                  onClick={() => setActiveTab('api')}
                  className={`rounded-xl px-4 py-2.5 font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'api'
                      ? 'bg-purple-100 text-purple-700 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <i className="ri-cloud-line mr-2"></i>
                  Connect API
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* File Upload Tab */}
              {activeTab === 'file' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload File (CSV or Excel)
                    </label>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      disabled={isUploading}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {selectedFile && (
                      <p className="text-sm text-gray-600 mt-2">
                        <i className="ri-file-line mr-1"></i>
                        Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                      </p>
                    )}
                  </div>

                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="mb-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-teal-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 text-center">Uploading... {uploadProgress}%</p>
                    </div>
                  )}
                </>
              )}

              {/* API Connection Tab */}
              {activeTab === 'api' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Source Name *
                    </label>
                    <input
                      type="text"
                      value={apiSourceName}
                      onChange={(e) => setApiSourceName(e.target.value)}
                      placeholder="e.g., Sales API"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Base URL *
                    </label>
                    <input
                      type="url"
                      value={apiBaseUrl}
                      onChange={(e) => setApiBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/data"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        HTTP Method
                      </label>
                      <select
                        value={httpMethod}
                        onChange={(e) => setHttpMethod(e.target.value as 'GET' | 'POST')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent cursor-pointer"
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Authentication Type
                      </label>
                      <select
                        value={authType}
                        onChange={(e) => setAuthType(e.target.value as AuthType)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent cursor-pointer"
                      >
                        <option value="none">None</option>
                        <option value="api_key">API Key</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="basic">Basic Auth</option>
                      </select>
                    </div>
                  </div>

                  {authType !== 'none' && (
                    <div className="grid grid-cols-2 gap-4">
                      {authType === 'basic' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Username
                          </label>
                          <input
                            type="text"
                            value={authKeyName}
                            onChange={(e) => setAuthKeyName(e.target.value)}
                            placeholder="username"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                      )}
                      {authType === 'api_key' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Key Name
                          </label>
                          <input
                            type="text"
                            value={authKeyName}
                            onChange={(e) => setAuthKeyName(e.target.value)}
                            placeholder="e.g., X-API-Key"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {authType === 'basic' ? 'Password' : authType === 'bearer' ? 'Token' : 'Key Value'}
                        </label>
                        <input
                          type="password"
                          value={authKeyValue}
                          onChange={(e) => setAuthKeyValue(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Custom Headers (Optional)
                    </label>
                    {customHeaders.map((header, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={header.key}
                          onChange={(e) => updateCustomHeader(index, 'key', e.target.value)}
                          placeholder="Header name"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={header.value}
                          onChange={(e) => updateCustomHeader(index, 'value', e.target.value)}
                          placeholder="Header value"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => removeCustomHeader(index)}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addCustomHeader}
                      className="text-sm text-purple-600 hover:text-purple-700 font-medium cursor-pointer"
                    >
                      <i className="ri-add-line mr-1"></i>
                      Add Header
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      JSON Path (Optional)
                    </label>
                    <input
                      type="text"
                      value={jsonPath}
                      onChange={(e) => setJsonPath(e.target.value)}
                      placeholder="e.g., data.results"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Path to the data array in the response (leave empty if response is already an array)
                    </p>
                  </div>

                  <button
                    onClick={testApiConnection}
                    disabled={isTesting}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                  >
                    {isTesting ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Testing Connection...
                      </>
                    ) : (
                      <>
                        <i className="ri-test-tube-line mr-2"></i>
                        Test Connection
                      </>
                    )}
                  </button>

                  {testResponse && testResponse.success && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-semibold text-green-900 mb-2">
                        <i className="ri-checkbox-circle-line mr-2"></i>
                        Connection Successful
                      </h4>
                      <p className="text-sm text-green-800 mb-3">
                        Found {testResponse.totalRecords} records. Preview of first 5:
                      </p>
                      <div className="bg-white rounded border border-green-200 p-3 max-h-48 overflow-auto">
                        <pre className="text-xs text-gray-700">
                          {JSON.stringify(testResponse.preview, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {testResponse && !testResponse.success && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="font-semibold text-red-900 mb-2">
                        <i className="ri-error-warning-line mr-2"></i>
                        Connection Failed
                      </h4>
                      <p className="text-sm text-red-800">{testResponse.error}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Error/Success Messages */}
              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{errorMessage}</p>
                </div>
              )}

              {successMessage && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-600">{successMessage}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedFile(null);
                    setUploadProgress(0);
                    resetApiForm();
                  }}
                  disabled={isUploading || isSavingApi}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                
                {activeTab === 'file' ? (
                  <button
                    onClick={handleFileUpload}
                    disabled={!selectedFile || isUploading}
                    className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <i className="ri-upload-2-line mr-2"></i>
                        Upload
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={saveApiSource}
                    disabled={!testResponse || !testResponse.success || isSavingApi}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                  >
                    {isSavingApi ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line mr-2"></i>
                        Save API Source
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
