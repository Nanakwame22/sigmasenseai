import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';

type ActiveTab = 'sources' | 'mapping' | 'preview';

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

interface DataSourceRow {
  id: string;
  name: string;
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
  created_at?: string;
}

interface Pipeline {
  id: string;
  name: string;
  source_id: string | null;
  status: string;
  destination_type: string;
  transformation_rules?: {
    operations?: TransformationOperation[];
    field_mappings?: FieldMapping[];
  };
  updated_at?: string;
}

interface MetricOption {
  id: string;
  name: string;
  unit: string | null;
}

interface FieldInsight {
  field: string;
  sampleCount: number;
  numericRatio: number;
  mostlyNumeric: boolean;
  inferredType: 'number' | 'date' | 'text' | 'mixed' | 'empty';
}

const destinationLabels: Record<FieldMapping['destinationType'], string> = {
  metric_name: 'Metric Name',
  value: 'Value',
  timestamp: 'Timestamp',
  unit: 'Unit',
};

const operationTypeLabels: Record<TransformationOperation['condition'], string> = {
  equals: 'Equals',
  not_equals: 'Does not equal',
  contains: 'Contains',
  greater_than: 'Greater than',
  less_than: 'Less than',
};

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

function inferFieldInsights(previewData: Record<string, unknown>[], fields: string[]): FieldInsight[] {
  return fields.map((field) => {
    const values = previewData
      .map((row) => row?.[field])
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== '');

    if (values.length === 0) {
      return {
        field,
        sampleCount: 0,
        numericRatio: 0,
        mostlyNumeric: false,
        inferredType: 'empty',
      };
    }

    const numericValues = values.filter((value) => {
      if (typeof value === 'number') return !Number.isNaN(value);
      const normalized = String(value).replace(/,/g, '').trim();
      return normalized !== '' && !Number.isNaN(Number(normalized));
    });

    const dateValues = values.filter((value) => {
      const date = new Date(String(value));
      return !Number.isNaN(date.getTime());
    });

    const numericRatio = numericValues.length / values.length;
    const dateRatio = dateValues.length / values.length;

    let inferredType: FieldInsight['inferredType'] = 'mixed';
    if (numericRatio >= 0.8) inferredType = 'number';
    else if (dateRatio >= 0.8) inferredType = 'date';
    else if (numericRatio <= 0.2 && dateRatio <= 0.2) inferredType = 'text';

    return {
      field,
      sampleCount: values.length,
      numericRatio,
      mostlyNumeric: numericRatio >= 0.6,
      inferredType,
    };
  });
}

function getValueCandidateFields(fields: string[], insights: FieldInsight[]): string[] {
  return [...fields].sort((a, b) => {
    const insightA = insights.find((item) => item.field === a);
    const insightB = insights.find((item) => item.field === b);
    const scoreA = insightA?.numericRatio ?? 0;
    const scoreB = insightB?.numericRatio ?? 0;

    if (scoreA !== scoreB) return scoreB - scoreA;

    const nameBoostA = /(value|amount|score|count|rate|total|number|qty|volume|cost)/i.test(a) ? 1 : 0;
    const nameBoostB = /(value|amount|score|count|rate|total|number|qty|volume|cost)/i.test(b) ? 1 : 0;

    if (nameBoostA !== nameBoostB) return nameBoostB - nameBoostA;
    return a.localeCompare(b);
  });
}

