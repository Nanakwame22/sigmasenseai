import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { addToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface Metric {
  id: string;
  name: string;
  description: string;
  current_value: number;
  target_value: number;
  unit: string;
  category: string;
  trend: 'up' | 'down' | 'stable';
  data_source_id?: string;
  data_source_name?: string;
  aggregation_formula?: string;
  is_auto_aggregated?: boolean;
  data_points_count?: number;
  recent_data?: Array<{ value: number; timestamp: string; source?: string }>;
}

interface MetricDataPoint {
  id: string;
  metric_id: string;
  value: number;
  timestamp: string;
}

interface DataSource {
  id: string;
  name: string;
  type: string;
  records_count: number;
}

const parseNumericValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const findTimestampColumn = (headers: string[]): string | null => {
  const patterns = ['timestamp', 'date', 'time', 'recorded_at', 'datetime', 'period'];
  return headers.find((header) => {
    const lower = header.toLowerCase();
    return patterns.some((pattern) => lower.includes(pattern));
  }) || null;
};

const buildColumnMetricHistory = (
  rows: Record<string, unknown>[],
  columnName: string,
  organizationId: string,
  metricId: string,
  timestampColumn?: string | null
) => {
  return rows
    .map((row, index) => {
      const value = parseNumericValue(row[columnName]);
      if (value === null) return null;

      const rawTimestamp = timestampColumn ? row[timestampColumn] : null;
      const parsedTimestamp = rawTimestamp ? new Date(String(rawTimestamp)) : null;
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() - (rows.length - index - 1));

      return {
        metric_id: metricId,
        value: parseFloat(value.toFixed(2)),
        timestamp: parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime())
          ? parsedTimestamp.toISOString()
          : fallbackDate.toISOString(),
        organization_id: organizationId,
      };
    })
    .filter(Boolean) as Array<{
      metric_id: string;
      value: number;
      timestamp: string;
      organization_id: string;
    }>;
};

