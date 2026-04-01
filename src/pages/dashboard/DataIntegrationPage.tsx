import { useState, useEffect } from 'react';
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
}

type TabType = 'file' | 'api';
type AuthType = 'none' | 'api_key' | 'bearer' | 'basic';

export default function DataIntegrationPage() {
  const { user, organizationId } = useAuth();
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

  useEffect(() => {
    if (organizationId) {
      fetchDataSources();
    } else {
      setLoading(false);
    }
  }, [organizationId]);

  const fetchDataSources = async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('data_sources')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching data sources:', error);
        setErrorMessage('Failed to load data sources');
      } else {
        setDataSources(data || []);
      }
    } catch (error) {
      console.error('Error fetching data sources:', error);
      setErrorMessage('Failed to load data sources');
    } finally {
      setLoading(false);
    }
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
            columns: Object.keys(parsedData[0] || {})
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
      const connectionConfig = {
        base_url: apiBaseUrl,
        http_method: httpMethod,
        auth_type: authType,
        auth_key_name: authKeyName,
        auth_key_value: authKeyValue,
        custom_headers: customHeaders.filter(h => h.key && h.value),
        json_path: jsonPath,
        created_date: new Date().toISOString()
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
          status: 'active'
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
    <div className="p-6">
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
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Data Integration</h1>
            <p className="text-slate-600">Connect and manage your data sources</p>
          </div>
          <button
            onClick={() => {
              setShowAddModal(true);
              setActiveTab('file');
              resetApiForm();
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <i className="ri-add-line text-xl"></i>
            Add Data Source
          </button>
        </div>

        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <i className="ri-bar-chart-grouped-line text-2xl text-white"></i>
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Auto-Aggregate KPIs From Raw Data</h3>
                <p className="text-sm text-slate-600">Transform your uploaded data into actionable KPI time-series automatically</p>
              </div>
            </div>
            <a
              href="/dashboard/kpi-aggregation"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 whitespace-nowrap"
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

      {/* Data Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dataSources.map((source) => (
          <div key={source.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <div className={`w-12 h-12 ${source.type === 'api' ? 'bg-purple-100' : 'bg-teal-100'} rounded-lg flex items-center justify-center`}>
                  <i className={`${source.type === 'api' ? 'ri-cloud-line' : 'ri-file-text-line'} text-2xl ${source.type === 'api' ? 'text-purple-600' : 'text-teal-600'}`}></i>
                </div>
                <div className="ml-3">
                  <h3 className="font-semibold text-gray-900 text-sm">{source.name}</h3>
                  <p className="text-xs text-gray-500">{source.type === 'api' ? 'API' : source.type.toUpperCase()}</p>
                </div>
              </div>
              <div className="flex space-x-2">
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

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Status:</span>
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
                <span className="text-gray-600">Last Sync:</span>
                <span className="font-medium text-gray-900">
                  {source.last_sync ? new Date(source.last_sync).toLocaleDateString() : 'Never'}
                </span>
              </div>
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

      {/* Add Data Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
              <h2 className="text-xl font-bold text-gray-900">Add Data Source</h2>
              
              {/* Tabs */}
              <div className="flex gap-4 mt-4">
                <button
                  onClick={() => setActiveTab('file')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'file'
                      ? 'bg-teal-100 text-teal-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <i className="ri-file-upload-line mr-2"></i>
                  Upload File
                </button>
                <button
                  onClick={() => setActiveTab('api')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'api'
                      ? 'bg-purple-100 text-purple-700'
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