function formatSample(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return 'No sample';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

export default function DataMappingPage() {
  const { user, organizationId } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ActiveTab>('sources');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataSources, setDataSources] = useState<DataSourceRow[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [metrics, setMetrics] = useState<MetricOption[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [sourcePreview, setSourcePreview] = useState<Record<string, unknown>[]>([]);
  const [sourceFields, setSourceFields] = useState<string[]>([]);
  const [fieldInsights, setFieldInsights] = useState<FieldInsight[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [transformationOperations, setTransformationOperations] = useState<TransformationOperation[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newPipelineDescription, setNewPipelineDescription] = useState('');
  const [newPipelineSchedule, setNewPipelineSchedule] = useState<'hourly' | 'daily' | 'weekly' | 'monthly'>('daily');

  useEffect(() => {
    loadPageData();
  }, [user, organizationId]);

  useEffect(() => {
    const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedPipelineId) || null;
    if (!selectedPipeline) {
      setTransformationOperations([]);
      return;
    }

    if (selectedPipeline.source_id && selectedPipeline.source_id !== selectedSourceId) {
      setSelectedSourceId(selectedPipeline.source_id);
    }

    const mappings = Array.isArray(selectedPipeline.transformation_rules?.field_mappings)
      ? selectedPipeline.transformation_rules?.field_mappings
      : [];
    const operations = Array.isArray(selectedPipeline.transformation_rules?.operations)
      ? selectedPipeline.transformation_rules?.operations
      : [];

    setFieldMappings(
      mappings.length > 0
        ? mappings
        : [{ sourceField: '', destinationType: 'value' }]
    );
    setTransformationOperations(operations);
  }, [selectedPipelineId, pipelines]);

  useEffect(() => {
    if (!selectedSourceId) {
      setSourcePreview([]);
      setSourceFields([]);
      setFieldInsights([]);
      return;
    }

    loadSourcePreview(selectedSourceId);
  }, [selectedSourceId, dataSources]);

  const resolveOrganizationId = async () => {
    if (organizationId) return organizationId;
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return data?.organization_id || null;
  };

  const loadPageData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const orgId = await resolveOrganizationId();
      if (!orgId) {
        setDataSources([]);
        setPipelines([]);
        setMetrics([]);
        return;
      }

      const [{ data: sourcesData, error: sourcesError }, { data: pipelinesData, error: pipelinesError }, { data: metricsData, error: metricsError }] = await Promise.all([
        supabase
          .from('data_sources')
          .select('id, name, type, file_data, connection_config, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('etl_pipelines')
          .select('id, name, source_id, status, destination_type, transformation_rules, updated_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('metrics')
          .select('id, name, unit')
          .eq('organization_id', orgId)
          .order('name', { ascending: true }),
      ]);

      if (sourcesError) throw sourcesError;
      if (pipelinesError) throw pipelinesError;
      if (metricsError) throw metricsError;

      const liveSources = (sourcesData as DataSourceRow[]) || [];
      const livePipelines = (pipelinesData as Pipeline[]) || [];
      const liveMetrics = (metricsData as MetricOption[]) || [];

      setDataSources(liveSources);
      setPipelines(livePipelines);
      setMetrics(liveMetrics);

      if (livePipelines.length > 0) {
        const nextPipelineId = selectedPipelineId && livePipelines.some((pipeline) => pipeline.id === selectedPipelineId)
          ? selectedPipelineId
          : livePipelines[0].id;
        setSelectedPipelineId(nextPipelineId);
      } else {
        setSelectedPipelineId('');
      }

      if (liveSources.length > 0) {
        const fallbackSource = livePipelines.find((pipeline) => pipeline.id === (selectedPipelineId || livePipelines[0]?.id))?.source_id;
        const nextSourceId = (fallbackSource && liveSources.some((source) => source.id === fallbackSource))
          ? fallbackSource
          : selectedSourceId && liveSources.some((source) => source.id === selectedSourceId)
            ? selectedSourceId
            : liveSources[0].id;
        setSelectedSourceId(nextSourceId || '');
      } else {
        setSelectedSourceId('');
      }
    } catch (error) {
      console.error('Error loading data mapping workspace:', error);
      showToast('Failed to load data mapping workspace', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSourcePreview = async (sourceId: string) => {
    setLoadingPreview(true);
    try {
      const source = dataSources.find((item) => item.id === sourceId);
      if (!source) return;

      let previewData: Record<string, unknown>[] = [];

      if (source.type === 'api' && source.connection_config?.base_url) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const config = source.connection_config;

        if (config.auth_type === 'api_key' && config.auth_key_name && config.auth_key_value) {
          headers[config.auth_key_name] = config.auth_key_value;
        } else if (config.auth_type === 'bearer' && config.auth_key_value) {
          headers.Authorization = `Bearer ${config.auth_key_value}`;
        } else if (config.auth_type === 'basic' && config.auth_key_name && config.auth_key_value) {
          headers.Authorization = `Basic ${btoa(`${config.auth_key_name}:${config.auth_key_value}`)}`;
        }

        if (Array.isArray(config.custom_headers)) {
          config.custom_headers.forEach((header) => {
            if (header.key && header.value) {
              headers[header.key] = header.value;
            }
          });
        }

        const response = await fetch(config.base_url, {
          method: config.http_method || 'GET',
          headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();
        previewData = extractDataFromJsonPath(payload, config.json_path || '').slice(0, 5);
      } else if (Array.isArray(source.file_data)) {
        previewData = source.file_data.slice(0, 5);
      }

      const fields = previewData.length > 0 ? Object.keys(previewData[0]) : [];
      const insights = inferFieldInsights(previewData, fields);

      setSourcePreview(previewData);
      setSourceFields(fields);
      setFieldInsights(insights);

      if (selectedPipelineId) return;

      setFieldMappings((current) => {
        if (current.length > 0 && current.some((mapping) => mapping.sourceField)) {
          return current;
        }

        const valueCandidates = getValueCandidateFields(fields, insights);
        const nameField = fields.find((field) => /name|metric|measure|kpi/i.test(field));
        const valueField = valueCandidates[0];
        const timestampField = fields.find((field) => /date|time|timestamp/i.test(field));
        const unitField = fields.find((field) => /unit/i.test(field));

        const nextMappings: FieldMapping[] = [];
        if (nameField) nextMappings.push({ sourceField: nameField, destinationType: 'metric_name' });
        if (valueField) nextMappings.push({ sourceField: valueField, destinationType: 'value' });
        if (timestampField) nextMappings.push({ sourceField: timestampField, destinationType: 'timestamp' });
        if (unitField) nextMappings.push({ sourceField: unitField, destinationType: 'unit' });
        return nextMappings.length > 0 ? nextMappings : [{ sourceField: '', destinationType: 'value' }];
      });
    } catch (error) {
      console.error('Error loading source preview:', error);
      showToast('Failed to load source preview', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const selectedSource = dataSources.find((source) => source.id === selectedSourceId) || null;
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedPipelineId) || null;
  const activeMappings = fieldMappings.filter((mapping) => mapping.sourceField);
  const valueCandidates = getValueCandidateFields(sourceFields, fieldInsights);
  const totalOperations = pipelines.reduce((sum, pipeline) => sum + ((pipeline.transformation_rules?.operations || []).length), 0);

  const saveMappings = async () => {
    if (!selectedSourceId) {
      showToast('Select a data source before saving mappings', 'error');
      return;
    }

    if (!fieldMappings.some((mapping) => mapping.destinationType === 'value' && mapping.sourceField)) {
      showToast('A value mapping is required before saving', 'error');
      return;
    }

    const incompleteMappings = fieldMappings.filter((mapping) => !mapping.sourceField);
    if (incompleteMappings.length > 0) {
      showToast('Each mapping row needs a source field before saving', 'error');
      return;
    }

    try {
      setSaving(true);
      if (selectedPipeline) {
        const nextRules = {
          ...(selectedPipeline.transformation_rules || {}),
          operations: transformationOperations,
          field_mappings: fieldMappings,
        };

        const { error } = await supabase
          .from('etl_pipelines')
          .update({
            source_id: selectedSourceId,
            transformation_rules: nextRules,
          })
          .eq('id', selectedPipeline.id);

        if (error) throw error;

        setPipelines((current) =>
          current.map((pipeline) =>
            pipeline.id === selectedPipeline.id
              ? { ...pipeline, source_id: selectedSourceId, transformation_rules: nextRules }
              : pipeline
          )
        );

        showToast('Mapping rules saved to the selected pipeline', 'success');
        return;
      }

      await createPipelineFromMappings();
    } catch (error) {
      console.error('Error saving mapping rules:', error);
      showToast('Failed to save mapping rules', 'error');
    } finally {
      setSaving(false);
    }
  };

  const createPipelineFromMappings = async () => {
    if (!user) {
      showToast('You need to be signed in to create a pipeline', 'error');
      return;
    }

    if (!selectedSourceId) {
      showToast('Select a source before creating a pipeline', 'error');
      return;
    }

    const orgId = await resolveOrganizationId();
    if (!orgId) {
      showToast('Unable to resolve your organization', 'error');
      return;
    }

    const defaultName = selectedSource
      ? `${selectedSource.name} Pipeline`
      : 'New Data Mapping Pipeline';
    const pipelineName = newPipelineName.trim() || defaultName;

    const payload = {
      organization_id: orgId,
      name: pipelineName,
      description: newPipelineDescription.trim() || `Created from the Data Mapping workspace for ${selectedSource?.name || 'a connected source'}.`,
      source_id: selectedSourceId,
      destination_type: 'metrics',
      schedule: newPipelineSchedule,
      transformation_rules: {
        operations: transformationOperations,
        field_mappings: fieldMappings,
      },
      status: 'draft',
      created_by: user.id,
    };

    const { data, error } = await supabase
      .from('etl_pipelines')
      .insert([payload])
      .select('id, name, source_id, status, destination_type, transformation_rules, updated_at')
      .single();

    if (error) throw error;

    const createdPipeline = data as Pipeline;
    setPipelines((current) => [createdPipeline, ...current]);
    setSelectedPipelineId(createdPipeline.id);
    setCreatingPipeline(false);
    setNewPipelineName('');
    setNewPipelineDescription('');
    setNewPipelineSchedule('daily');
    showToast('New ETL pipeline created from this mapping', 'success');
  };

  const addMappingRule = () => {
    setFieldMappings((current) => [...current, { sourceField: '', destinationType: 'value' }]);
  };

  const addTransformationOperation = () => {
    setTransformationOperations((current) => [
      ...current,
      { type: 'filter', field: '', condition: 'equals', value: '' },
    ]);
  };

  const removeTransformationOperation = (index: number) => {
    setTransformationOperations((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateTransformationOperation = (
    index: number,
    field: keyof TransformationOperation,
    value: string
  ) => {
    setTransformationOperations((current) =>
      current.map((operation, itemIndex) =>
        itemIndex === index
          ? { ...operation, [field]: value }
          : operation
      )
    );
  };

  const removeMappingRule = (index: number) => {
    setFieldMappings((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateMappingRule = (index: number, field: keyof FieldMapping, value: string) => {
    setFieldMappings((current) =>
      current.map((mapping, itemIndex) => {
        if (itemIndex !== index) return mapping;

        const nextMapping = { ...mapping, [field]: value };
        if (field === 'destinationType' && value !== 'value') {
          delete nextMapping.targetMetricId;
        }
        return nextMapping;
      })
    );
  };

  const getOrderedFieldsForMapping = (destinationType: FieldMapping['destinationType']) => {
    if (destinationType === 'value') return valueCandidates;
    return sourceFields;
  };

  const getFieldInsight = (fieldName: string) => fieldInsights.find((item) => item.field === fieldName);

  const previewRow = sourcePreview[0] || null;
  const transformedPreview = previewRow
    ? fieldMappings.reduce<Record<string, unknown>>((accumulator, mapping) => {
        const rawValue = previewRow[mapping.sourceField];
        if (mapping.destinationType === 'value' && mapping.targetMetricId) {
          const metric = metrics.find((item) => item.id === mapping.targetMetricId);
          accumulator.metric = metric ? metric.name : 'Selected metric';
        }
        accumulator[mapping.destinationType] = rawValue ?? 'No value';
        return accumulator;
      }, {})
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-sm">
              <i className="ri-node-tree text-white text-2xl"></i>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Data Mapping</h1>
              <p className="text-slate-600 text-sm mt-1">Configure live field mappings between your connected sources and SigmaSense ETL pipelines.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-600 text-sm font-medium">Data Sources</span>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <i className="ri-database-2-line text-blue-600 text-lg"></i>
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">{dataSources.length}</div>
            <div className="text-xs text-slate-500 mt-1">Live connected systems</div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-600 text-sm font-medium">Pipelines</span>
              <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                <i className="ri-git-branch-line text-teal-600 text-lg"></i>
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">{pipelines.length}</div>
            <div className="text-xs text-slate-500 mt-1">ETL destinations available</div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-600 text-sm font-medium">Mapped Fields</span>
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                <i className="ri-checkbox-circle-line text-emerald-600 text-lg"></i>
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">{activeMappings.length}</div>
            <div className="text-xs text-slate-500 mt-1">Rules in the selected pipeline</div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-600 text-sm font-medium">Transform Ops</span>
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                <i className="ri-refresh-line text-orange-600 text-lg"></i>
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">{totalOperations}</div>
            <div className="text-xs text-slate-500 mt-1">Advanced ETL operations saved</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 mb-6">
          <div className="flex border-b border-slate-200">
            {[
              { key: 'sources', label: 'Data Sources', icon: 'ri-database-2-line' },
              { key: 'mapping', label: 'Mapping Rules', icon: 'ri-git-branch-line' },
              { key: 'preview', label: 'Preview', icon: 'ri-eye-line' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as ActiveTab)}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? 'text-teal-700 border-b-2 border-teal-600 bg-teal-50/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <i className={`${tab.icon} mr-2`}></i>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {activeTab === 'sources' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Connected Data Sources</h2>
                  <p className="text-sm text-slate-600 mt-1">Inspect the real field structure coming from your active integrations and uploaded files.</p>
                </div>
                <a
                  href="/dashboard/data-integration"
                  className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-external-link-line mr-2"></i>
                  Manage Sources
                </a>
              </div>

              {dataSources.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
                    <i className="ri-database-2-line text-slate-400 text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">No live data sources yet</h3>
                  <p className="text-sm text-slate-600 mt-2">Connect a source in Data Integration first, then come back here to configure mappings.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {dataSources.map((source) => {
                    const sourceFieldsForCard = Array.isArray(source.file_data) && source.file_data.length > 0
                      ? Object.keys(source.file_data[0])
                      : [];
                    const sourceInsights = inferFieldInsights(
                      Array.isArray(source.file_data) ? source.file_data.slice(0, 5) : [],
                      sourceFieldsForCard
                    );
                    const linkedPipelines = pipelines.filter((pipeline) => pipeline.source_id === source.id);

                    return (
                      <button
                        type="button"
                        key={source.id}
                        onClick={() => {
                          setSelectedSourceId(source.id);
                          setActiveTab('mapping');
                        }}
                        className={`text-left border rounded-xl p-5 transition-all duration-200 hover:shadow-md ${
                          selectedSourceId === source.id
                            ? 'border-teal-400 bg-teal-50/40 shadow-sm'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                              <i className="ri-database-2-line text-white text-xl"></i>
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900">{source.name}</h3>
                              <p className="text-sm text-slate-600 capitalize">{source.type}</p>
                            </div>
                          </div>
                          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full whitespace-nowrap">
                            {linkedPipelines.length} pipeline{linkedPipelines.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-slate-500 text-xs">Fields</div>
                            <div className="font-semibold text-slate-900 mt-1">{sourceFieldsForCard.length || 'API'}</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-slate-500 text-xs">Rows Previewed</div>
                            <div className="font-semibold text-slate-900 mt-1">{Array.isArray(source.file_data) ? Math.min(source.file_data.length, 5) : 'Live'}</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-slate-500 text-xs">Numeric Fields</div>
                            <div className="font-semibold text-slate-900 mt-1">{sourceInsights.filter((item) => item.mostlyNumeric).length}</div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium text-slate-700">Detected fields</div>
                          {sourceFieldsForCard.length === 0 ? (
                            <div className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-3">
                              This source will populate its field list from the live API preview.
                            </div>
                          ) : (
                            sourceFieldsForCard.slice(0, 4).map((field) => {
                              const insight = sourceInsights.find((item) => item.field === field);
                              return (
                                <div key={field} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <i className="ri-file-list-3-line text-slate-400 text-sm"></i>
                                    <span className="text-sm font-medium text-slate-700 truncate">{field}</span>
                                  </div>
                                  <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded whitespace-nowrap">
                                    {insight?.inferredType || 'text'}
                                  </span>
                                </div>
                              );
                            })
                          )}
                          {sourceFieldsForCard.length > 4 && (
                            <div className="text-xs text-slate-500 text-center py-2">
                              +{sourceFieldsForCard.length - 4} more fields
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'mapping' && (
            <div className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Live Mapping Rules</h2>
                  <p className="text-sm text-slate-600 mt-1">Edit the actual field mappings saved on an ETL pipeline. These rules are used by the backend runner you just productionized.</p>
                </div>
                <div className="flex gap-3">
                  <a
                    href="/dashboard/etl-pipelines"
                    className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    Open ETL Pipelines
                  </a>
                  <button
                    onClick={saveMappings}
                    disabled={saving || (!selectedPipelineId && !creatingPipeline)}
                    className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : selectedPipelineId ? 'Save Mapping Rules' : 'Create Pipeline & Save Rules'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Source System</label>
                  <select
                    value={selectedSourceId}
                    onChange={(event) => setSelectedSourceId(event.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
                  <label className="block text-sm font-medium text-slate-700 mb-2">ETL Pipeline</label>
                  <select
                    value={selectedPipelineId}
                    onChange={(event) => setSelectedPipelineId(event.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">Select pipeline...</option>
                    {pipelines.map((pipeline) => (
                      <option key={pipeline.id} value={pipeline.id}>
                        {pipeline.name} ({pipeline.status})
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">No pipeline selected? Create one directly from this mapping workspace.</p>
                    <button
                      onClick={() => setCreatingPipeline((current) => !current)}
                      className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
                    >
                      {creatingPipeline ? 'Cancel' : 'Create pipeline'}
                    </button>
                  </div>
                </div>
              </div>

              {creatingPipeline && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 rounded-xl border border-teal-100 bg-teal-50/50">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Pipeline name</label>
                    <input
                      type="text"
                      value={newPipelineName}
                      onChange={(event) => setNewPipelineName(event.target.value)}
                      placeholder={selectedSource ? `${selectedSource.name} Pipeline` : 'New Data Mapping Pipeline'}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Schedule</label>
                    <select
                      value={newPipelineSchedule}
                      onChange={(event) => setNewPipelineSchedule(event.target.value as 'hourly' | 'daily' | 'weekly' | 'monthly')}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                    <input
                      type="text"
                      value={newPipelineDescription}
                      onChange={(event) => setNewPipelineDescription(event.target.value)}
                      placeholder="Optional description"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {selectedPipeline ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="px-3 py-1 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-full">
                      Pipeline destination: {selectedPipeline.destination_type}
                    </span>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      selectedPipeline.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : selectedPipeline.status === 'paused'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}>
                      {selectedPipeline.status}
                    </span>
                    <span className="px-3 py-1 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-full">
                      {transformationOperations.length} transform operation{transformationOperations.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
                    <i className="ri-git-branch-line text-slate-400 text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">Pick a real pipeline to edit or create one here</h3>
                  <p className="text-sm text-slate-600 mt-2">This page now edits live mappings stored in `etl_pipelines.transformation_rules.field_mappings`, and it can create a new ETL pipeline when you need one.</p>
                </div>
              )}

              {selectedSourceId && sourceFields.length > 0 && (
                <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <i className="ri-lightbulb-line text-teal-600"></i>
                    <h3 className="text-sm font-semibold text-teal-900">Suggested numeric fields for value mappings</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {valueCandidates.slice(0, 6).map((field) => {
                      const insight = getFieldInsight(field);
                      return (
                        <span key={field} className="px-3 py-1 bg-white border border-teal-100 text-teal-800 text-xs font-medium rounded-full">
                          {field}
                          {insight ? ` • ${Math.round(insight.numericRatio * 100)}% numeric` : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Source Field</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Detected Type</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Target</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Target Metric</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Sample</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldMappings.map((mapping, index) => {
                      const orderedFields = getOrderedFieldsForMapping(mapping.destinationType);
                      const insight = getFieldInsight(mapping.sourceField);
                      const sample = previewRow && mapping.sourceField ? previewRow[mapping.sourceField] : null;

                      return (
                        <tr key={`${mapping.destinationType}-${index}`} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
                          <td className="py-3 px-4 min-w-64">
                            <select
                              value={mapping.sourceField}
                              onChange={(event) => updateMappingRule(index, 'sourceField', event.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            >
                              <option value="">Select source field...</option>
                              {orderedFields.map((field) => (
                                <option key={field} value={field}>
                                  {field}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex px-3 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full">
                              {insight?.inferredType || 'unknown'}
                            </span>
                          </td>
                          <td className="py-3 px-4 min-w-40">
                            <select
                              value={mapping.destinationType}
                              onChange={(event) => updateMappingRule(index, 'destinationType', event.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            >
                              {Object.entries(destinationLabels).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4 min-w-56">
                            {mapping.destinationType === 'value' ? (
                              <select
                                value={mapping.targetMetricId || ''}
                                onChange={(event) => updateMappingRule(index, 'targetMetricId', event.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                              >
                                <option value="">Use metric_name mapping / auto-create</option>
                                {metrics.map((metric) => (
                                  <option key={metric.id} value={metric.id}>
                                    {metric.name}{metric.unit ? ` (${metric.unit})` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-slate-400">Not required</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-slate-600">{formatSample(sample)}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => removeMappingRule(index)}
                              className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <i className="ri-delete-bin-line"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-5">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Transformation Operations</h3>
                    <p className="text-sm text-slate-600 mt-1">These rules are saved into the pipeline's live `transformation_rules.operations` array and used to describe preprocessing intent.</p>
                  </div>
                  <button
                    onClick={addTransformationOperation}
                    className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-white transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Add Operation
                  </button>
                </div>

                {transformationOperations.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600 text-center">
                    No transformation operations saved yet. Add filters here to make this a full mapping-and-transform pipeline definition.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transformationOperations.map((operation, index) => (
                      <div key={`operation-${index}`} className="grid grid-cols-1 lg:grid-cols-[120px,1fr,1fr,1fr,48px] gap-3 items-end rounded-lg border border-slate-200 bg-white p-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-2">Type</label>
                          <div className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-slate-50">
                            Filter
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-2">Field</label>
                          <select
                            value={operation.field}
                            onChange={(event) => updateTransformationOperation(index, 'field', event.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          >
                            <option value="">Select field...</option>
                            {sourceFields.map((field) => (
                              <option key={field} value={field}>
                                {field}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-2">Condition</label>
                          <select
                            value={operation.condition}
                            onChange={(event) => updateTransformationOperation(index, 'condition', event.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          >
                            {Object.entries(operationTypeLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-2">Value</label>
                          <input
                            type="text"
                            value={operation.value}
                            onChange={(event) => updateTransformationOperation(index, 'value', event.target.value)}
                            placeholder="Comparison value"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                        </div>
                        <button
                          onClick={() => removeTransformationOperation(index)}
                          className="w-10 h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={addMappingRule}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <i className="ri-add-line mr-2"></i>
                  Add Mapping
                </button>
                <p className="text-xs text-slate-500">
                  Source preview: {loadingPreview ? 'loading...' : `${sourcePreview.length} row${sourcePreview.length === 1 ? '' : 's'} loaded`}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Mapping Preview</h2>
                <p className="text-sm text-slate-600">Preview the first real row from the selected source after the current mapping rules are applied.</p>
              </div>

              {!selectedSource ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
                    <i className="ri-eye-line text-slate-400 text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">Select a live source first</h3>
                  <p className="text-sm text-slate-600 mt-2">The preview tab uses real source rows, not sample placeholder data.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="border border-slate-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                        <i className="ri-database-2-line text-blue-600"></i>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">Source Row</h3>
                        <p className="text-xs text-slate-600">{selectedSource.name}</p>
                      </div>
                    </div>

                    {loadingPreview ? (
                      <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                      </div>
                    ) : previewRow ? (
                      <div className="space-y-3">
                        {Object.entries(previewRow).map(([field, value]) => (
                          <div key={field} className="bg-slate-50 rounded-lg p-3">
                            <div className="text-xs font-medium text-slate-500 mb-1">{field}</div>
                            <div className="text-sm font-medium text-slate-900 break-all">{formatSample(value)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                        No preview rows are available for this source yet.
                      </div>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                        <i className="ri-shuffle-line text-teal-600"></i>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">Transformed Output</h3>
                        <p className="text-xs text-slate-600">{selectedPipeline ? `${selectedPipeline.name} pipeline` : 'Unsaved mapping view'}</p>
                      </div>
                    </div>

                    {transformedPreview ? (
                      <div className="space-y-3">
                        {transformationOperations.length > 0 && (
                          <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Active transform operations</div>
                            <div className="space-y-2">
                              {transformationOperations.map((operation, index) => (
                                <div key={`preview-operation-${index}`} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                                  <span className="px-2.5 py-1 bg-slate-100 rounded-full font-medium">Filter</span>
                                  <span className="font-medium">{operation.field || 'field'}</span>
                                  <span>{operationTypeLabels[operation.condition]}</span>
                                  <span className="px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full">{operation.value || 'value'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {fieldMappings.map((mapping, index) => {
                          const metricName = mapping.targetMetricId
                            ? metrics.find((metric) => metric.id === mapping.targetMetricId)?.name
                            : null;
                          return (
                            <div key={`${mapping.destinationType}-preview-${index}`} className="bg-teal-50/60 rounded-lg p-3 border border-teal-100">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-medium text-teal-700 mb-1">
                                    {destinationLabels[mapping.destinationType]}
                                  </div>
                                  <div className="text-sm font-medium text-slate-900 break-all">
                                    {formatSample(transformedPreview[mapping.destinationType])}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-slate-500">from</div>
                                  <div className="text-sm font-medium text-slate-700">{mapping.sourceField || 'Unmapped'}</div>
                                  {metricName && (
                                    <div className="text-xs text-teal-700 mt-1">target metric: {metricName}</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                        Add mappings and load a source preview to see the transformed output here.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