const formatMetricFreshness = (timestamp?: string) => {
  if (!timestamp) return 'No recent history';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just updated';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just updated';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

const getMetricTrustTone = (count: number, hasSource: boolean) => {
  if (count >= 10 && hasSource) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (count >= 3) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const formatTargetAttainment = (currentValue: number, targetValue: number) => {
  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    return 'Monitor only';
  }
  return `${((currentValue / targetValue) * 100).toFixed(1)}% of target`;
};

export default function MetricsPage() {
  const { user, organizationId } = useAuth();
  const location = useLocation();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'rows' | 'columns'>('columns');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const focusedMetricId = new URLSearchParams(location.search).get('metric');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    current_value: 0,
    target_value: 0,
    unit: ''
  });

  const [dataPoint, setDataPoint] = useState({
    value: 0,
    timestamp: new Date().toISOString().split('T')[0]
  });

  const [importStep, setImportStep] = useState<'select' | 'mapping' | 'preview'>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDataSource, setSelectedDataSource] = useState<string>('');
  const [importData, setImportData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<{
    nameColumn: string;
    valueColumn: string;
    unitColumn: string;
  }>({
    nameColumn: '',
    valueColumn: '',
    unitColumn: ''
  });
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  useEffect(() => {
    if (organizationId) {
      fetchMetrics();
      fetchDataSources();
    }
  }, [organizationId]);

  const fetchDataSources = async () => {
    if (!organizationId) return;

    try {
      const { data, error } = await supabase
        .from('data_sources')
        .select('id, name, type, records_count')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDataSources(data || []);
    } catch (error) {
      console.error('Error fetching data sources:', error);
    }
  };

  const fetchMetrics = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('metrics')
        .select(`
          *,
          data_sources (
            name,
            type
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch data point counts and recent data for each metric
      const metricsWithData = await Promise.all((data || []).map(async (metric) => {
        // Get data point count
        const { count } = await supabase
          .from('metric_data')
          .select('*', { count: 'exact', head: true })
          .eq('metric_id', metric.id);

        // Get recent 30 data points for sparkline
        const { data: recentData } = await supabase
          .from('metric_data')
          .select('value, timestamp, source')
          .eq('metric_id', metric.id)
          .order('timestamp', { ascending: true })
          .limit(30);

        return {
          ...metric,
          data_source_name: metric.data_sources?.name,
          data_points_count: count || 0,
          recent_data: recentData || []
        };
      }));

      setMetrics(metricsWithData);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportFromDataSource = async (sourceId: string) => {
    try {
      setImporting(true);
      
      const { data: sourceData, error: sourceError } = await supabase
        .from('data_sources')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (sourceError || !sourceData) {
        throw new Error('Data source not found');
      }

      if (!sourceData.file_data || !Array.isArray(sourceData.file_data)) {
        throw new Error('No valid data found in data source');
      }

      const rawData = sourceData.file_data;
      
      if (rawData.length === 0) {
        throw new Error('Data source is empty');
      }

      const headers = Object.keys(rawData[0] || {});
      const timestampColumn = findTimestampColumn(headers);
      
      if (headers.length === 0) {
        throw new Error('No columns found in data source');
      }

      // Check if user wants column-based import
      if (importMode === 'columns') {
        // COLUMN-BASED IMPORT: Each column is a metric
        const metricsToImport = [];
        
        // Skip common non-metric columns
        const skipColumns = ['date', 'time', 'timestamp', 'id', 'index', 'row', 'period'];
        const metricColumns = headers.filter(h => 
          !skipColumns.some(skip => h.toLowerCase().includes(skip))
        );

        for (const columnName of metricColumns) {
          // Calculate average value from all rows for this column
          const values = rawData
            .map(row => {
              const val = row[columnName];
              if (val === null || val === undefined || val === '') return null;
              const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
              return isNaN(parsed) ? null : parsed;
            })
            .filter(v => v !== null) as number[];

          if (values.length === 0) continue;

          const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
          const latestValue = values[values.length - 1];

          metricsToImport.push({
            name: columnName,
            description: `Imported from ${sourceData.name} (column-based)`,
            current_value: parseFloat(latestValue.toFixed(2)),
            target_value: 0,
            unit: '',
            organization_id: organizationId,
            data_source_id: sourceId,
            is_auto_aggregated: true
          });
        }

        if (metricsToImport.length === 0) {
          throw new Error('No valid metric columns found');
        }

        const { data: importedMetrics, error: importError } = await supabase
          .from('metrics')
          .insert(metricsToImport)
          .select();

        if (importError) throw importError;

        if (importedMetrics && importedMetrics.length > 0) {
          const dataPoints = importedMetrics.flatMap((metric) =>
            buildColumnMetricHistory(rawData, metric.name, organizationId, metric.id, timestampColumn)
          );

          if (dataPoints.length > 0) {
            await supabase.from('metric_data').insert(dataPoints);
          }

          setShowDataSourceModal(false);
          fetchMetrics();

          addToast(
            dataPoints.length > 0
              ? `Successfully imported ${importedMetrics.length} metrics from ${sourceData.name} with ${dataPoints.length} real historical data points.`
              : `Successfully imported ${importedMetrics.length} metrics from ${sourceData.name}. No usable time-series rows were found, so no history was fabricated.`,
            'success'
          );
        }
      } else {
        // ROW-BASED IMPORT: Each row is a metric (existing logic)
        const findColumn = (patterns: string[]) => {
          return headers.find(h => {
            const lower = h.toLowerCase();
            return patterns.some(pattern => lower.includes(pattern.toLowerCase()));
          });
        };

        const nameCol = findColumn([
          'name', 'metric', 'kpi', 'title', 'label', 'description', 
          'item', 'measure', 'indicator', 'variable', 'field'
        ]);
        
        const valueCol = findColumn([
          'value', 'amount', 'count', 'number', 'qty', 'quantity',
          'total', 'sum', 'data', 'score', 'rate', 'percent', 'result',
          'current', 'actual'
        ]);
        
        const unitCol = findColumn([
          'unit', 'uom', 'type', 'category', 'dimension', 'units'
        ]);

        const actualNameCol = nameCol || headers[0];
        
        if (!actualNameCol) {
          throw new Error('Could not identify a column for metric names');
        }

        const metricsToImport = rawData
          .filter(row => {
            const nameValue = row[actualNameCol];
            return nameValue && String(nameValue).trim() !== '';
          })
          .map(row => {
            let currentValue = 0;
            if (valueCol && row[valueCol] !== undefined && row[valueCol] !== null) {
              currentValue = parseNumericValue(row[valueCol]) ?? 0;
            }

            return {
              name: String(row[actualNameCol]).trim(),
              description: `Imported from ${sourceData.name}`,
              current_value: currentValue,
              target_value: 0,
              unit: unitCol && row[unitCol] ? String(row[unitCol]).trim() : '',
              organization_id: organizationId,
              data_source_id: sourceId,
              is_auto_aggregated: true
            };
          })
          .slice(0, 100);

        if (metricsToImport.length === 0) {
          throw new Error(`No valid metrics found. Available columns: ${headers.join(', ')}`);
        }

        const { data: importedMetrics, error: importError } = await supabase
          .from('metrics')
          .insert(metricsToImport)
          .select();

        if (importError) throw importError;

        if (importedMetrics && importedMetrics.length > 0) {
          setShowDataSourceModal(false);
          fetchMetrics();
          
          const columnInfo = [];
          columnInfo.push(`names from "${actualNameCol}"`);
          if (valueCol) columnInfo.push(`values from "${valueCol}"`);
          if (unitCol) columnInfo.push(`units from "${unitCol}"`);
          
          const infoText = columnInfo.length > 0 ? ` (${columnInfo.join(', ')})` : '';
          
          addToast(
            `Successfully imported ${importedMetrics.length} metrics from ${sourceData.name}${infoText}. Current values came from the source rows, and no synthetic history was added.`,
            'success'
          );
        }
      }
    } catch (error: any) {
      console.error('Error importing from data source:', error);
      addToast(`Failed to import metrics: ${error.message}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setSelectedFile(file);
      const text = await file.text();
      const rows = text.split('\n').map(row => row.split(','));
      const headers = rows[0].map(h => h.trim().replace(/"/g, ''));
      const data = rows.slice(1).filter(row => row.length === headers.length && row.some(cell => cell.trim()));
      
      const processedData = data.map(row => {
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = row[index]?.trim().replace(/"/g, '') || '';
        });
        return obj;
      });

      setImportData(processedData);
      setAvailableColumns(headers);
      
      // More flexible auto-detection with multiple fallback patterns
      const findColumn = (patterns: string[]) => {
        return headers.find(h => {
          const lower = h.toLowerCase();
          return patterns.some(pattern => lower.includes(pattern));
        });
      };

      const nameCol = findColumn([
        'name', 'metric', 'kpi', 'title', 'label', 'description',
        'item', 'measure', 'indicator', 'variable', 'field'
      ]);
      
      const valueCol = findColumn([
        'value', 'amount', 'count', 'number', 'qty', 'quantity',
        'total', 'sum', 'data', 'score', 'rate', 'percent', 'result'
      ]);
      
      const unitCol = findColumn([
        'unit', 'uom', 'type', 'category', 'dimension', 'units'
      ]);

      setColumnMapping({
        nameColumn: nameCol || headers[0] || '',
        valueColumn: valueCol || headers[1] || '',
        unitColumn: unitCol || ''
      });

      setImportStep('mapping');
    } catch (error) {
      console.error('Error processing file:', error);
      addToast('Error processing file. Please check the format and try again.', 'error');
    }
  };

  const handleDataSourceSelect = async (sourceId: string) => {
    try {
      setSelectedDataSource(sourceId);
      
      // Get data source details
      const { data: sourceData, error: sourceError } = await supabase
        .from('data_sources')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (sourceError || !sourceData) {
        addToast('Data source not found', 'error');
        return;
      }

      if (!sourceData.file_data || !Array.isArray(sourceData.file_data)) {
        addToast('Data source is empty or invalid', 'error');
        return;
      }

      const rawData = sourceData.file_data;
      const headers = Object.keys(rawData[0] || {});
      setAvailableColumns(headers);
      setImportData(rawData);

      // More flexible auto-detection with multiple fallback patterns
      const findColumn = (patterns: string[]) => {
        return headers.find(h => {
          const lower = h.toLowerCase();
          return patterns.some(pattern => lower.includes(pattern));
        });
      };

      const nameCol = findColumn([
        'name', 'metric', 'kpi', 'title', 'label', 'description',
        'item', 'measure', 'indicator', 'variable', 'field'
      ]);
      
      const valueCol = findColumn([
        'value', 'amount', 'count', 'number', 'qty', 'quantity',
        'total', 'sum', 'data', 'score', 'rate', 'percent', 'result'
      ]);
      
      const unitCol = findColumn([
        'unit', 'uom', 'type', 'category', 'dimension', 'units'
      ]);

      setColumnMapping({
        nameColumn: nameCol || headers[0] || '',
        valueColumn: valueCol || headers[1] || '',
        unitColumn: unitCol || ''
      });

      setImportStep('mapping');
    } catch (error) {
      console.error('Error processing data source:', error);
      addToast('Error processing data source. Please try again.', 'error');
    }
  };

  const handleImportMetrics = async () => {
    if (!columnMapping.nameColumn) {
      addToast('Please select a column for metric names', 'warning');
      return;
    }

    try {
      const metricsToImport = importData
        .filter(row => row[columnMapping.nameColumn] && String(row[columnMapping.nameColumn]).trim())
        .map(row => ({
          name: String(row[columnMapping.nameColumn]).trim(),
          description: selectedFile ? `Imported from ${selectedFile.name}` : `Imported from data source`,
          current_value: columnMapping.valueColumn && row[columnMapping.valueColumn] ? 
            parseFloat(row[columnMapping.valueColumn]) || 0 : 0,
          target_value: 0,
          unit: columnMapping.unitColumn && row[columnMapping.unitColumn] ? 
            String(row[columnMapping.unitColumn]).trim() : '',
          organization_id: organizationId
        }));

      if (metricsToImport.length === 0) {
        addToast('No valid metrics found to import', 'warning');
        return;
      }

      // Import metrics to Supabase
      const { error } = await supabase
        .from('metrics')
        .insert(metricsToImport);

      if (error) throw error;

      addToast(`Successfully imported ${metricsToImport.length} metrics!`, 'success');
      fetchMetrics();
      setShowImportModal(false);
      setImportStep('select');
      setSelectedFile(null);
      setSelectedDataSource('');
      setImportData([]);
      setColumnMapping({ nameColumn: '', valueColumn: '', unitColumn: '' });
    } catch (error) {
      console.error('Error importing metrics:', error);
      addToast('Error importing metrics. Please try again.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;

    try {
      const { data, error } = await supabase
        .from('metrics')
        .insert([{ ...formData, organization_id: organizationId }])
        .select()
        .single();

      if (error) throw error;

      setMetrics([data, ...metrics]);
      setShowAddModal(false);
      setFormData({
        name: '',
        description: '',
        current_value: 0,
        target_value: 0,
        unit: ''
      });
      addToast('Metric added successfully', 'success');
    } catch (error) {
      console.error('Error adding metric:', error);
      addToast('Failed to add metric', 'error');
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
        .from('metrics')
        .delete()
        .eq('id', deleteTargetId);

      if (error) throw error;
      setMetrics(metrics.filter(m => m.id !== deleteTargetId));
      addToast('Metric deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting metric:', error);
      addToast('Failed to delete metric', 'error');
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  };

  const handleClearAllMetrics = async () => {
    setClearAllConfirmOpen(true);
  };

  const handleClearAllConfirm = async () => {
    try {
      setLoading(true);
      
      // Delete all metric data first
      const { error: dataError } = await supabase
        .from('metric_data')
        .delete()
        .eq('organization_id', organizationId);

      if (dataError) throw dataError;

      // Then delete all metrics
      const { error: metricsError } = await supabase
        .from('metrics')
        .delete()
        .eq('organization_id', organizationId);

      if (metricsError) throw metricsError;

      setMetrics([]);
      addToast('All metrics have been successfully deleted. You can now start fresh with new data.', 'success');
    } catch (error) {
      console.error('Error clearing all metrics:', error);
      addToast('Failed to clear all metrics. Please try again.', 'error');
    } finally {
      setLoading(false);
      setClearAllConfirmOpen(false);
    }
  };

  const handleAddDataPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMetric) return;

    try {
      const { error } = await supabase
        .from('metric_data')
        .insert([{
          metric_id: selectedMetric.id,
          value: dataPoint.value,
          timestamp: dataPoint.timestamp,
          organization_id: organizationId
        }]);

      if (error) throw error;

      // Update current value in metrics table
      await supabase
        .from('metrics')
        .update({ current_value: dataPoint.value })
        .eq('id', selectedMetric.id);

      setShowDataModal(false);
      setSelectedMetric(null);
      setDataPoint({
        value: 0,
        timestamp: new Date().toISOString().split('T')[0]
      });
      fetchMetrics();
      addToast('Data point added successfully', 'success');
    } catch (error) {
      console.error('Error adding data point:', error);
      addToast('Failed to add data point', 'error');
    }
  };

  // Quick inline add data point
  const handleQuickAddDataPoint = async (metricId: string, value: number) => {
    try {
      const timestamp = new Date().toISOString();
      
      const { error } = await supabase
        .from('metric_data')
        .insert([{
          metric_id: metricId,
          value: value,
          timestamp: timestamp,
          organization_id: organizationId
        }]);

      if (error) throw error;

      // Update current value
      await supabase
        .from('metrics')
        .update({ current_value: value })
        .eq('id', metricId);

      fetchMetrics();
      addToast('Data point added', 'success');
    } catch (error) {
      console.error('Error adding data point:', error);
      addToast('Failed to add data point', 'error');
    }
  };

  const handleImportCSV = async () => {
    if (!importFile || !organizationId) return;

    setImporting(true);
    try {
      const text = await importFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        addToast('CSV file must contain headers and at least one data row', 'warning');
        setImporting(false);
        return;
      }

      // Parse headers - handle quoted values
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));

      const nameIndex = headers.indexOf('name');
      const currentValueIndex = headers.indexOf('current_value');
      const targetValueIndex = headers.indexOf('target_value');
      const unitIndex = headers.indexOf('unit');
      const descriptionIndex = headers.indexOf('description');

      if (nameIndex === -1) {
        addToast('CSV must contain a "name" column', 'warning');
        setImporting(false);
        return;
      }

      const metricsToImport = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]).map(v => v.replace(/['"]/g, ''));
        if (values[nameIndex] && values[nameIndex].trim()) {
          metricsToImport.push({
            name: values[nameIndex].trim(),
            description: descriptionIndex !== -1 && values[descriptionIndex] ? values[descriptionIndex].trim() : '',
            unit: unitIndex !== -1 && values[unitIndex] ? values[unitIndex].trim() : '',
            target_value: targetValueIndex !== -1 && values[targetValueIndex] ? parseFloat(values[targetValueIndex]) || 0 : 0,
            current_value: currentValueIndex !== -1 && values[currentValueIndex] ? parseFloat(values[currentValueIndex]) || 0 : 0,
            organization_id: organizationId
          });
        }
      }

      if (metricsToImport.length === 0) {
        addToast('No valid metrics found in CSV', 'warning');
        setImporting(false);
        return;
      }

      const { data, error } = await supabase
        .from('metrics')
        .insert(metricsToImport)
        .select();

      if (error) throw error;

      if (data) {
        setMetrics([...data, ...metrics]);
        setShowImportModal(false);
        setImportFile(null);
        addToast(`Successfully imported ${data.length} metrics`, 'success');
      }
    } catch (error) {
      console.error('Error importing CSV:', error);
      addToast('Failed to import CSV. Please check the file format and try again.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleSeedDemoData = async () => {
    if (!organizationId) return;

    try {
      setSeeding(true);
      addToast('Creating sandbox demo metrics with sample historical data...', 'info');

      // Define 5 realistic metrics with different characteristics
      const demoMetrics = [
        {
          name: 'Monthly Revenue',
          description: 'Total monthly revenue across all product lines',
          current_value: 285000,
          target_value: 300000,
          unit: 'USD',
          category: 'financial',
          trend_type: 'upward', // Positive growth trend
          base_value: 250000,
          volatility: 0.08
        },
        {
          name: 'Customer Satisfaction Score',
          description: 'Average customer satisfaction rating from surveys',
          current_value: 4.2,
          target_value: 4.5,
          unit: 'score',
          category: 'quality',
          trend_type: 'stable', // Stable with minor fluctuations
          base_value: 4.1,
          volatility: 0.05
        },
        {
          name: 'Defect Rate',
          description: 'Percentage of products with defects per batch',
          current_value: 2.8,
          target_value: 2.0,
          unit: '%',
          category: 'quality',
          trend_type: 'downward', // Improving (decreasing defects)
          base_value: 3.5,
          volatility: 0.15
        },
        {
          name: 'Order Fulfillment Time',
          description: 'Average time from order placement to delivery',
          current_value: 3.2,
          target_value: 2.5,
          unit: 'days',
          category: 'operations',
          trend_type: 'improving', // Decreasing trend (better)
          base_value: 4.0,
          volatility: 0.12
        },
        {
          name: 'Employee Productivity',
          description: 'Average units produced per employee per hour',
          current_value: 42,
          target_value: 50,
          unit: 'units/hr',
          category: 'operations',
          trend_type: 'upward', // Increasing productivity
          base_value: 35,
          volatility: 0.10
        }
      ];

      // Insert metrics
      const { data: insertedMetrics, error: metricsError } = await supabase
        .from('metrics')
        .insert(
          demoMetrics.map(m => ({
            name: m.name,
            description: m.description,
            current_value: m.current_value,
            target_value: m.target_value,
            unit: m.unit,
            organization_id: organizationId
          }))
        )
        .select();

      if (metricsError) throw metricsError;

      if (!insertedMetrics || insertedMetrics.length === 0) {
        throw new Error('Failed to insert metrics');
      }

      // Generate historical data points for each metric (60-90 days)
      const allDataPoints = [];
      const now = new Date();

      for (let i = 0; i < insertedMetrics.length; i++) {
        const metric = insertedMetrics[i];
        const config = demoMetrics[i];
        const daysOfHistory = 60 + Math.floor(Math.random() * 31); // 60-90 days

        for (let dayOffset = daysOfHistory - 1; dayOffset >= 0; dayOffset--) {
          const timestamp = new Date(now);
          timestamp.setDate(timestamp.getDate() - dayOffset);
          timestamp.setHours(9, 0, 0, 0); // Set to 9 AM for consistency

          // Calculate progress through the time period (0 to 1)
          const progress = (daysOfHistory - dayOffset) / daysOfHistory;

          // Base value with trend
          let trendValue = config.base_value;
          
          if (config.trend_type === 'upward') {
            // Gradual increase over time
            trendValue = config.base_value + (config.current_value - config.base_value) * progress;
          } else if (config.trend_type === 'downward' || config.trend_type === 'improving') {
            // Gradual decrease over time
            trendValue = config.base_value - (config.base_value - config.current_value) * progress;
          } else if (config.trend_type === 'stable') {
            // Mostly stable with slight drift
            trendValue = config.base_value + (config.current_value - config.base_value) * progress * 0.3;
          }

          // Add natural daily variation
          const dailyVariation = 1 + (Math.random() - 0.5) * config.volatility * 2;
          let value = trendValue * dailyVariation;

          // Add intentional outliers (5-7 outliers per metric across the time period)
          const outlierProbability = 0.08; // 8% chance of outlier
          if (Math.random() < outlierProbability) {
            // Create significant deviation (2-3 standard deviations)
            const outlierMultiplier = Math.random() > 0.5 ? 1.3 : 0.7;
            value = value * outlierMultiplier;
          }

          // Add weekly patterns (slightly higher/lower on certain days)
          const dayOfWeek = timestamp.getDay();
          if (dayOfWeek === 1) { // Monday effect
            value *= 0.95;
          } else if (dayOfWeek === 5) { // Friday effect
            value *= 1.05;
          }

          // Round to appropriate precision
          if (config.unit === 'USD') {
            value = Math.round(value);
          } else if (config.unit === 'score') {
            value = Math.round(value * 10) / 10;
          } else if (config.unit === '%') {
            value = Math.round(value * 10) / 10;
          } else if (config.unit === 'days') {
            value = Math.round(value * 10) / 10;
          } else {
            value = Math.round(value);
          }

          // Ensure positive values
          value = Math.max(value, 0.1);

          allDataPoints.push({
            metric_id: metric.id,
            value: value,
            timestamp: timestamp.toISOString(),
            organization_id: organizationId
          });
        }
      }

      // Insert all data points in batches (Supabase has limits)
      const batchSize = 1000;
      for (let i = 0; i < allDataPoints.length; i += batchSize) {
        const batch = allDataPoints.slice(i, i + batchSize);
        const { error: dataError } = await supabase
          .from('metric_data')
          .insert(batch);

        if (dataError) throw dataError;
      }

      // Refresh metrics list
      await fetchMetrics();

      addToast(
        `Successfully created ${insertedMetrics.length} sandbox demo metrics with ${allDataPoints.length} sample historical data points. These are for exploration only and do not represent live operational data.`,
        'success'
      );
    } catch (error: any) {
      console.error('Error seeding demo data:', error);
      addToast(`Failed to create sandbox demo data: ${error.message}`, 'error');
    } finally {
      setSeeding(false);
    }
  };

  const getStatusColor = (current: number, target: number) => {
    const percentage = (current / target) * 100;
    if (percentage >= 90) return 'text-green-600 bg-green-50';
    if (percentage >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Metrics</h1>
          <p className="text-sm text-gray-600 mt-1">Track and manage your key performance metrics</p>
        </div>
        <div className="flex gap-3">
          {metrics.length === 0 && (
            <button
              onClick={handleSeedDemoData}
              disabled={seeding}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {seeding ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Generating...
                </>
              ) : (
                <>
                  <i className="ri-magic-line"></i>
                  Create Sandbox Demo Data
                </>
              )}
            </button>
          )}
          {dataSources.length > 0 && (
            <button
              onClick={() => setShowDataSourceModal(true)}
              className="px-4 py-2 bg-blue-600 border border-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <i className="ri-database-2-line"></i>
              Import from Data Sources
            </button>
          )}
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <i className="ri-upload-2-line"></i>
            Import CSV
          </button>
          {metrics.length > 0 && (
            <button
              onClick={handleClearAllMetrics}
              className="px-4 py-2 bg-red-600 border border-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <i className="ri-delete-bin-line"></i>
              Clear All
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <i className="ri-add-line"></i>
            Add Metric
          </button>
        </div>
      </div>

      {/* Enhanced Info Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-teal-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <i className="ri-information-line text-blue-600 text-xl mr-3 mt-0.5"></i>
          <div className="flex-1">
            <p className="text-sm text-blue-900 font-medium mb-1">Data Integration Connected</p>
            <p className="text-sm text-blue-800 mb-2">
              Metrics uploaded via Data Integration automatically appear here and are available across all analysis features.
            </p>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-blue-700">
                <i className="ri-checkbox-circle-line"></i>
                Forecasting & Predictions
              </span>
              <span className="flex items-center gap-1 text-blue-700">
                <i className="ri-checkbox-circle-line"></i>
                Anomaly Detection
              </span>
              <span className="flex items-center gap-1 text-blue-700">
                <i className="ri-checkbox-circle-line"></i>
                Root Cause Analysis
              </span>
              <span className="flex items-center gap-1 text-blue-700">
                <i className="ri-checkbox-circle-line"></i>
                Quality Analysis
              </span>
            </div>
          </div>
        </div>
      </div>

      {metrics.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <i className="ri-line-chart-line text-5xl text-gray-400 mb-4"></i>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No metrics yet</h3>
          <p className="text-gray-600 mb-4">Get started by importing real metrics or adding your first metric manually. Sandbox demo data is available below if you want a safe sample environment.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-teal-600 border border-teal-600 text-white rounded-lg hover:bg-teal-700 whitespace-nowrap cursor-pointer"
            >
              Import CSV
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap cursor-pointer"
            >
              Add Metric
            </button>
          </div>
          
          {/* Demo Data Info */}
          <div className="mt-6 max-w-2xl mx-auto bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4 text-left">
            <div className="flex items-start">
              <i className="ri-lightbulb-line text-purple-600 text-xl mr-3 mt-0.5"></i>
              <div className="text-left flex-1">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <p className="text-sm text-purple-900 font-medium">Sandbox Demo Mode</p>
                  <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                    Sample Only
                  </span>
                </div>
                <p className="text-sm text-purple-800 mb-3">Use this only if you want a safe, non-production sample environment to explore the analytics features before loading live operational data.</p>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li className="flex items-start">
                    <i className="ri-check-line text-purple-600 mr-2 mt-0.5"></i>
                    <span>Creates 5 realistic metrics (Revenue, Customer Satisfaction, Defect Rate, Fulfillment Time, Productivity)</span>
                  </li>
                  <li className="flex items-start">
                    <i className="ri-check-line text-purple-600 mr-2 mt-0.5"></i>
                    <span>Generates 60-90 days of historical data for each metric with natural trends and patterns</span>
                  </li>
                  <li className="flex items-start">
                    <i className="ri-check-line text-purple-600 mr-2 mt-0.5"></i>
                    <span>Includes intentional outliers to trigger anomaly detection</span>
                  </li>
                  <li className="flex items-start">
                    <i className="ri-check-line text-purple-600 mr-2 mt-0.5"></i>
                    <span>Creates a safe sample environment for exploring Forecasting, Anomaly Detection, and Recommendations</span>
                  </li>
                </ul>
                <div className="mt-4">
                  <button
                    onClick={handleSeedDemoData}
                    disabled={seeding}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md font-medium"
                  >
                    {seeding ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Creating Sandbox Data...
                      </>
                    ) : (
                      <>
                        <i className="ri-flask-line mr-2"></i>
                        Create Sandbox Demo Data
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {metrics.map((metric) => {
            const latestHistoryPoint = metric.recent_data?.[metric.recent_data.length - 1];
            const hasSource = Boolean(metric.data_source_name);
            const trustTone = getMetricTrustTone(metric.data_points_count || 0, hasSource);
            const lineageLabel = hasSource
              ? `Data Integration → ${metric.data_source_name} → Metrics`
              : 'Manual metric capture → Metrics';
            const provenanceLabel = latestHistoryPoint?.source
              ? latestHistoryPoint.source.startsWith('etl:')
                ? latestHistoryPoint.source
                    .replace('etl:', '')
                    .replace(/:source:[^:]+/, '')
                    .replace(':mapping:', ' · mapping ')
                    .replace(':run:', ' · run ')
                    .replace('pipeline:', 'pipeline ')
                : latestHistoryPoint.source
              : hasSource
                ? 'Awaiting ETL provenance on newer points'
                : 'Manual entry or legacy point';

            return (
            <div
              key={metric.id}
              className={`bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow ${
                focusedMetricId === metric.id
                  ? 'border-teal-400 ring-2 ring-teal-100'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-slate-800">{metric.name}</h3>
                    {metric.is_auto_aggregated && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                        Auto-Aggregated
                      </span>
                    )}
                    {/* Data Point Count Badge */}
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      (metric.data_points_count || 0) >= 3 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {metric.data_points_count || 0} {(metric.data_points_count || 0) === 1 ? 'point' : 'points'}
                    </span>
                  </div>
                  {metric.data_source_name && (
                    <div className="flex items-center gap-1 text-xs text-slate-600 mb-2">
                      <i className="ri-database-2-line"></i>
                      <span>From: {metric.data_source_name}</span>
                    </div>
                  )}
                  <p className="text-sm text-slate-600">{metric.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedMetric(metric);
                      setDataPoint({
                        value: metric.current_value,
                        timestamp: new Date().toISOString().split('T')[0]
                      });
                      setShowDataModal(true);
                    }}
                    className="w-8 h-8 flex items-center justify-center text-green-600 hover:bg-green-50 rounded-lg transition-colors cursor-pointer"
                    title="Add data point"
                  >
                    <i className="ri-add-circle-line text-lg"></i>
                  </button>
                  <button
                    onClick={() => handleDelete(metric.id)}
                    className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="ri-delete-bin-line text-lg"></i>
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${trustTone}`}>
                    Freshness: {formatMetricFreshness(latestHistoryPoint?.timestamp)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    History: {metric.data_points_count || 0} points
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  Evidence: {metric.recent_data && metric.recent_data.length > 0
                    ? `Recent trend is based on the latest ${metric.recent_data.length} stored points for this metric.`
                    : 'No recent trend history has been stored yet, so downstream analytics will remain cautious.'}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">
                  Lineage: {lineageLabel}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">
                  Provenance: {provenanceLabel}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {hasSource ? (
                    <Link
                      to={`/dashboard/data-integration?source=${metric.data_source_id || ''}`}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-200 hover:text-teal-700"
                    >
                      <i className="ri-links-line"></i>
                      Source
                    </Link>
                  ) : (
                    <Link
                      to="/dashboard/metrics"
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-200 hover:text-teal-700"
                    >
                      <i className="ri-edit-circle-line"></i>
                      Manual
                    </Link>
                  )}
                  <Link
                    to={`/dashboard/data-mapping?source=${metric.data_source_id || ''}&metric=${metric.id}&tab=mapping`}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-200 hover:text-teal-700"
                  >
                    <i className="ri-map-pin-line"></i>
                    Mapping
                  </Link>
                  <Link
                    to={`/dashboard/etl-pipelines?source=${metric.data_source_id || ''}&metric=${metric.id}`}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-200 hover:text-teal-700"
                  >
                    <i className="ri-git-branch-line"></i>
                    ETL
                  </Link>
                </div>
              </div>

              {/* Mini Sparkline */}
              {metric.recent_data && metric.recent_data.length > 0 && (
                <div className="mb-4 h-12 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metric.recent_data}>
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#14B8A6" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Current</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {metric.current_value} {metric.unit}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Target</span>
                  <span className="text-lg font-semibold text-gray-700">
                    {metric.target_value} {metric.unit}
                  </span>
                </div>
                <div className="pt-3 border-t border-gray-100">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(metric.current_value, metric.target_value)}`}>
                    <i className="ri-pulse-line"></i>
                    {formatTargetAttainment(metric.current_value, metric.target_value)}
                  </div>
                </div>

                {/* Warning if insufficient data */}
                {(metric.data_points_count || 0) < 3 && (
                  <div className="mt-3 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <i className="ri-alert-line text-orange-600 text-sm mt-0.5"></i>
                      <div className="flex-1">
                        <p className="text-xs text-orange-800 font-medium">Need more data</p>
                        <p className="text-xs text-orange-700">Add at least 3 data points for analysis features</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Add Metric Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Add New Metric</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="e.g., Patient Wait Time"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={3}
                  placeholder="Brief description of the metric"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Value</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.current_value}
                    onChange={(e) => setFormData({ ...formData, current_value: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Value</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.target_value}
                    onChange={(e) => setFormData({ ...formData, target_value: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <input
                  type="text"
                  required
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="e.g., minutes, %, count"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  Add Metric
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Import Metrics from CSV</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 mb-2">CSV Format:</p>
                <code className="text-xs text-blue-900 block">
                  name,current_value,target_value,unit,description
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportCSV}
                  disabled={!importFile || importing}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {importing ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Add Data Point Modal */}
      {showDataModal && selectedMetric && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Add Data Point</h2>
              <button
                onClick={() => setShowDataModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Metric</p>
              <p className="font-semibold text-gray-900">{selectedMetric.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                Current data points: {selectedMetric.data_points_count || 0}
              </p>
            </div>

            <form onSubmit={handleAddDataPoint} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value ({selectedMetric.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={dataPoint.value}
                  onChange={(e) => setDataPoint({ ...dataPoint, value: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={dataPoint.timestamp}
                  onChange={(e) => setDataPoint({ ...dataPoint, timestamp: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowDataModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  Add Data Point
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Data Source Import Modal */}
      {showDataSourceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Import from Data Sources</h2>
              <button
                onClick={() => setShowDataSourceModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Import Mode Toggle */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <label className="block text-sm font-medium text-gray-900 mb-3">Import Mode:</label>
              <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="columns"
                    checked={importMode === 'columns'}
                    onChange={(e) => setImportMode(e.target.value as 'rows' | 'columns')}
                    className="w-4 h-4 text-blue-600 cursor-pointer"
                  />
                  <span className="ml-2 text-sm text-gray-900">
                    <strong>Column-based</strong> - Each column is a metric
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="rows"
                    checked={importMode === 'rows'}
                    onChange={(e) => setImportMode(e.target.value as 'rows' | 'columns')}
                    className="w-4 h-4 text-blue-600 cursor-pointer"
                  />
                  <span className="ml-2 text-sm text-gray-900">
                    <strong>Row-based</strong> - Each row is a metric
                  </span>
                </label>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                {importMode === 'columns' 
                  ? '📊 Perfect for time-series data where columns represent different metrics'
                  : '📋 Perfect for lists where each row describes a different metric'}
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Select a data source to automatically import metrics.
            </p>

            <div className="space-y-3">
              {dataSources.map((source) => (
                <div key={source.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                  <div>
                    <h3 className="font-medium text-gray-900">{source.name}</h3>
                    <p className="text-sm text-gray-600">
                      {source.type.toUpperCase()} • {source.records_count.toLocaleString()} records
                    </p>
                  </div>
                  <button
                    onClick={() => handleImportFromDataSource(source.id)}
                    disabled={importing}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {importing ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Importing...
                      </>
                    ) : (
                      <>
                        <i className="ri-download-2-line mr-2"></i>
                        Import Metrics
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {dataSources.length === 0 && (
              <div className="text-center py-8">
                <i className="ri-database-2-line text-4xl text-gray-300 mb-3"></i>
                <p className="text-gray-600 mb-2">No data sources available</p>
                <p className="text-sm text-gray-500">Upload data files in Data Integration first</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Import Metrics</h2>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportStep('select');
                  setSelectedFile(null);
                  setSelectedDataSource('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center mb-8">
              <div className={`flex items-center ${importStep === 'select' ? 'text-blue-600' : 'text-gray-500'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${
                  importStep === 'select' ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  1
                </div>
                <span className="font-medium">Select Source</span>
              </div>
              <div className="flex-1 h-px bg-gray-300 mx-4"></div>
              <div className={`flex items-center ${importStep === 'mapping' ? 'text-blue-600' : 'text-gray-500'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${
                  importStep === 'mapping' ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  2
                </div>
                <span className="font-medium">Map Columns</span>
              </div>
              <div className="flex-1 h-px bg-gray-300 mx-4"></div>
              <div className={`flex items-center ${importStep === 'preview' ? 'text-blue-600' : 'text-gray-500'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${
                  importStep === 'preview' ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  3
                </div>
                <span className="font-medium">Preview & Import</span>
              </div>
            </div>

            {/* Step 1: Select Source */}
            {importStep === 'select' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Choose Data Source</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* File Upload */}
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                      <div className="w-12 h-12 mx-auto bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                        <i className="ri-file-upload-line text-xl text-blue-600"></i>
                      </div>
                      <h4 className="font-medium mb-2">Upload CSV File</h4>
                      <p className="text-sm text-gray-500 mb-4">Upload a CSV file with your metrics data</p>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="csv-upload"
                      />
                      <label
                        htmlFor="csv-upload"
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-upload-line mr-2"></i>
                        Choose File
                      </label>
                    </div>

                    {/* Data Sources */}
                    <div className="border border-gray-300 rounded-lg p-6">
                      <div className="w-12 h-12 mx-auto bg-green-100 rounded-lg flex items-center justify-center mb-4">
                        <i className="ri-database-2-line text-xl text-green-600"></i>
                      </div>
                      <h4 className="font-medium mb-2">Existing Data Sources</h4>
                      <p className="text-sm text-gray-500 mb-4">Import from connected data sources</p>
                      {dataSources.length > 0 ? (
                        <select
                          value={selectedDataSource}
                          onChange={(e) => handleDataSourceSelect(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select data source</option>
                          {dataSources.map(source => (
                            <option key={source.id} value={source.id}>
                              {source.name} ({source.source_type})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm text-gray-400">No data sources available</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Column Mapping */}
            {importStep === 'mapping' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Map Your Columns</h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Select which columns contain your metric names, values, and units. The metric name column is required.
                  </p>

                  <div className="grid md:grid-cols-3 gap-6">
                    {/* Metric Name Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Metric Name Column *
                      </label>
                      <select
                        value={columnMapping.nameColumn}
                        onChange={(e) => setColumnMapping(prev => ({ ...prev, nameColumn: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="">Select column</option>
                        {availableColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>

                    {/* Value Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Value Column
                      </label>
                      <select
                        value={columnMapping.valueColumn}
                        onChange={(e) => setColumnMapping(prev => ({ ...prev, valueColumn: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select column (optional)</option>
                        {availableColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>

                    {/* Unit Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Unit Column
                      </label>
                      <select
                        value={columnMapping.unitColumn}
                        onChange={(e) => setColumnMapping(prev => ({ ...prev, unitColumn: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select column (optional)</option>
                        {availableColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Preview */}
                  {columnMapping.nameColumn && (
                    <div className="mt-6">
                      <h4 className="font-medium mb-3">Preview (first 5 rows)</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full border border-gray-300">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 border-b">Metric Name</th>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 border-b">Value</th>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 border-b">Unit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importData.slice(0, 5).map((row, index) => (
                              <tr key={index} className="border-b">
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  {row[columnMapping.nameColumn] || '-'}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  {columnMapping.valueColumn ? (row[columnMapping.valueColumn] || '0') : '0'}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  {columnMapping.unitColumn ? (row[columnMapping.unitColumn] || '-') : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-between">
                  <button
                    onClick={() => setImportStep('select')}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 whitespace-nowrap"
                  >
                    <i className="ri-arrow-left-line mr-2"></i>
                    Back
                  </button>
                  <button
                    onClick={handleImportMetrics}
                    disabled={!columnMapping.nameColumn}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Import Metrics
                    <i className="ri-download-line ml-2"></i>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Metric?"
        message="Are you sure you want to delete this metric? This action cannot be undone."
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
        isOpen={clearAllConfirmOpen}
        title="Clear All Metrics?"
        message="Are you absolutely sure you want to delete ALL metrics? This will permanently delete all metrics and their historical data. This action cannot be undone."
        confirmText="Delete All"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleClearAllConfirm}
        onCancel={() => setClearAllConfirmOpen(false)}
      />
    </div>
  );
}
