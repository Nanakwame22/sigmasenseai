import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';

interface UploadedFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
}

interface QualityCheck {
  id: string;
  file_id: string;
  check_name: string;
  check_type: string;
  threshold: number;
  status: string;
  created_at: string;
  uploaded_files?: UploadedFile;
}

interface QualityResult {
  id: string;
  check_id: string;
  quality_score: number;
  records_checked: number;
  records_passed: number;
  records_failed: number;
  issues_found: any[];
  executed_at: string;
}

const DataQualityPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [checks, setChecks] = useState<QualityCheck[]>([]);
  const [results, setResults] = useState<{ [key: string]: QualityResult[] }>({});
  const [isRunning, setIsRunning] = useState<{ [key: string]: boolean }>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCheck, setNewCheck] = useState({
    file_id: '',
    check_name: '',
    check_type: 'completeness',
    threshold: 95
  });

  useEffect(() => {
    if (user) {
      fetchOrganization();
    }
  }, [user]);

  useEffect(() => {
    if (organizationId) {
      fetchData(organizationId);
    }
  }, [organizationId]);

  const fetchOrganization = async () => {
    const { data } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user?.id)
      .single();
    
    if (data) {
      setOrganizationId(data.organization_id);
    }
  };

  const fetchData = async (orgId: string) => {
    // Fetch uploaded files
    const { data: filesData } = await supabase
      .from('uploaded_files')
      .select('*')
      .eq('organization_id', orgId)
      .order('uploaded_at', { ascending: false });
    
    if (filesData) setFiles(filesData);

    // Fetch quality checks
    const { data: checksData } = await supabase
      .from('data_quality_checks')
      .select(`
        *,
        uploaded_files (
          id,
          file_name,
          file_type,
          file_size,
          uploaded_at
        )
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    
    if (checksData) setChecks(checksData);

    // Fetch results for each check
    if (checksData) {
      const resultsMap: { [key: string]: QualityResult[] } = {};
      for (const check of checksData) {
        const { data: resultsData } = await supabase
          .from('data_quality_results')
          .select('*')
          .eq('check_id', check.id)
          .order('executed_at', { ascending: false })
          .limit(5);
        
        if (resultsData) {
          resultsMap[check.id] = resultsData;
        }
      }
      setResults(resultsMap);
    }
  };

  const handleCreateCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!organizationId) return;

    const { error } = await supabase
      .from('data_quality_checks')
      .insert([{
        organization_id: organizationId,
        file_id: newCheck.file_id,
        check_name: newCheck.check_name,
        check_type: newCheck.check_type,
        threshold: newCheck.threshold,
        status: 'pending'
      }]);

    if (error) {
      console.error('Error creating check:', error);
      showToast('Failed to create quality check', 'error');
      return;
    }

    showToast('Quality check created successfully', 'success');
    setShowAddModal(false);
    setNewCheck({
      file_id: '',
      check_name: '',
      check_type: 'completeness',
      threshold: 95
    });
    
    await fetchData(organizationId);
  };

  const handleRunCheck = async (check: QualityCheck) => {
    setIsRunning({ ...isRunning, [check.id]: true });

    try {
      // Call the edge function to analyze file quality
      const { data, error } = await supabase.functions.invoke('analyze-file-quality', {
        body: {
          fileId: check.file_id,
          checkType: check.check_type,
        }
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        
        let errorMessage = 'Failed to analyze file';
        
        if (error.context) {
          try {
            const errorData = typeof error.context === 'string' ? JSON.parse(error.context) : error.context;
            errorMessage = errorData.error || errorData.message || errorMessage;
            if (errorData.details) {
              errorMessage += '\n\nDetails: ' + errorData.details;
            }
          } catch (e) {
            console.error('Failed to parse error context:', e);
          }
        }
        
        throw new Error(errorMessage);
      }

      if (data?.error) {
        console.error('Edge function returned error:', data.error, data.details);
        throw new Error(data.error + (data.details ? ': ' + data.details : ''));
      }

      const result = data.result || data;

      if (!result || typeof result.quality_score === 'undefined') {
        console.error('Invalid response from edge function:', data);
        throw new Error('Invalid response from quality check service');
      }

      // Save the result
      const { data: resultData, error: resultError } = await supabase
        .from('data_quality_results')
        .insert([{
          check_id: check.id,
          quality_score: result.quality_score,
          records_checked: result.records_checked,
          records_passed: result.records_passed,
          records_failed: result.records_failed,
          issues_found: result.issues_found || [],
          executed_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (resultError) throw resultError;

      setResults({
        ...results,
        [check.id]: [resultData, ...(results[check.id] || [])]
      });

      const threshold = check.threshold || 80;
      await supabase
        .from('data_quality_checks')
        .update({ status: result.quality_score >= threshold ? 'passed' : 'failed' })
        .eq('id', check.id);

      if (organizationId) {
        await fetchData(organizationId);
      }

      showToast(
        `Quality check completed!\n\nScore: ${result.quality_score}%\nRecords checked: ${result.records_checked}\nPassed: ${result.records_passed}\nFailed: ${result.records_failed}`,
        'success'
      );

    } catch (error: any) {
      console.error('Error running check:', error);
      showToast(
        `Failed to run quality check: ${error.message || 'Unknown error'}`,
        'error'
      );
    } finally {
      setIsRunning({ ...isRunning, [check.id]: false });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 95) return 'text-green-600';
    if (score >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Quality</h1>
          <p className="text-sm text-gray-600 mt-1">Monitor and validate your data quality</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Add Quality Check
        </button>
      </div>

      {/* Quality Checks List */}
      <div className="space-y-4">
        {checks.map((check) => (
          <div key={check.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{check.check_name}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  File: {check.uploaded_files?.file_name || 'Unknown'}
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-sm text-gray-600">
                    Type: <span className="font-medium capitalize">{check.check_type}</span>
                  </span>
                  <span className="text-sm text-gray-600">
                    Threshold: <span className="font-medium">{check.threshold}%</span>
                  </span>
                  <span className={`text-sm px-3 py-1 rounded-full font-medium ${getStatusColor(check.status)}`}>
                    {check.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleRunCheck(check)}
                disabled={isRunning[check.id]}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isRunning[check.id] ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Running...
                  </>
                ) : (
                  <>
                    <i className="ri-play-line mr-2"></i>
                    Run Check
                  </>
                )}
              </button>
            </div>

            {/* Results */}
            {results[check.id] && results[check.id].length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Results</h4>
                <div className="space-y-2">
                  {results[check.id].map((result) => (
                    <div key={result.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-4">
                        <div className={`text-2xl font-bold ${getScoreColor(result.quality_score)}`}>
                          {result.quality_score}%
                        </div>
                        <div className="text-sm text-gray-600">
                          <div>Records: {result.records_checked}</div>
                          <div className="flex gap-3">
                            <span className="text-green-600">✓ {result.records_passed}</span>
                            <span className="text-red-600">✗ {result.records_failed}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(result.executed_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {checks.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <i className="ri-file-check-line text-6xl text-gray-300 mb-4"></i>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Quality Checks Yet</h3>
            <p className="text-gray-600 mb-4">Create your first quality check to start monitoring your data</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              Add Quality Check
            </button>
          </div>
        )}
      </div>

      {/* Add Check Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Add Quality Check</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>
            <form onSubmit={handleCreateCheck} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select File
                  </label>
                  <select
                    value={newCheck.file_id}
                    onChange={(e) => setNewCheck({ ...newCheck, file_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  >
                    <option value="">Choose a file...</option>
                    {files.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.file_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Check Name
                  </label>
                  <input
                    type="text"
                    value={newCheck.check_name}
                    onChange={(e) => setNewCheck({ ...newCheck, check_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="e.g., Monthly Data Validation"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Check Type
                  </label>
                  <select
                    value={newCheck.check_type}
                    onChange={(e) => setNewCheck({ ...newCheck, check_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="completeness">Completeness</option>
                    <option value="accuracy">Accuracy</option>
                    <option value="consistency">Consistency</option>
                    <option value="validity">Validity</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quality Threshold (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newCheck.threshold}
                    onChange={(e) => setNewCheck({ ...newCheck, threshold: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  Create Check
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataQualityPage;